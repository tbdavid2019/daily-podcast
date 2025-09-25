import { Buffer } from 'node:buffer'
import { synthesize } from '@echristian/edge-tts'

interface Env extends CloudflareEnv {
  TTS_PROVIDER?: string
  TTS_API_URL?: string
  TTS_API_ID?: string
  TTS_API_KEY?: string
  TTS_MODEL?: string
  MAN_VOICE_ID?: string
  WOMAN_VOICE_ID?: string
  AUDIO_SPEED?: string
  OPENAI_TTS_API_KEY?: string
  OPENAI_TTS_BASE_URL?: string
  OPENAI_TTS_MODEL?: string
  OPENAI_TTS_INSTRUCTIONS?: string
  OPENAI_BASE_URL?: string
  OPENAI_API_KEY?: string
}

async function edgeTTS(text: string, gender: string, env: Env) {
  const { audio } = await synthesize({
    text,
    language: 'zh-CN',
    voice: gender === '男' ? (env.MAN_VOICE_ID || 'zh-CN-YunyangNeural') : (env.WOMAN_VOICE_ID || 'zh-CN-XiaoxiaoNeural'),
    rate: env.AUDIO_SPEED || '10%',
  })
  return audio
}

async function minimaxTTS(text: string, gender: string, env: Env) {
  const res = await fetch(`${env.TTS_API_URL || 'https://api.minimax.chat/v1/t2a_v2'}?GroupId=${env.TTS_API_ID}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.TTS_API_KEY}`,
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
  const apiKey = env.OPENAI_TTS_API_KEY || env.OPENAI_API_KEY
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
  })

  if (!res.ok) {
    const errorMessage = await res.text().catch(() => '')
    throw new Error(`Failed to fetch OpenAI TTS audio: ${res.status} ${res.statusText} ${errorMessage}`)
  }

  const arrayBuffer = await res.arrayBuffer()
  return new Blob([arrayBuffer], { type: 'audio/mpeg' })
}

export default function (text: string, gender: string, env: Env) {
  if (env.TTS_PROVIDER === 'openai') {
    return openaiTTS(text, gender, env)
  }
  if (env.TTS_PROVIDER === 'minimax') {
    return minimaxTTS(text, gender, env)
  }
  return edgeTTS(text, gender, env)
}
