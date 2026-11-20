import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers'
import type { GeneratedScriptData, WorkflowParams } from './types'
import { WorkflowEntrypoint } from 'cloudflare:workers'
import { getCalendarDate, parseTimezoneOffset } from '@/worker/workflow-security'
import {
  buildDialogueTimings,
  computeWavSegmentDurationMs,
  createPcmWavHeader,
  planAudioMultipartUpload,
  uploadAudioMultipartPart,
  WAV_HEADER_BYTES,
} from './audio-multipart'
import {
  AUDIO_BATCH_STEP_CONFIG,
  buildAudioBatchKey,
  buildAudioMultipartStateKey,
  buildAudioSegmentKey,
  buildRssCacheKey,
  IO_STEP_CONFIG,
  isAudioCheckpointForInstance,
  MAX_TTS_SEGMENT_CHARS,
  splitDialogueText,
} from './efficiency'
import synthesize, { resolveTtsProvider } from './tts'

interface Env extends CloudflareEnv {
  WORKER_ENV?: string
  HACKER_NEWS_KV: KVNamespace
  HACKER_NEWS_R2: R2Bucket
  // TTS & Audio config
  TTS_PROVIDER?: string
  TTS_API_URL?: string
  TTS_API_ID?: string
  TTS_API_KEY?: string
  TTS_API_SECRET?: string
  TTS_MODEL?: string
  MAN_VOICE_ID?: string
  WOMAN_VOICE_ID?: string
  AUDIO_SPEED?: string
  // 新增時區設定
  TIMEZONE_OFFSET?: string
  TIMEZONE_NAME?: string
  // Gemini TTS
  GEMINI_TTS_API_KEY?: string
  GEMINI_TTS_API_SECRET?: string
  GEMINI_TTS_MODEL?: string
  GEMINI_TTS_FALLBACK_API_KEY?: string
  GEMINI_TTS_FALLBACK_API_SECRET?: string
}

const TTS_RATE_LIMIT_DELAY_MS = 400

interface AudioMultipartCheckpoint {
  version: 1
  podcastKey: string
  uploadId: string
}

