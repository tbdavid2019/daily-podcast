import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { describe, it } from 'node:test'
import synthesizeAudio, {
  createGeminiTtsConfigs,
  DEFAULT_GEMINI_TTS_MAX_RETRIES,
  DEFAULT_GEMINI_TTS_MODEL,
  geminiTTS,
  isGeminiLocationUnsupportedError,
  resolveTtsProvider,
} from '../workflow/tts'

function makeMockPcmResponse() {
  const pcmBytes = new Uint8Array([0x01, 0x02, 0x03, 0x04])
  const base64Audio = Buffer.from(pcmBytes).toString('base64')
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  data: base64Audio,
                },
              },
            ],
          },
        },
      ],
    }),
  } as unknown as Response
}

function makeErrorResponse(status: number, statusText: string, body = 'error') {
  return {
    ok: false,
    status,
    statusText,
    text: async () => body,
  } as unknown as Response
}

describe('Gemini TTS configuration', () => {
  it('extracts primary key and sets default model', () => {
    const configs = createGeminiTtsConfigs({
      GEMINI_TTS_API_SECRET: 'primary-key',
    })

    assert.deepEqual(configs, [
      {
        id: 'primary',
        apiKey: 'primary-key',
        model: DEFAULT_GEMINI_TTS_MODEL,
      },
    ])
  })

  it('supports single fallback key and inherits model', () => {
    const configs = createGeminiTtsConfigs({
      GEMINI_TTS_API_KEY: 'primary-key',
      GEMINI_TTS_FALLBACK_API_KEY: 'fallback-key',
      GEMINI_TTS_MODEL: 'custom-gemini-tts',
    })

    assert.deepEqual(configs, [
      {
        id: 'primary',
        apiKey: 'primary-key',
        model: 'custom-gemini-tts',
      },
      {
        id: 'fallback-1',
        apiKey: 'fallback-key',
        model: 'custom-gemini-tts',
      },
    ])
  })

  it('supports numbered fallback slots and dedupes identical keys', () => {
    const configs = createGeminiTtsConfigs({
      GEMINI_TTS_API_SECRET: 'key-1',
      GEMINI_TTS_FALLBACK_API_KEY: 'key-2',
      GEMINI_TTS_FALLBACK_1_API_KEY: 'key-2',
      GEMINI_TTS_FALLBACK_2_API_KEY: 'key-3',
      GEMINI_TTS_FALLBACK_2_MODEL: 'model-for-slot-2',
    })

    assert.deepEqual(configs, [
      {
        id: 'primary',
        apiKey: 'key-1',
        model: DEFAULT_GEMINI_TTS_MODEL,
      },
      {
        id: 'fallback-1',
        apiKey: 'key-2',
        model: DEFAULT_GEMINI_TTS_MODEL,
      },
      {
        id: 'fallback-2',
        apiKey: 'key-3',
        model: 'model-for-slot-2',
      },
    ])
  })

  it('returns empty array when no keys are configured', () => {
    const configs = createGeminiTtsConfigs({})
    assert.deepEqual(configs, [])
  })
})

