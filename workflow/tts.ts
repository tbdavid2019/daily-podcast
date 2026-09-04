import { Buffer } from 'node:buffer'
import { synthesize } from '@echristian/edge-tts'

export const DEFAULT_GEMINI_TTS_MODEL = 'gemini-2.5-flash-preview-tts'
export const DEFAULT_GEMINI_TTS_TIMEOUT_MS = 45_000
export const DEFAULT_GEMINI_TTS_MAX_RETRIES = 2
export const MAX_GEMINI_TTS_FALLBACKS = 5

export interface GeminiTtsConfig {
  id: string
  apiKey: string
  model: string
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
  GEMINI_TTS_MODEL?: string
  GEMINI_TTS_FALLBACK_API_KEY?: string
  GEMINI_TTS_FALLBACK_API_SECRET?: string
  GEMINI_TTS_FALLBACK_MODEL?: string
  GEMINI_API_KEY?: string
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i))
  }
}

export function pcmToWav(pcmData: Uint8Array, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): ArrayBuffer {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8
  const blockAlign = (numChannels * bitsPerSample) / 8
  const dataSize = pcmData.byteLength
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(view, 8, 'WAVE')

  // fmt sub-chunk
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true) // AudioFormat (1 for PCM)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)

  // data sub-chunk
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  // Write PCM data
  const pcmView = new Uint8Array(buffer, 44)
  pcmView.set(pcmData)

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

export function createGeminiTtsConfigs(env: object): GeminiTtsConfig[] {
  const defaultModel = firstString(env, ['GEMINI_TTS_MODEL']) || DEFAULT_GEMINI_TTS_MODEL
  const configs: GeminiTtsConfig[] = []
  const seenKeys = new Set<string>()

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
    })
    seenKeys.add(primaryApiKey)
  }

  // Fallback single key
  const fallbackSingleKey = firstString(env, [
    'GEMINI_TTS_FALLBACK_API_KEY',
    'GEMINI_TTS_FALLBACK_API_SECRET',
    'GEMINI_TTS_FALLBACK_KEY',
  ])
  if (fallbackSingleKey && !seenKeys.has(fallbackSingleKey)) {
    configs.push({
      id: 'fallback-1',
      apiKey: fallbackSingleKey,
      model: firstString(env, ['GEMINI_TTS_FALLBACK_MODEL']) || defaultModel,
    })
    seenKeys.add(fallbackSingleKey)
  }

  // Numbered slots: GEMINI_TTS_FALLBACK_1_API_KEY .. GEMINI_TTS_FALLBACK_5_API_KEY
  for (let index = 1; index <= MAX_GEMINI_TTS_FALLBACKS; index += 1) {
    const prefix = `GEMINI_TTS_FALLBACK_${index}`
    const apiKey = firstString(env, [
      `${prefix}_API_KEY`,
      `${prefix}_API_SECRET`,
      `${prefix}_KEY`,
    ])
    if (!apiKey || seenKeys.has(apiKey)) {
      continue
    }
    configs.push({
      id: `fallback-${index}`,
      apiKey,
      model: firstString(env, [`${prefix}_MODEL`]) || defaultModel,
    })
    seenKeys.add(apiKey)
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
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
  const voiceName = gender === '男' ? (env.MAN_VOICE_ID || 'Puck') : (env.WOMAN_VOICE_ID || 'Leda')

  const payload = {
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName,
          },
        },
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

  const binaryString = atob(base64Audio)
  const len = binaryString.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binaryString.charCodeAt(i)
  }

  const wavBuffer = pcmToWav(bytes, 24000, 1, 16)
  return new Blob([wavBuffer], { type: 'audio/wav' })
}

export interface GeminiTtsRunnerOptions extends GeminiTtsRequestOptions {
  maxRetriesPerKey?: number
  sleepFn?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

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
  let lastError: unknown

  for (const config of configs) {
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

        console.warn('Gemini TTS attempt failed', {
          provider: config.id,
          attempt: attempt + 1,
          maxAttempts: maxRetries + 1,
          statusCode,
          message: error instanceof Error ? error.message : String(error),
        })

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

async function edgeTTS(text: string, gender: string, env: Env) {
  const { audio } = await synthesize({
    text,
    language: 'zh-TW', // 改為繁體中文 (台灣)
    voice: gender === '男' ? (env.MAN_VOICE_ID || 'zh-TW-YunJheNeural') : (env.WOMAN_VOICE_ID || 'zh-TW-HsiaoChenNeural'),
    rate: env.AUDIO_SPEED || '10%',
  })
  return audio
}

async function minimaxTTS(text: string, gender: string, env: Env) {
  const apiKey = env.TTS_API_SECRET || env.TTS_API_KEY
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
          voice_id: gender === '男' ? (env.MAN_VOICE_ID || 'Chinese (Mandarin)_Gentleman') : (env.WOMAN_VOICE_ID || 'Chinese (Mandarin)_Gentle_Senior'),
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
      language_boost: 'Chinese',
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

async function openaiTTS(text: string, gender: string, env: Env) {
  const apiKey = env.OPENAI_TTS_API_SECRET || env.OPENAI_API_SECRET || env.OPENAI_TTS_API_KEY || env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OpenAI TTS API key is missing')
  }

  const baseUrl = (env.OPENAI_TTS_BASE_URL || env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
  const model = env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts'
  const voice = gender === '男' ? (env.MAN_VOICE_ID || 'onyx') : (env.WOMAN_VOICE_ID || 'nova')

  const body: Record<string, unknown> = {
    model,
    voice,
    input: text,
    speed: Number(env.AUDIO_SPEED || 1.3), // 語速調整：1.0=正常, 1.3=快30%
  }

  if (env.OPENAI_TTS_INSTRUCTIONS) {
    body.instructions = env.OPENAI_TTS_INSTRUCTIONS
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

export default async function (text: string, gender: string, env: Env) {
  if (env.TTS_PROVIDER === 'openai') {
    return openaiTTS(text, gender, env)
  }
  if (env.TTS_PROVIDER === 'minimax') {
    return minimaxTTS(text, gender, env)
  }
  if (env.TTS_PROVIDER === 'edge') {
    return edgeTTS(text, gender, env)
  }
  // Default: Gemini TTS with automatic retries and multi-key fallback
  return geminiTTS(text, gender, env)
}
