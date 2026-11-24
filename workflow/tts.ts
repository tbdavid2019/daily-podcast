import { Buffer } from 'node:buffer'
import { synthesize } from '@echristian/edge-tts'
import { getSpeakerVoiceConfig } from '@/lib/cast-registry'
import { createPcmWavHeader } from './audio-multipart'

export const DEFAULT_GEMINI_TTS_MODEL = 'gemini-3.8-flash-lite-tts'
export const DEFAULT_GEMINI_TTS_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
export const DEFAULT_GEMINI_TTS_TIMEOUT_MS = 45_000
export const DEFAULT_GEMINI_TTS_MAX_RETRIES = 0
export const MAX_GEMINI_TTS_FALLBACKS = 5

export interface GeminiTtsConfig {
  id: string
  apiKey: string
  model: string
  baseUrl?: string
}

export interface Env extends CloudflareEnv {
  TTS_PROVIDER?: string
  TTS_API_URL?: string
  TTS_API_ID?: string
  TTS_API_KEY?: string
  TTS_API_SECRET?: string
  TTS_MODEL?: string
  MAN_VOICE_ID?: string
  WOMAN_VOICE_ID?: string
  AUDIO_SPEED?: string
  OPENAI_TTS_API_KEY?: string
  OPENAI_TTS_API_SECRET?: string
  OPENAI_TTS_BASE_URL?: string
  OPENAI_TTS_MODEL?: string
  OPENAI_TTS_INSTRUCTIONS?: string
  OPENAI_BASE_URL?: string
  OPENAI_API_KEY?: string
  OPENAI_API_SECRET?: string
  GEMINI_TTS_API_KEY?: string
  GEMINI_TTS_API_SECRET?: string
  GEMINI_TTS_BASE_URL?: string
  GEMINI_TTS_MODEL?: string
  GEMINI_TTS_FALLBACK_API_KEY?: string
  GEMINI_TTS_FALLBACK_API_SECRET?: string
  GEMINI_TTS_FALLBACK_BASE_URL?: string
  GEMINI_TTS_FALLBACK_MODEL?: string
  GEMINI_API_KEY?: string
}

export function pcmToWav(pcmData: Uint8Array, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): ArrayBuffer {
  const header = createPcmWavHeader(pcmData.byteLength, sampleRate, numChannels, bitsPerSample)
  const buffer = new ArrayBuffer(header.byteLength + pcmData.byteLength)
  const out = new Uint8Array(buffer)
  out.set(header, 0)
  out.set(pcmData, header.byteLength)
  return buffer
}

function readString(env: object, key: string): string {
  const value = (env as Record<string, unknown>)[key]
  return typeof value === 'string' ? value.trim() : ''
}

