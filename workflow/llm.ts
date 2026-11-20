import type { LanguageModel } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { streamText } from 'ai'

export const DEFAULT_LLM_BASE_URL = 'https://llm.aiurl.tw/v1'
export const DEFAULT_LLM_MODEL = 'group/do'
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
  message?: string
  responseBodyPreview?: string
  causeMessage?: string
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

function cleanModel(model: string): string {
  return model.startsWith('models/') ? model.slice(7) : model
}

export function createLlmConfigs(env: object): LlmConfig[] {
  const primaryBaseUrl = normalizeBaseUrl(
    firstString(env, ['LLM_PRIMARY_BASE_URL', 'OPENAI_BASE_URL']) || DEFAULT_LLM_BASE_URL,
  )
  const primaryModel = cleanModel(firstString(env, ['LLM_PRIMARY_MODEL', 'OPENAI_MODEL']) || DEFAULT_LLM_MODEL)
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
      thinkingModel: cleanModel(firstString(env, ['LLM_PRIMARY_THINKING_MODEL', 'OPENAI_THINKING_MODEL']) || primaryModel),
    })
  }

  for (let index = 1; index <= MAX_LLM_FALLBACKS; index += 1) {
    const prefix = `LLM_FALLBACK_${index}`
    const rawBaseUrl = readString(env, `${prefix}_BASE_URL`)
    const baseUrl = normalizeBaseUrl(rawBaseUrl || primaryBaseUrl)
    const isGoogleEndpoint = baseUrl.includes('generativelanguage.googleapis.com')
    const fallbackGeminiKey = isGoogleEndpoint
      ? firstString(env, ['GEMINI_API_KEY', 'GEMINI_DECISION_API_KEY', 'GEMINI_TTS_API_SECRET'])
      : ''
    const apiKey = firstString(env, [
      `${prefix}_API_KEY`,
      `${prefix}_API_SECRET`,
      `${prefix}_KEY`,
    ]) || fallbackGeminiKey || (readString(env, `${prefix}_MODEL`) || rawBaseUrl ? primaryApiKey : '')
    if (!apiKey) {
      continue
    }

    const model = cleanModel(readString(env, `${prefix}_MODEL`) || primaryModel)
    configs.push({
      id: `fallback-${index}`,
      apiKey,
      baseUrl,
      model,
      thinkingModel: cleanModel(readString(env, `${prefix}_THINKING_MODEL`) || model),
    })
  }

  return configs
}

export const DEFAULT_LLM_TIMEOUT_MS = 240_000

export function createLlmClients(env: object): LlmClient[] {
  const timeoutMs = Number.parseInt(firstString(env, ['LLM_TIMEOUT_MS']) || '', 10) || DEFAULT_LLM_TIMEOUT_MS

  return createLlmConfigs(env).map(config => ({
    ...config,
    provider: createOpenAI({
      name: config.id,
      baseURL: config.baseUrl,
      apiKey: config.apiKey,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
      fetch: async (url, init) => {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(new Error(`LLM call timed out after ${timeoutMs}ms`)), timeoutMs)
        const signal = init?.signal
          ? (typeof AbortSignal.any === 'function' ? AbortSignal.any([init.signal, controller.signal]) : controller.signal)
          : controller.signal

        try {
          const response = await fetch(url, { ...init, signal })
          if (!response.body) {
            clearTimeout(timeoutId)
            return response
          }

          let settled = false
          const clearTimer = () => {
            if (!settled) {
              settled = true
              clearTimeout(timeoutId)
            }
          }

          const reader = response.body.getReader()
          const timedBody = new ReadableStream({
            async pull(streamController) {
              try {
                const { done, value } = await reader.read()
                if (done) {
                  clearTimer()
                  streamController.close()
                  return
                }
                streamController.enqueue(value)
              }
              catch (error) {
                clearTimer()
                streamController.error(error)
              }
            },
            cancel(reason) {
              clearTimer()
              return reader.cancel(reason)
            },
          })

          return new Response(timedBody, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          })
        }
        catch (error) {
          clearTimeout(timeoutId)
          throw error
        }
      },
    }),
  }))
}