function parseAudioMultipartCheckpoint(value: unknown, podcastKey: string): AudioMultipartCheckpoint | null {
  if (!value || typeof value !== 'object')
    return null

  const checkpoint = value as Partial<AudioMultipartCheckpoint>
  if (
    checkpoint.version !== 1
    || checkpoint.podcastKey !== podcastKey
    || typeof checkpoint.uploadId !== 'string'
    || !checkpoint.uploadId
  ) {
    return null
  }
  return checkpoint as AudioMultipartCheckpoint
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Combines multiple audio buffers into one.
 * Handles WAV format specifically by stripping headers and concatenating PCM data.
 * For other formats (like MP3), it performs simple concatenation.
 */
function combineAudioBuffers(buffers: Uint8Array[], isWav: boolean): Uint8Array {
  if (buffers.length === 0)
    return new Uint8Array(0)

  if (isWav) {
    // WAV concatenation: Strip 44-byte header from each and assemble PCM directly into one buffer.
    let totalPcmLength = 0
    for (const buffer of buffers) {
      if (buffer.byteLength > WAV_HEADER_BYTES) {
        totalPcmLength += buffer.byteLength - WAV_HEADER_BYTES
      }
    }

    const header = createPcmWavHeader(totalPcmLength)
    const combined = new Uint8Array(WAV_HEADER_BYTES + totalPcmLength)
    combined.set(header, 0)

    let offset = WAV_HEADER_BYTES
    for (const buffer of buffers) {
      if (buffer.byteLength > WAV_HEADER_BYTES) {
        const pcmPart = buffer.subarray(WAV_HEADER_BYTES)
        combined.set(pcmPart, offset)
        offset += pcmPart.byteLength
      }
    }

    return combined
  }
  else {
    // Simple concatenation for MP3
    const totalLength = buffers.reduce((total, buffer) => total + buffer.byteLength, 0)
    const combined = new Uint8Array(totalLength)
    let offset = 0
    for (const buffer of buffers) {
      combined.set(buffer, offset)
      offset += buffer.byteLength
    }
    return combined
  }
}

export class PodcastAudioWorkflow extends WorkflowEntrypoint<Env, WorkflowParams> {
  async run(event: WorkflowEvent<WorkflowParams>, step: WorkflowStep) {
    console.info('trigged event: PodcastAudioWorkflow', event)

    const runEnv = this.env.WORKER_ENV || 'production'
    const params = event.payload || {}

    // Handle variant/type mapping
    let variant = params.variant || params.type || 'hacker-news'
    if (variant === 'main')
      variant = 'hacker-news'

    const isEnglish = variant === 'en'

    // Check if using Gemini TTS (which outputs WAV); default resolves to Gemini when unset
    const isGeminiTTS = resolveTtsProvider(this.env.TTS_PROVIDER) === 'gemini'

    // 時區處理邏輯
    const now = new Date(event.timestamp.getTime())
    const timezoneOffset = parseTimezoneOffset(this.env.TIMEZONE_OFFSET)
    const localToday = getCalendarDate(now, timezoneOffset)

    const userSpecifiedDate = params.today
    const displayDate = userSpecifiedDate || localToday

    const scriptKey = `script:${runEnv}:${variant}:${displayDate}`
    const rssCacheKey = buildRssCacheKey(runEnv, variant)

    // 1. Load Script from KV
    const scriptData = await step.do('load script from kv', IO_STEP_CONFIG, async () => {
      const data = await this.env.HACKER_NEWS_KV.get(scriptKey)
      if (!data) {
        throw new Error(`Script not found in KV: ${scriptKey}`)
      }
      return JSON.parse(data) as GeneratedScriptData
    })

    const dialogue = scriptData.dialogue
    if (!dialogue || dialogue.length === 0) {
      console.warn('Dialogue is empty, aborting audio generation')
      return
    }

    // Output R2 Key: If forced rerun, append deterministic workflow event timestamp for CDN edge cache busting
    const isForced = Boolean(params.force)
    const basePodcastKey = `${displayDate.replaceAll('-', '/')}/${runEnv}/${variant}-${displayDate}.mp3`
    const podcastKey = params.audioKey || (isForced
      ? `${displayDate.replaceAll('-', '/')}/${runEnv}/${variant}-${displayDate}-${scriptData.generatedAt || event.timestamp.getTime()}.mp3`
      : basePodcastKey)

    console.info('Audio Generation Config:', {
      variant,
      displayDate,
      scriptKey,
      podcastKey,
      isGeminiTTS,
      isForced,
    })

    console.info(`Loaded script with ${dialogue.length} lines`)

    // 2. Flatten and chunk all dialogue (keeping original dialogueIndex for exact timing reconstruction)
    const allSegments: { text: string, speaker: '男' | '女', dialogueIndex: number }[] = []
    for (const [dialogueIndex, line] of dialogue.entries()) {
      const text = line.text.trim()
      if (!text)
        continue
      const chunks = splitDialogueText(text, isEnglish ? 1000 : MAX_TTS_SEGMENT_CHARS)
      for (const chunk of chunks) {
        allSegments.push({ text: chunk, speaker: line.speaker, dialogueIndex })
      }
    }

    // 3. Process in batches
    const BATCH_SIZE = 5
    const batchKeys: string[] = []
    const segmentCheckpointKeys: string[] = []
    const allSegmentDurationsMs: number[] = []
    let hasAllSegmentDurations = isGeminiTTS

    for (let i = 0; i < allSegments.length; i += BATCH_SIZE) {
      const batchIndex = Math.floor(i / BATCH_SIZE)
      const batchSegments = allSegments.slice(i, i + BATCH_SIZE)

      const batchKeyInput = {
        displayDate,
        runEnv,
        variant,
        instanceId: event.instanceId,
        batchIndex,
      }
      const deterministicBatchKey = buildAudioBatchKey(batchKeyInput)
      const segmentKeys = batchSegments.map((_, index) =>
        buildAudioSegmentKey({ ...batchKeyInput, segmentIndex: index }),
      )
      segmentCheckpointKeys.push(...segmentKeys)

      // To avoid exceeding Cloudflare Workers Free limit (50 external subrequests per invocation),
      // suspend every 2 batches (<= 10 TTS calls plus any key failover attempts per invocation).
      if (batchIndex > 0 && batchIndex % 2 === 0) {
        await step.sleep(`pause before audio batch ${batchIndex + 1}`, '1 second')
      }

      const batchResult = await step.do(`create audio batch ${batchIndex + 1}`, AUDIO_BATCH_STEP_CONFIG, async () => {
        const existingBatch = await this.env.HACKER_NEWS_R2.head(deterministicBatchKey)
        if (existingBatch) {
          let existingDurations: number[] | null = null
          const rawDurations = existingBatch.customMetadata?.segmentDurationsMs
          if (rawDurations) {
            try {
              const parsed = JSON.parse(rawDurations) as unknown
              if (
                Array.isArray(parsed)
                && parsed.length === batchSegments.length
                && parsed.every(item => typeof item === 'number' && Number.isFinite(item) && item >= 0)
              ) {
                existingDurations = parsed
              }
            }
            catch {
              existingDurations = null
            }
          }
          return {
            key: deterministicBatchKey,
            segmentDurationsMs: existingDurations,
          }
        }

        const segmentBuffers: Uint8Array[] = []
        const segmentDurationsMs: number[] | null = isGeminiTTS ? [] : null

        for (const [index, segment] of batchSegments.entries()) {
          const segmentKey = segmentKeys[index]
          const checkpoint = await this.env.HACKER_NEWS_R2.get(segmentKey)
          if (checkpoint) {
            const buffer = new Uint8Array(await checkpoint.arrayBuffer())
            segmentBuffers.push(buffer)
            if (segmentDurationsMs) {
              segmentDurationsMs.push(computeWavSegmentDurationMs(buffer.byteLength))
            }
            continue
          }

          const audio = await synthesize(segment.text, segment.speaker, this.env, { isEnglish })
          const typedBuffer = new Uint8Array(await audio.arrayBuffer())
          if (!typedBuffer.byteLength) {
            throw new Error('podcast audio size is 0')
          }

          await this.env.HACKER_NEWS_R2.put(segmentKey, typedBuffer)
          segmentBuffers.push(typedBuffer)
          if (segmentDurationsMs) {
            segmentDurationsMs.push(computeWavSegmentDurationMs(typedBuffer.byteLength))
          }

          // Rate limit between segments
          if (index < batchSegments.length - 1) {
            await sleep(TTS_RATE_LIMIT_DELAY_MS)
          }
        }

        // Combine batch
        const combined = combineAudioBuffers(segmentBuffers, isGeminiTTS)

        await this.env.HACKER_NEWS_R2.put(
          deterministicBatchKey,
          combined,
          segmentDurationsMs
            ? { customMetadata: { segmentDurationsMs: JSON.stringify(segmentDurationsMs) } }
            : undefined,
        )
        return {
          key: deterministicBatchKey,
          segmentDurationsMs,
        }
      })

      batchKeys.push(batchResult.key)
      if (hasAllSegmentDurations && batchResult.segmentDurationsMs) {
        allSegmentDurationsMs.push(...batchResult.segmentDurationsMs)
      }
      else {
        hasAllSegmentDurations = false
      }
    }

    const timingSummary = hasAllSegmentDurations
      ? buildDialogueTimings(
          dialogue.length,
          allSegments.map(segment => segment.dialogueIndex),
          allSegmentDurationsMs,
        )
      : null

    // 4. Merge all batches with bounded-memory R2 multipart streams.
    const completedAudioLength = await step.do('check final audio checkpoint', IO_STEP_CONFIG, async () => {
      const existingAudio = await this.env.HACKER_NEWS_R2.head(podcastKey)
      if (isAudioCheckpointForInstance(existingAudio, event.instanceId)) {
        return existingAudio?.size || 0
      }
      return null
    })

    const multipartStateKey = buildAudioMultipartStateKey({
      displayDate,
      runEnv,
      variant,
      instanceId: event.instanceId,
      batchIndex: 0,
    })
    let totalLength = completedAudioLength ?? 0

    if (completedAudioLength === null) {
      const multipartPlan = await step.do('plan audio multipart upload', IO_STEP_CONFIG, async () => {
        const batches: Array<{ key: string, size: number }> = []
        for (const key of batchKeys) {
          const object = await this.env.HACKER_NEWS_R2.head(key)
          if (!object)
            throw new Error(`Missing batch file: ${key}`)
          batches.push({ key, size: object.size })
        }
        return planAudioMultipartUpload(batches, isGeminiTTS)
      })

      const uploadId = await step.do('create audio multipart upload', IO_STEP_CONFIG, async () => {
        const storedCheckpoint = await this.env.HACKER_NEWS_R2.get(multipartStateKey)
        if (storedCheckpoint) {
          const checkpoint = parseAudioMultipartCheckpoint(await storedCheckpoint.json(), podcastKey)
          if (!checkpoint) {
            throw new Error(`Invalid audio multipart checkpoint: ${multipartStateKey}`)
          }
          return checkpoint.uploadId
        }

        const multipart = await this.env.HACKER_NEWS_R2.createMultipartUpload(podcastKey, {
          httpMetadata: {
            contentType: isGeminiTTS ? 'audio/wav' : 'audio/mpeg',
            cacheControl: 'public, max-age=31536000, immutable',
          },
          customMetadata: { workflowInstanceId: event.instanceId },
        })
        const checkpoint: AudioMultipartCheckpoint = {
          version: 1,
          podcastKey,
          uploadId: multipart.uploadId,
        }
        await this.env.HACKER_NEWS_R2.put(multipartStateKey, JSON.stringify(checkpoint))
        return multipart.uploadId
      })

      const uploadedParts: R2UploadedPart[] = []
      const wavHeader = isGeminiTTS
        ? createPcmWavHeader(multipartPlan.pcmLength)
        : new Uint8Array(0)

      try {
        for (const part of multipartPlan.parts) {
          const uploadedPart = await step.do(
            `upload audio multipart part ${part.partNumber}`,
            AUDIO_BATCH_STEP_CONFIG,
            async () => {
              const multipart = this.env.HACKER_NEWS_R2.resumeMultipartUpload(podcastKey, uploadId)
              return uploadAudioMultipartPart(
                this.env.HACKER_NEWS_R2,
                multipart,
                part,
                wavHeader,
              )
            },
          )
          uploadedParts.push(uploadedPart)
        }

        totalLength = await step.do('complete audio multipart upload', AUDIO_BATCH_STEP_CONFIG, async () => {
          const existingAudio = await this.env.HACKER_NEWS_R2.head(podcastKey)
          if (isAudioCheckpointForInstance(existingAudio, event.instanceId)) {
            return existingAudio?.size || 0
          }

          const multipart = this.env.HACKER_NEWS_R2.resumeMultipartUpload(podcastKey, uploadId)
          const completed = await multipart.complete(uploadedParts)
          if (completed.size !== multipartPlan.totalLength) {
            throw new Error(`Completed audio size mismatch: expected ${multipartPlan.totalLength}, received ${completed.size}`)
          }
          return completed.size
        })
      }
      catch (error) {
        try {
          await step.do('abort failed audio multipart upload', IO_STEP_CONFIG, async () => {
            const existingAudio = await this.env.HACKER_NEWS_R2.head(podcastKey)
            if (!isAudioCheckpointForInstance(existingAudio, event.instanceId)) {
              const multipart = this.env.HACKER_NEWS_R2.resumeMultipartUpload(podcastKey, uploadId)
              await multipart.abort()
            }
            await this.env.HACKER_NEWS_R2.delete(multipartStateKey)
          })
        }
        catch (abortError) {
          console.warn('Failed to abort audio multipart upload', { abortError })
        }
        throw error
      }
    }

    // Publish metadata & RSS cache invalidation in a durable step so partial failures
    // never leave a newly synthesized episode unpublished.
    await step.do('publish final audio metadata', IO_STEP_CONFIG, async () => {
      const shouldUpdateScript = scriptData.audio !== podcastKey
        || Boolean(timingSummary && (
          !scriptData.dialogueTimings
          || scriptData.audioDurationSec !== timingSummary.audioDurationSec
        ))

      if (shouldUpdateScript) {
        scriptData.audio = podcastKey
        if (timingSummary) {
          scriptData.dialogueTimings = timingSummary.dialogueTimings
          scriptData.audioDurationSec = timingSummary.audioDurationSec
        }
        await this.env.HACKER_NEWS_KV.put(scriptKey, JSON.stringify(scriptData))
      }

      if (podcastKey !== basePodcastKey) {
        const freshAudio = await this.env.HACKER_NEWS_R2.get(podcastKey)
        if (freshAudio) {
          const freshContentType = freshAudio.httpMetadata?.contentType || (isGeminiTTS ? 'audio/wav' : 'audio/mpeg')
          await this.env.HACKER_NEWS_R2.put(basePodcastKey, freshAudio.body, {
            httpMetadata: {
              contentType: freshContentType,
              cacheControl: 'public, max-age=60',
            },
          })
        }
      }

      await this.env.HACKER_NEWS_KV.delete(rssCacheKey)
    })

    try {
      await step.do('cleanup audio checkpoints', IO_STEP_CONFIG, async () => {
        await this.env.HACKER_NEWS_R2.delete([...batchKeys, ...segmentCheckpointKeys, multipartStateKey])
      })
    }
    catch (error) {
      // The final podcast is already published. Cleanup failure must not mark paid work as failed.
      console.warn('Failed to cleanup temporary audio checkpoints', { error })
    }

    console.info('Audio generation completed successfully', {
      podcastKey,
      totalBytes: totalLength,
    })

    return { podcastKey, totalLength }
  }
}