function firstString(env: object, keys: readonly string[]): string {
  for (const key of keys) {
    const value = readString(env, key)
    if (value) {
      return value
    }
  }
  return ''
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

export function createGeminiTtsConfigs(env: object): GeminiTtsConfig[] {
  const defaultModel = firstString(env, ['GEMINI_TTS_MODEL']) || DEFAULT_GEMINI_TTS_MODEL
  const rawPrimaryBaseUrl = firstString(env, ['GEMINI_TTS_BASE_URL'])
  const primaryBaseUrl = rawPrimaryBaseUrl ? normalizeBaseUrl(rawPrimaryBaseUrl) : ''
  const configs: GeminiTtsConfig[] = []
  const seenConfigs = new Set<string>()

  // Primary key
  const primaryApiKey = firstString(env, [
    'GEMINI_TTS_API_SECRET',
    'GEMINI_TTS_API_KEY',
    'GEMINI_API_KEY',
  ])
  if (primaryApiKey) {
    configs.push({
      id: 'primary',
      apiKey: primaryApiKey,
      model: defaultModel,
      ...(primaryBaseUrl ? { baseUrl: primaryBaseUrl } : {}),
    })
    seenConfigs.add(`${primaryApiKey}::${primaryBaseUrl}`)
  }

  // Fallback single key
  const rawFallbackSingleBaseUrl = firstString(env, ['GEMINI_TTS_FALLBACK_BASE_URL'])
  const fallbackSingleBaseUrl = rawFallbackSingleBaseUrl
    ? normalizeBaseUrl(rawFallbackSingleBaseUrl)
    : primaryBaseUrl
  const fallbackSingleKey = firstString(env, [
    'GEMINI_TTS_FALLBACK_API_KEY',
    'GEMINI_TTS_FALLBACK_API_SECRET',
    'GEMINI_TTS_FALLBACK_KEY',
  ]) || (fallbackSingleBaseUrl && fallbackSingleBaseUrl !== primaryBaseUrl ? primaryApiKey : '')
  if (fallbackSingleKey && !seenConfigs.has(`${fallbackSingleKey}::${fallbackSingleBaseUrl}`)) {
    configs.push({
      id: 'fallback-1',
      apiKey: fallbackSingleKey,
      model: firstString(env, ['GEMINI_TTS_FALLBACK_MODEL']) || defaultModel,
      ...(fallbackSingleBaseUrl ? { baseUrl: fallbackSingleBaseUrl } : {}),
    })
    seenConfigs.add(`${fallbackSingleKey}::${fallbackSingleBaseUrl}`)
  }

  // Numbered slots: GEMINI_TTS_FALLBACK_1_API_KEY .. GEMINI_TTS_FALLBACK_5_API_KEY
  for (let index = 1; index <= MAX_GEMINI_TTS_FALLBACKS; index += 1) {
    const prefix = `GEMINI_TTS_FALLBACK_${index}`
    const rawSlotBaseUrl = firstString(env, [`${prefix}_BASE_URL`])
    const slotBaseUrl = rawSlotBaseUrl ? normalizeBaseUrl(rawSlotBaseUrl) : primaryBaseUrl
    const apiKey = firstString(env, [
      `${prefix}_API_KEY`,
      `${prefix}_API_SECRET`,
      `${prefix}_KEY`,
    ]) || (slotBaseUrl && slotBaseUrl !== primaryBaseUrl ? primaryApiKey : '')
    const dedupeKey = `${apiKey}::${slotBaseUrl}`
    if (!apiKey || seenConfigs.has(dedupeKey)) {
      continue
    }
    configs.push({
      id: `fallback-${index}`,
      apiKey,
      model: firstString(env, [`${prefix}_MODEL`]) || defaultModel,
      ...(slotBaseUrl ? { baseUrl: slotBaseUrl } : {}),
    })
    seenConfigs.add(dedupeKey)
  }

  return configs
}

export interface GeminiTtsRequestOptions {
  fetchFn?: typeof fetch
  timeoutMs?: number
}

export async function callSingleGeminiTts(
  text: string,
  gender: string,
  config: GeminiTtsConfig,
  env: Env,
  options: GeminiTtsRequestOptions = {},
): Promise<Blob> {
  const fetchFn = options.fetchFn || fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_GEMINI_TTS_TIMEOUT_MS
  const model = config.model || DEFAULT_GEMINI_TTS_MODEL
  const baseUrl = (config.baseUrl || DEFAULT_GEMINI_TTS_BASE_URL).replace(/\/+$/, '')
  const url = `${baseUrl}/models/${model}:generateContent`
  const { geminiVoice: voiceName } = getSpeakerVoiceConfig(gender, env)
  const isGemini38Tts = model.startsWith('gemini-3.8-') && model.endsWith('-tts')

  const payload = {
    contents: [{
      role: 'user',
      parts: [{ text }],
    }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      ...(isGemini38Tts && {
        responseFormat: {
          audio: {
            mimeType: 'AUDIO_L16',
            sampleRate: 24000,
          },
        },
      }),
      speechConfig: {
        voiceConfig: isGemini38Tts
          ? { voice: voiceName }
          : { prebuiltVoiceConfig: { voiceName } },
      },
    },
  }

  const signal = timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined

  const res = await fetchFn(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': config.apiKey,
    },
    body: JSON.stringify(payload),
    signal,
  })

  if (!res.ok) {
    const errorText = await res.text().catch(() => '')
    const error = Object.assign(
      new Error(`Gemini TTS API error (${res.status} ${res.statusText}): ${errorText}`),
      { statusCode: res.status },
    )
    throw error
  }

  const data = await res.json() as Record<string, any>
  const base64Audio = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data

  if (!base64Audio) {
    throw new Error('Gemini TTS response missing audio data')
  }

  const bytes = new Uint8Array(Buffer.from(base64Audio, 'base64'))

  const wavBuffer = pcmToWav(bytes, 24000, 1, 16)
  return new Blob([wavBuffer], { type: 'audio/wav' })
}