export function getLlmModel(client: LlmClient, kind: 'standard' | 'thinking'): LanguageModel {
  return client.provider.chat(kind === 'thinking' ? client.thinkingModel : client.model)
}

/**
 * Stream an LLM completion and collect text, usage, and finishReason.
 * Streaming keeps SSE chunks flowing so reverse proxies (such as Cloudflare's 100s origin timeout)
 * do not sever long-running thinking or multi-story generations with HTTP 524 while waiting for the first byte.
 */
export async function collectStreamedText(
  options: Omit<Parameters<typeof streamText>[0], 'onError'>,
) {
  let streamError: unknown
  const result = streamText({
    ...options,
    onError: ({ error }) => {
      streamError = error
    },
  } as Parameters<typeof streamText>[0])

  let text: string
  try {
    text = await result.text
  }
  catch (error) {
    throw streamError ?? error
  }
  if (streamError) {
    throw streamError
  }

  const [usage, finishReason] = await Promise.all([result.usage, result.finishReason])
  return { text, usage, finishReason }
}

function truncateLogText(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, ' ').trim()
  if (compact.length <= maxLength) {
    return compact
  }
  return `${compact.slice(0, maxLength)}...`
}

function isPlaceholderErrorMessage(message: unknown): boolean {
  if (typeof message !== 'string') {
    return true
  }
  const normalized = message.trim().toLowerCase()
  return !normalized || normalized === '<none>'
}

function extractBodyErrorMessage(body: string): string | undefined {
  const trimmed = body.trim()
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
    return undefined
  }
  try {
    const parsed: unknown = JSON.parse(trimmed)
    const entry = Array.isArray(parsed) ? parsed[0] : parsed
    if (entry && typeof entry === 'object') {
      const errObj = (entry as Record<string, unknown>).error
      if (errObj && typeof errObj === 'object') {
        const msg = (errObj as Record<string, unknown>).message
        if (typeof msg === 'string' && msg.trim()) {
          return truncateLogText(msg, 240)
        }
      }
    }
  }
  catch {
    return undefined
  }
  return undefined
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
  if (typeof candidate.message === 'string' && !isPlaceholderErrorMessage(candidate.message)) {
    description.message = truncateLogText(candidate.message, 300)
  }
  if (typeof candidate.responseBody === 'string' && candidate.responseBody.trim()) {
    const extracted = extractBodyErrorMessage(candidate.responseBody)
    if (extracted && !description.message) {
      description.message = extracted
    }
    description.responseBodyPreview = truncateLogText(candidate.responseBody, 200)
  }
  if (candidate.cause instanceof Error && !isPlaceholderErrorMessage(candidate.cause.message)) {
    description.causeMessage = truncateLogText(candidate.cause.message, 200)
  }
  return description
}

function formatAttemptSummary(config: LlmConfig, description: LlmAttemptError): string {
  const parts = [`[${config.id}:${config.model}]`]
  if (description.statusCode !== undefined) {
    parts.push(`HTTP ${description.statusCode}`)
  }
  if (description.message) {
    parts.push(description.message)
  }
  else if (description.causeMessage) {
    parts.push(description.causeMessage)
  }
  else if (description.responseBodyPreview) {
    parts.push(description.responseBodyPreview)
  }
  else {
    parts.push(description.name || 'unknown error')
  }
  return parts.join(' ')
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
  const attemptSummaries: string[] = []
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
      const description = describeError(error)
      attemptSummaries.push(formatAttemptSummary(config, description))
      lastError = error
      console.warn('LLM provider attempt failed', {
        operation,
        provider: config.id,
        model: config.model,
        error: description,
      })
    }
  }

  // Construct a fresh Error when the provider error has an empty or workerd "<none>" message so
  // Cloudflare Workflows always shows every provider's real failure reason.
  if (!(lastError instanceof Error) || isPlaceholderErrorMessage(lastError.message)) {
    const errorName = lastError instanceof Error && lastError.name ? lastError.name : 'LLMError'
    const summaryError = new Error(`${errorName}: ${attemptSummaries.join(' | ')}`, { cause: lastError })
    summaryError.name = errorName
    throw summaryError
  }

  throw lastError
}
