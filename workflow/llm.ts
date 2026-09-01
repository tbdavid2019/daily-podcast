import type { LanguageModel } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

export const DEFAULT_LLM_BASE_URL = 'https://api.openai.com/v1'
export const DEFAULT_LLM_MODEL = 'gpt-4o-mini'
export const MAX_LLM_FALLBACKS = 10

export interface LlmConfig {
  id: string
  apiKey: string
  baseUrl: string
  model: string
  thinkingModel: string
}

export interface LlmClient extends LlmConfig {
  provider: ReturnType<typeof createOpenAI>
}

interface LlmAttemptError {
  name?: string
  code?: string
  statusCode?: number | string
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
  return value.replace(/\/+$/, '')
}

export function createLlmConfigs(env: object): LlmConfig[] {
  const primaryBaseUrl = normalizeBaseUrl(
    firstString(env, ['LLM_PRIMARY_BASE_URL', 'OPENAI_BASE_URL']) || DEFAULT_LLM_BASE_URL,
  )
  const primaryModel = firstString(env, ['LLM_PRIMARY_MODEL', 'OPENAI_MODEL']) || DEFAULT_LLM_MODEL
  const configs: LlmConfig[] = []
  const primaryApiKey = firstString(env, [
    'LLM_PRIMARY_API_KEY',
    'OPENAI_API_SECRET',
    'OPENAI_API_KEY',
  ])

  if (primaryApiKey) {
    configs.push({
      id: 'primary',
      apiKey: primaryApiKey,
      baseUrl: primaryBaseUrl,
      model: primaryModel,
      thinkingModel: firstString(env, ['LLM_PRIMARY_THINKING_MODEL', 'OPENAI_THINKING_MODEL']) || primaryModel,
    })
  }

  for (let index = 1; index <= MAX_LLM_FALLBACKS; index += 1) {
    const prefix = `LLM_FALLBACK_${index}`
    const apiKey = firstString(env, [
      `${prefix}_API_KEY`,
      `${prefix}_API_SECRET`,
      `${prefix}_KEY`,
    ])
    if (!apiKey) {
      continue
    }

    const model = readString(env, `${prefix}_MODEL`) || primaryModel
    configs.push({
      id: `fallback-${index}`,
      apiKey,
      baseUrl: normalizeBaseUrl(readString(env, `${prefix}_BASE_URL`) || primaryBaseUrl),
      model,
      thinkingModel: readString(env, `${prefix}_THINKING_MODEL`) || model,
    })
  }

  return configs
}

export function createLlmClients(env: object): LlmClient[] {
  return createLlmConfigs(env).map(config => ({
    ...config,
    provider: createOpenAI({
      name: config.id,
      baseURL: config.baseUrl,
      apiKey: config.apiKey,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
    }),
  }))
}

export function getLlmModel(client: LlmClient, kind: 'standard' | 'thinking'): LanguageModel {
  return client.provider(kind === 'thinking' ? client.thinkingModel : client.model)
}

function describeError(error: unknown): LlmAttemptError {
  if (!error || typeof error !== 'object') {
    return { name: typeof error === 'string' ? 'Error' : 'UnknownError' }
  }

  const candidate = error as Record<string, unknown>
  const description: LlmAttemptError = {}
  if (typeof candidate.name === 'string') {
    description.name = candidate.name
  }
  if (typeof candidate.code === 'string') {
    description.code = candidate.code
  }
  if (typeof candidate.statusCode === 'number' || typeof candidate.statusCode === 'string') {
    description.statusCode = candidate.statusCode
  }
  return description
}

export async function runWithLlmFallback<T, C extends LlmConfig>(
  configs: readonly C[],
  operation: string,
  run: (config: C) => Promise<T>,
): Promise<T> {
  if (configs.length === 0) {
    throw new Error('No LLM provider is configured')
  }

  let lastError: unknown
  for (const config of configs) {
    try {
      const result = await run(config)
      if (config.id !== 'primary') {
        console.info('LLM fallback succeeded', {
          operation,
          provider: config.id,
          model: config.model,
        })
      }
      return result
    }
    catch (error) {
      lastError = error
      console.warn('LLM provider attempt failed', {
        operation,
        provider: config.id,
        model: config.model,
        error: describeError(error),
      })
    }
  }

  throw lastError
}
