import type { WorkflowEvent, WorkflowStep, WorkflowStepConfig } from 'cloudflare:workers'
import type { GeneratedScriptData, WorkflowParams } from './types'
import { WorkflowEntrypoint } from 'cloudflare:workers'
import synthesize, { pcmToWav } from './tts'

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
  // 新增時區配置
  TIMEZONE_OFFSET?: string
  TIMEZONE_NAME?: string
  // Gemini TTS
  GEMINI_TTS_API_KEY?: string
  GEMINI_TTS_API_SECRET?: string
  GEMINI_TTS_MODEL?: string
}

const retryConfig: WorkflowStepConfig = {
  retries: {
    limit: 5,
    delay: '10 seconds',
    backoff: 'exponential',
  },
  timeout: '3 minutes',
}

const MAX_TTS_SEGMENT_CHARS = 400
const TTS_RETRY_LIMIT = 3
const TTS_RETRY_BASE_DELAY_MS = 500
const TTS_RATE_LIMIT_DELAY_MS = 400

function chunkDialogueText(text: string, maxChars = MAX_TTS_SEGMENT_CHARS) {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return []
  }
  if (normalized.length <= maxChars) {
    return [normalized]
  }

  const sentences = normalized.match(/[^。！？!?；;]+[。！？!?；;]?/gu) || [normalized]
  const segments: string[] = []
  let current = ''

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim()
    if (!trimmedSentence) {
      continue
    }

    if ((current + trimmedSentence).length <= maxChars) {
      current += trimmedSentence
      continue
    }

    if (current) {
      segments.push(current.trim())
      current = ''
    }

    if (trimmedSentence.length <= maxChars) {
      current = trimmedSentence
      continue
    }

    for (let i = 0; i < trimmedSentence.length; i += maxChars) {
      const chunk = trimmedSentence.slice(i, i + maxChars).trim()
      if (chunk) {
        segments.push(chunk)
      }
    }
  }

  if (current) {
    segments.push(current.trim())
  }

  return segments
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
    // WAV concatenation: Strip 44-byte header from each, concat PCM, then wrapper with new header
    // 1. Calculate total PCM length
    let totalPcmLength = 0
    const pcmParts: Uint8Array[] = []

    for (const buffer of buffers) {
      if (buffer.byteLength > 44) {
        // Strip 44-byte WAV header
        const pcmPart = buffer.subarray(44)
        pcmParts.push(pcmPart)
        totalPcmLength += pcmPart.byteLength
      }
    }

    // 2. Concatenate PCM data
    const combinedPcm = new Uint8Array(totalPcmLength)
    let offset = 0
    for (const part of pcmParts) {
      combinedPcm.set(part, offset)
      offset += part.byteLength
    }

    // 3. Create new WAV file with correct header
    // pcmToWav returns ArrayBuffer, convert to Uint8Array
    return new Uint8Array(pcmToWav(combinedPcm))
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

    // Check if using Gemini TTS (which outputs WAV)
    const isGeminiTTS = this.env.TTS_PROVIDER === 'gemini'

    // 時區處理邏輯
    const now = new Date()
    const timezoneOffset = Number.parseInt(this.env.TIMEZONE_OFFSET || '+8')
    const localTime = new Date(now.getTime() + timezoneOffset * 60 * 60 * 1000)
    const localToday = localTime.toISOString().split('T')[0]

    const userSpecifiedDate = params.today
    const displayDate = userSpecifiedDate || localToday

    const scriptKey = `script:${runEnv}:${variant}:${displayDate}`

    // Output R2 Key
    const podcastKey = `${displayDate.replaceAll('-', '/')}/${runEnv}/${variant}-${displayDate}.mp3`

    console.info('Audio Generation Config:', {
      variant,
      displayDate,
      scriptKey,
      podcastKey,
      isGeminiTTS,
    })

    // 1. Load Script from KV
    const scriptData = await step.do('load script from kv', retryConfig, async () => {
      const data = await this.env.HACKER_NEWS_KV.get(scriptKey)
      if (!data) {
        throw new Error(`Script not found in KV: ${scriptKey}`)
      }
      return JSON.parse(data) as GeneratedScriptData
    })

    if (!scriptData.dialogue || scriptData.dialogue.length === 0) {
      console.warn('Dialogue is empty, aborting audio generation')
      return
    }

    console.info(`Loaded script with ${scriptData.dialogue.length} lines`)

    // 2. Flatten and chunk all dialogue
    const allSegments: { text: string, speaker: '男' | '女' }[] = []
    for (const line of scriptData.dialogue) {
      const text = line.text.trim()
      if (!text)
        continue
      const chunks = chunkDialogueText(text)
      for (const chunk of chunks) {
        allSegments.push({ text: chunk, speaker: line.speaker })
      }
    }

    // 3. Process in batches
    // Increase batch size to reduce total workflow steps.
    // Cloudflare limits subrequests per step, so 20 is safe (limit is 50).
    const BATCH_SIZE = 5
    const batchKeys: string[] = []

    for (let i = 0; i < allSegments.length; i += BATCH_SIZE) {
      const batchIndex = Math.floor(i / BATCH_SIZE)
      const batchSegments = allSegments.slice(i, i + BATCH_SIZE)

      // Use a larger timeout for TTS batch processing
      const batchKey = await step.do(`create audio batch ${batchIndex + 1}`, { ...retryConfig, timeout: '15 minutes' }, async () => {
        const segmentBuffers: Uint8Array[] = []

        for (const [index, segment] of batchSegments.entries()) {
          let attempt = 0
          while (true) {
            try {
              const audio = await synthesize(segment.text, segment.speaker, this.env)
              const arrayBuffer = await audio.arrayBuffer()
              const typedBuffer = new Uint8Array(arrayBuffer)

              if (!typedBuffer.byteLength) {
                throw new Error('podcast audio size is 0')
              }

              segmentBuffers.push(typedBuffer)
              break
            }
            catch (error) {
              attempt += 1
              if (attempt >= TTS_RETRY_LIMIT) {
                console.error('TTS synthesis failed after retries', { batchIndex, index, error })
                throw error
              }

              const delay = TTS_RETRY_BASE_DELAY_MS * attempt
              console.warn('TTS request failed, retrying', { batchIndex, index, attempt, delay })
              await sleep(delay)
            }
          }
          // Rate limit between segments
          if (index < batchSegments.length - 1) {
            await sleep(TTS_RATE_LIMIT_DELAY_MS)
          }
        }

        // Combine batch
        const combined = combineAudioBuffers(segmentBuffers, isGeminiTTS)

        // Upload batch to R2 (Temp)
        const key = `${displayDate.replaceAll('-', '/')}/${runEnv}/temp/${variant}-batch-${batchIndex}-${Date.now()}.mp3`
        await this.env.HACKER_NEWS_R2.put(key, combined)
        return key
      })

      batchKeys.push(batchKey)
    }

    // 4. Merge all batches
    const { totalLength } = await step.do('merge audio batches', { ...retryConfig, timeout: '10 minutes' }, async () => {
      const buffers: Uint8Array[] = []

      for (const key of batchKeys) {
        const object = await this.env.HACKER_NEWS_R2.get(key)
        if (!object)
          throw new Error(`Missing batch file: ${key}`)
        const arrayBuffer = await object.arrayBuffer()
        buffers.push(new Uint8Array(arrayBuffer))
      }

      const combined = combineAudioBuffers(buffers, isGeminiTTS)

      await this.env.HACKER_NEWS_R2.put(podcastKey, combined)

      // Cleanup temp files
      await Promise.all(batchKeys.map(key => this.env.HACKER_NEWS_R2.delete(key)))

      return {
        segmentCount: allSegments.length,
        totalLength: combined.byteLength,
      }
    })

    console.info('Audio generation completed successfully', {
      podcastKey,
      totalBytes: totalLength,
    })

    return { podcastKey, totalLength }
  }
}
