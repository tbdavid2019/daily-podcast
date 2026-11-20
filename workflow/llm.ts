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

export interface StreamedCompletionResult {
  text: string
  usage: unknown
  finishReason?: string
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

export function resolveLlmTimeoutMs(env: object): number {
  return Number.parseInt(firstString(env, ['LLM_TIMEOUT_MS']) || '', 10) || DEFAULT_LLM_TIMEOUT_MS
}

export function resolveLlmModel(config: LlmConfig, kind: 'standard' | 'thinking'): string {
  return kind === 'thinking' ? config.thinkingModel : config.model
}

function createApiCallError(message: string, details?: { statusCode?: number, responseBody?: string }): Error {
  return Object.assign(new Error(message), {
    name: 'AI_APICallError',
    ...(details?.statusCode !== undefined ? { statusCode: details.statusCode } : {}),
    ...(details?.responseBody !== undefined ? { responseBody: details.responseBody } : {}),
  })
}

function extractChatErrorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined
  }
  const errObj = (payload as Record<string, unknown>).error
  if (!errObj || typeof errObj !== 'object') {
    return undefined
  }
  const msg = (errObj as Record<string, unknown>).message
  if (typeof msg === 'string' && msg.trim()) {
    return truncateLogText(msg, 240)
  }
  return truncateLogText(JSON.stringify(errObj), 240)
}

/**
 * Stream an OpenAI-compatible chat completion directly over fetch + native SSE parsing.
 * Avoids AI SDK / Zod per-chunk stream overhead (~5ms vs ~5s CPU on 4k chunks) while keeping
 * SSE chunks flowing so reverse proxies do not trigger Cloudflare 100s HTTP 524 timeouts.
 */
export async function streamOpenAiChatCompletion(options: {
  config: LlmConfig
  model: string
  system: string
  prompt: string
  maxOutputTokens?: number
  timeoutMs?: number
  fetchImpl?: typeof fetch
}): Promise<StreamedCompletionResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_LLM_TIMEOUT_MS
  const fetchFn = options.fetchImpl ?? fetch
  const endpoint = `${options.config.baseUrl.replace(/\/+$/, '')}/chat/completions`
  const controller = new AbortController()
  const timeoutId = setTimeout(
    () => controller.abort(new Error(`LLM call timed out after ${timeoutMs}ms`)),
    timeoutMs,
  )

  try {
    const response = await fetchFn(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${options.config.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream, application/json',
      },
      body: JSON.stringify({
        model: options.model,
        messages: [
          { role: 'system', content: options.system },
          { role: 'user', content: options.prompt },
        ],
        stream: true,
        ...(options.maxOutputTokens !== undefined ? { max_tokens: options.maxOutputTokens } : {}),
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const responseBody = await response.text().catch(() => '')
      throw createApiCallError(
        `HTTP ${response.status}${responseBody ? `: ${truncateLogText(responseBody, 240)}` : ''}`,
        { statusCode: response.status, responseBody },
      )
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase()
    if (!response.body || contentType.includes('application/json')) {
      const bodyText = await response.text()
      const parsed: unknown = JSON.parse(bodyText)
      const apiErr = extractChatErrorMessage(parsed)
      if (apiErr) {
        throw createApiCallError(apiErr, { responseBody: bodyText })
      }
      const record = parsed as Record<string, unknown>
      const choices = record.choices as Array<Record<string, unknown>> | undefined
      const first = choices?.[0]
      const msg = first?.message as Record<string, unknown> | undefined
      const text = typeof msg?.content === 'string' ? msg.content : ''
      if (!text) {
        throw createApiCallError('Empty JSON completion response', { responseBody: bodyText })
      }
      const finishReason = typeof first?.finish_reason === 'string' ? first.finish_reason : undefined
      return { text, usage: record.usage, finishReason }
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    let sawDataLine = false
    let rawPreview = ''
    let doneSeen = false
    const parts: string[] = []
    let usage: unknown
    let finishReason: string | undefined

    const processLine = (rawLine: string): boolean => {
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
      if (!line || line.startsWith(':')) {
        return false
      }
      if (!line.startsWith('data:')) {
        return false
      }
      sawDataLine = true
      const payload = line.slice(5).trim()
      if (!payload) {
        return false
      }
      if (payload === '[DONE]') {
        return true
      }

      // Skip reasoning-only deltas without JSON.parse to stay well inside Workers 10ms CPU budget.
      if (
        !payload.includes('"content"')
        && !payload.includes('"error"')
        && !payload.includes('"usage"')
        && !payload.includes('"message"')
        && (!payload.includes('"finish_reason"') || payload.includes('"finish_reason":null'))
      ) {
        return false
      }

      let chunk: Record<string, unknown>
      try {
        chunk = JSON.parse(payload) as Record<string, unknown>
      }
      catch {
        return false
      }

      const streamErr = extractChatErrorMessage(chunk)
      if (streamErr) {
        throw createApiCallError(streamErr, { responseBody: payload })
      }
      if (chunk.usage !== undefined) {
        usage = chunk.usage
      }

      const choices = chunk.choices as Array<Record<string, unknown>> | undefined
      const first = choices?.[0]
      if (first) {
        if (typeof first.finish_reason === 'string') {
          finishReason = first.finish_reason
        }
        const delta = first.delta as Record<string, unknown> | undefined
        const deltaContent = delta?.content
        if (typeof deltaContent === 'string' && deltaContent.length > 0) {
          parts.push(deltaContent)
        }
        else {
          const messageContent = (first.message as Record<string, unknown> | undefined)?.content
          if (typeof messageContent === 'string' && messageContent.length > 0) {
            parts.push(messageContent)
          }
        }
      }
      return false
    }

    while (!doneSeen) {
      const { done, value } = await reader.read()
      if (done) {
        buffer += decoder.decode()
        break
      }
      const chunkText = decoder.decode(value, { stream: true })
      if (!sawDataLine && rawPreview.length < 512) {
        rawPreview += chunkText.slice(0, 512 - rawPreview.length)
      }
      buffer += chunkText

      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex)
        buffer = buffer.slice(newlineIndex + 1)
        if (processLine(line)) {
          doneSeen = true
          break
        }
        newlineIndex = buffer.indexOf('\n')
      }
    }

    if (!doneSeen && buffer.length > 0) {
      for (const line of buffer.split('\n')) {
        if (processLine(line)) {
          break
        }
      }
    }

    if (doneSeen) {
      void reader.cancel().catch(() => undefined)
    }

    const text = parts.join('')
    if (!text) {
      if (!sawDataLine && rawPreview.trim().startsWith('{')) {
        try {
          const parsedErr: unknown = JSON.parse(rawPreview)
          const apiErr = extractChatErrorMessage(parsedErr)
          if (apiErr) {
            throw createApiCallError(apiErr, { responseBody: rawPreview })
          }
        }
        catch (err) {
          if (err instanceof Error && err.name === 'AI_APICallError') {
            throw err
          }
        }
      }
      throw createApiCallError('Empty SSE completion stream', { responseBody: rawPreview || undefined })
    }

    return { text, usage, finishReason }
  }
  finally {
    clearTimeout(timeoutId)
  }
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