describe('Gemini TTS retry and fallback behavior', () => {
  it('succeeds on first attempt without retrying', async () => {
    let callCount = 0
    const mockFetch = async () => {
      callCount += 1
      return makeMockPcmResponse()
    }

    const env = {
      GEMINI_TTS_API_SECRET: 'test-key',
    }

    const result = await geminiTTS('測試文字', '女', env as any, {
      fetchFn: mockFetch as any,
      timeoutMs: 1000,
    })

    assert.equal(callCount, 1)
    assert(result instanceof Blob)
    assert.equal(result.type, 'audio/wav')
  })

  it('retries on transient failure (503) and succeeds', async () => {
    let callCount = 0
    const mockFetch = async () => {
      callCount += 1
      if (callCount === 1) {
        return makeErrorResponse(503, 'Service Unavailable')
      }
      return makeMockPcmResponse()
    }

    const sleepCalls: number[] = []
    const mockSleep = async (ms: number) => {
      sleepCalls.push(ms)
    }

    const env = {
      GEMINI_TTS_API_SECRET: 'test-key',
    }

    const result = await geminiTTS('測試文字', '女', env as any, {
      fetchFn: mockFetch as any,
      sleepFn: mockSleep,
      maxRetriesPerKey: 2,
      timeoutMs: 1000,
    })

    assert.equal(callCount, 2)
    assert.equal(sleepCalls.length, 1)
    assert.equal(sleepCalls[0], 1000)
    assert(result instanceof Blob)
  })

  it('immediately fails over to fallback key on 401 Unauthorized without wasting retries', async () => {
    const requestedKeys: string[] = []
    const mockFetch = async (_url: RequestInfo | URL, init?: RequestInit) => {
      const apiKey = (init?.headers as Record<string, string>)['x-goog-api-key']
      requestedKeys.push(apiKey)
      if (apiKey === 'bad-primary-key') {
        return makeErrorResponse(401, 'Unauthorized', 'Invalid API key')
      }
      return makeMockPcmResponse()
    }

    const sleepCalls: number[] = []
    const env = {
      GEMINI_TTS_API_SECRET: 'bad-primary-key',
      GEMINI_TTS_FALLBACK_API_KEY: 'good-fallback-key',
    }

    const result = await geminiTTS('測試文字', '男', env as any, {
      fetchFn: mockFetch as any,
      sleepFn: async (ms) => {
        sleepCalls.push(ms)
      },
      maxRetriesPerKey: 2,
      timeoutMs: 1000,
    })

    assert.deepEqual(requestedKeys, ['bad-primary-key', 'good-fallback-key'])
    assert.equal(sleepCalls.length, 0)
    assert(result instanceof Blob)
  })

  it('fails over to fallback key after exhausting retries on 429 rate limit', async () => {
    const requestedKeys: string[] = []
    const mockFetch = async (_url: RequestInfo | URL, init?: RequestInit) => {
      const apiKey = (init?.headers as Record<string, string>)['x-goog-api-key']
      requestedKeys.push(apiKey)
      if (apiKey === 'rate-limited-key') {
        return makeErrorResponse(429, 'Too Many Requests', 'Resource exhausted')
      }
      return makeMockPcmResponse()
    }

    const sleepCalls: number[] = []
    const env = {
      GEMINI_TTS_API_SECRET: 'rate-limited-key',
      GEMINI_TTS_FALLBACK_API_KEY: 'fresh-key',
    }

    const result = await geminiTTS('測試文字', '女', env as any, {
      fetchFn: mockFetch as any,
      sleepFn: async (ms) => {
        sleepCalls.push(ms)
      },
      maxRetriesPerKey: 1,
      timeoutMs: 1000,
    })

    assert.deepEqual(requestedKeys, ['rate-limited-key', 'rate-limited-key', 'fresh-key'])
    assert.equal(sleepCalls.length, 1)
    assert(result instanceof Blob)
  })

  it('does NOT fall back to edge-tts when Gemini TTS fails in default synthesizeAudio', async () => {
    const env = {
      TTS_PROVIDER: 'gemini',
      GEMINI_TTS_API_SECRET: 'failing-key',
    }

    const mockFetch = async () => {
      return makeErrorResponse(500, 'Internal Server Error')
    }

    const originalFetch = globalThis.fetch
    globalThis.fetch = mockFetch as any

    try {
      await assert.rejects(
        async () => {
          await synthesizeAudio('測試', '男', env as any)
        },
        /Gemini TTS API error/,
      )
    }
    finally {
      globalThis.fetch = originalFetch
    }
  })

  it('disables inner TTS retry loops by default and resolves provider consistently with Workflow audio', () => {
    assert.equal(DEFAULT_GEMINI_TTS_MAX_RETRIES, 0)
    assert.equal(resolveTtsProvider(undefined), 'gemini')
    assert.equal(resolveTtsProvider(''), 'gemini')
    assert.equal(resolveTtsProvider('GEMINI'), 'gemini')
    assert.equal(resolveTtsProvider('openai'), 'openai')
    assert.equal(resolveTtsProvider('minimax'), 'minimax')
    assert.equal(resolveTtsProvider('edge'), 'edge')
    assert.equal(resolveTtsProvider('unknown'), 'gemini')
  })

  it('resolves Gemini and OpenAI voices from CastRegistry while honoring env overrides', async () => {
    const { getSpeakerVoiceConfig } = await import('../lib/cast-registry')

    assert.deepEqual(getSpeakerVoiceConfig('女'), {
      geminiVoice: 'Leda',
      openaiVoice: 'nova',
      role: 'female',
    })
    assert.deepEqual(getSpeakerVoiceConfig('David', { MAN_VOICE_ID: 'Fenrir' }), {
      geminiVoice: 'Fenrir',
      openaiVoice: 'Fenrir',
      role: 'male',
    })
    assert.deepEqual(getSpeakerVoiceConfig('來賓 Alex'), {
      geminiVoice: 'Puck',
      openaiVoice: 'alloy',
      role: 'custom',
    })
  })

  it('supports GEMINI_TTS_BASE_URL and falls back to alternate baseUrl on 400 location errors', async () => {
    const configs = createGeminiTtsConfigs({
      GEMINI_TTS_API_SECRET: 'key-1',
      GEMINI_TTS_FALLBACK_API_KEY: 'key-2',
      GEMINI_TTS_FALLBACK_1_BASE_URL: 'https://gemini-proxy.example.com/v1beta/',
    })

    assert.equal(configs.length, 3)
    assert.equal(configs[0].baseUrl, undefined)
    assert.equal(configs[1].baseUrl, undefined)
    assert.equal(configs[2].apiKey, 'key-1')
    assert.equal(configs[2].baseUrl, 'https://gemini-proxy.example.com/v1beta')

    const requestedUrls: string[] = []
    const mockFetch = async (url: RequestInfo | URL) => {
      const target = String(url)
      requestedUrls.push(target)
      if (target.startsWith('https://generativelanguage.googleapis.com/')) {
        return makeErrorResponse(
          400,
          'Bad Request',
          JSON.stringify({
            error: {
              code: 400,
              message: 'User location is not supported for the API use.',
              status: 'FAILED_PRECONDITION',
            },
          }),
        )
      }
      return makeMockPcmResponse()
    }

    const result = await geminiTTS('測試地區封鎖備援', '女', {
      GEMINI_TTS_API_SECRET: 'key-1',
      GEMINI_TTS_FALLBACK_API_KEY: 'key-2',
      GEMINI_TTS_FALLBACK_1_BASE_URL: 'https://gemini-proxy.example.com/v1beta/',
    } as any, {
      fetchFn: mockFetch as any,
      timeoutMs: 1000,
    })

    assert(result instanceof Blob)
    // Should try primary Google URL once, skip fallback-1 on the same blocked baseUrl, and succeed on proxy baseUrl
    assert.deepEqual(requestedUrls, [
      `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_GEMINI_TTS_MODEL}:generateContent`,
      `https://gemini-proxy.example.com/v1beta/models/${DEFAULT_GEMINI_TTS_MODEL}:generateContent`,
    ])
  })

  it('detects Gemini location errors distinctly from generic 400 errors', () => {
    assert.equal(
      isGeminiLocationUnsupportedError(
        Object.assign(new Error('Gemini TTS API error (400 Bad Request): {"error":{"status":"FAILED_PRECONDITION","message":"User location is not supported for the API use."}}'), { statusCode: 400 }),
      ),
      true,
    )
    assert.equal(
      isGeminiLocationUnsupportedError(
        Object.assign(new Error('Gemini TTS API error (400 Bad Request): Invalid voice name'), { statusCode: 400 }),
      ),
      false,
    )
  })
})
