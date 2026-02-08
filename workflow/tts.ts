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
  GEMINI_TTS_API_KEY?: string
  GEMINI_TTS_MODEL?: string
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

export function pcmToWav(pcmData: Uint8Array, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): ArrayBuffer {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmData.byteLength;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Write PCM data
  const pcmView = new Uint8Array(buffer, 44);
  pcmView.set(pcmData);

  return buffer;
}

async function geminiTTS(text: string, gender: string, env: Env) {
  const apiKey = env.GEMINI_TTS_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini TTS API key is missing (GEMINI_TTS_API_KEY)');
  }

  // Use the model specified by user or fallback to standard flash
  const model = env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  // Fenrir (Male) / Leda (Female)
  const voiceName = gender === '男' ? 'Fenrir' : 'Leda';

  const payload = {
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName
          }
        }
      }
    }
  };

  const res = await fetch(`${url}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Failed to fetch Gemini TTS audio: ${res.status} ${res.statusText} ${errorText}`);
  }

  const data = await res.json() as any;
  const base64Audio = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

  if (!base64Audio) {
    throw new Error('Gemini TTS response missing audio data');
  }

  const binaryString = atob(base64Audio);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // API returns raw PCM (s16le, 24kHz, mono). Convert to WAV.
  const wavBuffer = pcmToWav(bytes, 24000, 1, 16);

  return new Blob([wavBuffer], { type: 'audio/wav' });
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
  })

  if (!res.ok) {
    const errorMessage = await res.text().catch(() => '')
    throw new Error(`Failed to fetch OpenAI TTS audio: ${res.status} ${res.statusText} ${errorMessage}`)
  }

  const arrayBuffer = await res.arrayBuffer()
  return new Blob([arrayBuffer], { type: 'audio/mpeg' })
}

export default async function (text: string, gender: string, env: Env) {
  let result: Blob | Promise<Blob>;

  try {
    if (env.TTS_PROVIDER === 'openai') {
      result = await openaiTTS(text, gender, env);
    } else if (env.TTS_PROVIDER === 'minimax') {
      result = await minimaxTTS(text, gender, env);
    } else if (env.TTS_PROVIDER === 'gemini') {
      result = await geminiTTS(text, gender, env);
    } else {
      result = await edgeTTS(text, gender, env);
    }
    return result;
  } catch (error) {
    if (env.TTS_PROVIDER !== 'edge') {
      console.warn(`TTS provider ${env.TTS_PROVIDER} failed, falling back to edge-tts`, error);
      try {
        return await edgeTTS(text, gender, env);
      } catch (fallbackError) {
        console.error('Fallback edge-tts also failed', fallbackError);
        throw error; // Throw original error if fallback fails too
      }
    }
    throw error;
  }
}