export interface GeminiTtsRunnerOptions extends GeminiTtsRequestOptions {
  maxRetriesPerKey?: number
  sleepFn?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

export function isGeminiLocationUnsupportedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }
  const candidate = error as Record<string, unknown>
  const statusCode = typeof candidate.statusCode === 'number'
    ? candidate.statusCode
    : typeof candidate.status === 'number'
      ? candidate.status
      : undefined
  const message = error instanceof Error
    ? error.message
    : typeof candidate.message === 'string'
      ? candidate.message
      : ''
  const isStatus400 = statusCode === 400 || /\(400\b/.test(message)
  return isStatus400 && /user location is not supported|failed_precondition/i.test(message)
}

export async function geminiTTS(
  text: string,
  gender: string,
  env: Env,
  options: GeminiTtsRunnerOptions = {},
): Promise<Blob> {
  const configs = createGeminiTtsConfigs(env)
  if (configs.length === 0) {
    throw new Error('Gemini TTS API key is missing (GEMINI_TTS_API_SECRET or GEMINI_TTS_API_KEY)')
  }

  const maxRetries = options.maxRetriesPerKey ?? DEFAULT_GEMINI_TTS_MAX_RETRIES
  const sleepFn = options.sleepFn || defaultSleep
  const blockedBaseUrls = new Set<string>()
  let lastError: unknown

  for (const config of configs) {
    const configBaseUrl = (config.baseUrl || DEFAULT_GEMINI_TTS_BASE_URL).replace(/\/+$/, '')
    if (blockedBaseUrls.has(configBaseUrl)) {
      continue
    }

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const result = await callSingleGeminiTts(text, gender, config, env, options)
        if (config.id !== 'primary' || attempt > 0) {
          console.info('Gemini TTS request succeeded', {
            provider: config.id,
            attempt: attempt + 1,
            textLength: text.length,
          })
        }
        return result
      }
      catch (error: unknown) {
        lastError = error
        const candidate = error as Record<string, unknown> | null
        const statusCode = typeof candidate?.statusCode === 'number'
          ? candidate.statusCode
          : typeof candidate?.status === 'number'
            ? candidate.status
            : undefined
        const isAuthError = statusCode === 401 || statusCode === 403
        const isBadRequest = statusCode === 400
        const isLocationBlocked = isGeminiLocationUnsupportedError(error)

        console.warn('Gemini TTS attempt failed', {
          provider: config.id,
          attempt: attempt + 1,
          maxAttempts: maxRetries + 1,
          statusCode,
          message: error instanceof Error ? error.message : String(error),
        })

        // If location is unsupported on this endpoint, skip remaining keys sharing this baseUrl
        if (isLocationBlocked) {
          blockedBaseUrls.add(configBaseUrl)
          break
        }

        // If it's an auth error (401/403), failover to next key immediately
        if (isAuthError) {
          break
        }

        // If it's a 400 bad request, fail immediately
        if (isBadRequest) {
          throw error
        }

        // If we have retries left on this key, back off and retry
        if (attempt < maxRetries) {
          const delayMs = Math.min(1000 * 2 ** attempt, 5000)
          await sleepFn(delayMs)
        }
      }
    }
  }

  throw lastError
}

async function edgeTTS(text: string, gender: string, env: Env, isEnglish = false) {
  const defaultMaleVoice = isEnglish ? 'en-US-GuyNeural' : 'zh-TW-YunJheNeural'
  const defaultFemaleVoice = isEnglish ? 'en-US-JennyNeural' : 'zh-TW-HsiaoChenNeural'
  const defaultCustomVoice = isEnglish ? 'en-US-AriaNeural' : 'zh-TW-HsiaoYuNeural'
  const defaultLang = isEnglish ? 'en-US' : 'zh-TW'
  const { role } = getSpeakerVoiceConfig(gender, env)
  const voice = role === 'male'
    ? (env.MAN_VOICE_ID || defaultMaleVoice)
    : role === 'female'
      ? (env.WOMAN_VOICE_ID || defaultFemaleVoice)
      : defaultCustomVoice

  const { audio } = await synthesize({
    text,
    language: defaultLang,
    voice,
    rate: env.AUDIO_SPEED || '10%',
  })
  return audio
}

