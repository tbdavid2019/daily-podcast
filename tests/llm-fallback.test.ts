import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createLlmConfigs, runWithLlmFallback } from '../workflow/llm'

describe('LLM fallback configuration', () => {
  it('keeps the primary provider first and reads independent fallback settings', () => {
    const configs = createLlmConfigs({
      LLM_PRIMARY_API_KEY: 'primary-secret',
      LLM_PRIMARY_BASE_URL: 'https://primary.example/v1/',
      LLM_PRIMARY_MODEL: 'primary-model',
      LLM_PRIMARY_THINKING_MODEL: 'primary-thinking-model',
      LLM_FALLBACK_1_API_KEY: 'fallback-secret',
      LLM_FALLBACK_1_BASE_URL: 'https://fallback.example/v1/',
      LLM_FALLBACK_1_MODEL: 'fallback-model',
      LLM_FALLBACK_1_THINKING_MODEL: 'fallback-thinking-model',
    })

    assert.deepEqual(configs, [
      {
        id: 'primary',
        apiKey: 'primary-secret',
        baseUrl: 'https://primary.example/v1',
        model: 'primary-model',
        thinkingModel: 'primary-thinking-model',
      },
      {
        id: 'fallback-1',
        apiKey: 'fallback-secret',
        baseUrl: 'https://fallback.example/v1',
        model: 'fallback-model',
        thinkingModel: 'fallback-thinking-model',
      },
    ])
  })

  it('skips empty fallback slots and inherits primary endpoint defaults', () => {
    const configs = createLlmConfigs({
      LLM_PRIMARY_API_KEY: 'primary-key',
      LLM_PRIMARY_BASE_URL: 'https://primary.example/v1',
      LLM_PRIMARY_MODEL: 'primary-model',
      LLM_FALLBACK_2_API_KEY: 'fallback-key',
    })

    assert.deepEqual(configs.map(config => ({
      id: config.id,
      baseUrl: config.baseUrl,
      model: config.model,
      thinkingModel: config.thinkingModel,
    })), [
      {
        id: 'primary',
        baseUrl: 'https://primary.example/v1',
        model: 'primary-model',
        thinkingModel: 'primary-model',
      },
      {
        id: 'fallback-2',
        baseUrl: 'https://primary.example/v1',
        model: 'primary-model',
        thinkingModel: 'primary-model',
      },
    ])
  })
})

describe('LLM fallback execution', () => {
  it('tries providers in order and stops after the first success', async () => {
    const configs = createLlmConfigs({
      LLM_PRIMARY_API_KEY: 'primary-key',
      LLM_PRIMARY_MODEL: 'primary-model',
      LLM_FALLBACK_1_API_KEY: 'fallback-key',
      LLM_FALLBACK_1_MODEL: 'fallback-model',
    })
    const attempts: string[] = []

    const result = await runWithLlmFallback(configs, 'test operation', async (config) => {
      attempts.push(config.id)
      if (config.id === 'primary') {
        throw Object.assign(new Error('bad request'), { statusCode: 400 })
      }
      return `${config.id}-success`
    })

    assert.equal(result, 'fallback-1-success')
    assert.deepEqual(attempts, ['primary', 'fallback-1'])
  })

  it('rethrows the last provider error when every configured provider fails', async () => {
    const configs = createLlmConfigs({
      LLM_PRIMARY_API_KEY: 'primary-key',
      LLM_PRIMARY_MODEL: 'primary-model',
      LLM_FALLBACK_1_API_KEY: 'fallback-key',
      LLM_FALLBACK_1_MODEL: 'fallback-model',
    })
    const lastError = new Error('fallback failed')

    await assert.rejects(
      runWithLlmFallback(configs, 'test operation', async (config) => {
        if (config.id === 'fallback-1') {
          throw lastError
        }
        throw new Error('primary failed')
      }),
      error => error === lastError,
    )
  })

  it('continues to read the legacy primary names during migration', () => {
    const configs = createLlmConfigs({
      OPENAI_API_SECRET: 'legacy-secret',
      OPENAI_BASE_URL: 'https://legacy.example/v1',
      OPENAI_MODEL: 'legacy-model',
    })

    assert.equal(configs[0]?.apiKey, 'legacy-secret')
    assert.equal(configs[0]?.baseUrl, 'https://legacy.example/v1')
    assert.equal(configs[0]?.model, 'legacy-model')
  })
})