async function minimaxTTS(text: string, gender: string, env: Env, isEnglish = false) {
  const apiKey = env.TTS_API_SECRET || env.TTS_API_KEY
  const defaultMaleVoice = isEnglish ? 'English_expressive_narrator' : 'Chinese (Mandarin)_Gentleman'
  const defaultFemaleVoice = isEnglish ? 'English_friendly_host' : 'Chinese (Mandarin)_Gentle_Senior'
  const defaultCustomVoice = isEnglish ? 'English_Trustworth_Man' : 'Chinese (Mandarin)_News_Anchor'
  const { role } = getSpeakerVoiceConfig(gender, env)
  const voiceId = role === 'male'
    ? (env.MAN_VOICE_ID || defaultMaleVoice)
    : role === 'female'
      ? (env.WOMAN_VOICE_ID || defaultFemaleVoice)
      : defaultCustomVoice

  const res = await fetch(`${env.TTS_API_URL || 'https://api.minimax.chat/v1/t2a_v2'}?GroupId=${env.TTS_API_ID}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: env.TTS_MODEL || 'speech-2.5-turbo-preview',
      text,
      timber_weights: [
        {
          voice_id: voiceId,
          weight: 100,
        },
      ],
      voice_setting: {
        voice_id: '',
        speed: Number(env.AUDIO_SPEED || 1.1),
        pitch: 0,
        vol: 1,
        latex_read: false,
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: 'mp3',
      },
      language_boost: isEnglish ? 'English' : 'Chinese',
    }),
  })

  if (res.ok) {
    const result: { data: { audio: string }, base_resp: { status_msg: string } } = await res.json()
    if (result?.data?.audio) {
      const buffer = Buffer.from(result.data.audio, 'hex')
      return new Blob([buffer.buffer], { type: 'audio/mpeg' })
    }
    throw new Error(`Failed to fetch audio: ${result?.base_resp?.status_msg}`)
  }
  throw new Error(`Failed to fetch audio: ${res.statusText}`)
}

async function openaiTTS(text: string, gender: string, env: Env, isEnglish = false) {
  const apiKey = env.OPENAI_TTS_API_SECRET || env.OPENAI_API_SECRET || env.OPENAI_TTS_API_KEY || env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OpenAI TTS API key is missing')
  }

  const baseUrl = (env.OPENAI_TTS_BASE_URL || env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
  const model = env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts'
  const { openaiVoice: voice } = getSpeakerVoiceConfig(gender, env)

  const body: Record<string, unknown> = {
    model,
    voice,
    input: text,
    speed: Number(env.AUDIO_SPEED || 1.3), // 語速調整：1.0=正常, 1.3=快30%
  }

  const instructions = env.OPENAI_TTS_INSTRUCTIONS
    || (isEnglish ? 'Please speak in a natural, lively American English podcast tone.' : undefined)

  if (instructions) {
    body.instructions = instructions
  }

  const res = await fetch(`${baseUrl}/audio/speech`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(DEFAULT_GEMINI_TTS_TIMEOUT_MS),
  })

  if (!res.ok) {
    const errorMessage = await res.text().catch(() => '')
    throw new Error(`Failed to fetch OpenAI TTS audio: ${res.status} ${res.statusText} ${errorMessage}`)
  }

  const arrayBuffer = await res.arrayBuffer()
  return new Blob([arrayBuffer], { type: 'audio/mpeg' })
}

export interface SynthesizeOptions {
  isEnglish?: boolean
  provider?: ResolvedTtsProvider
}

export type ResolvedTtsProvider = 'gemini' | 'openai' | 'minimax' | 'edge'

export function hasOpenAiTtsCredentials(env: object): boolean {
  return Boolean(firstString(env, [
    'OPENAI_TTS_API_SECRET',
    'OPENAI_API_SECRET',
    'OPENAI_TTS_API_KEY',
    'OPENAI_API_KEY',
  ]))
}

export function resolveTtsProvider(provider?: string): ResolvedTtsProvider {
  const normalized = provider?.trim().toLowerCase()
  if (normalized === 'openai' || normalized === 'minimax' || normalized === 'edge' || normalized === 'gemini') {
    return normalized
  }
  return 'gemini'
}

export async function synthesizeWithProvider(text: string, gender: string, env: Env, options?: SynthesizeOptions) {
  const isEnglish = options?.isEnglish ?? (/[a-z]/i.test(text) && !/[\u4E00-\u9FFF]/.test(text))
  const provider = options?.provider ?? resolveTtsProvider(env.TTS_PROVIDER)
  if (provider === 'openai') {
    return openaiTTS(text, gender, env, isEnglish)
  }
  if (provider === 'minimax') {
    return minimaxTTS(text, gender, env, isEnglish)
  }
  if (provider === 'edge') {
    return edgeTTS(text, gender, env, isEnglish)
  }
  // Default: Gemini TTS with multi-key failover (no inner retry loop; Workflow handles retries)
  return geminiTTS(text, gender, env)
}

export default synthesizeWithProvider
