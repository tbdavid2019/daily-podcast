export const WEBMCP_MAX_OUTPUT_LENGTH = 1500

export interface WebMcpTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  annotations?: {
    readOnlyHint?: boolean
    untrustedContentHint?: boolean
  }
  execute: (input: unknown) => Promise<unknown>
}

export interface WebMcpEpisodeInput {
  date: string
  variant: string
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const parsed = Date.parse(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value
}

export function normalizeWebMcpPage(input: unknown) {
  if (typeof input !== 'object' || input === null || !('page' in input)) {
    return 1
  }

  const page = (input as { page?: unknown }).page
  if (page === undefined) {
    return 1
  }

  if (typeof page !== 'number' || !Number.isSafeInteger(page) || page < 1 || page > 10) {
    throw new Error('頁碼必須是 1 到 10 之間的整數。')
  }

  return page
}

export function parseWebMcpEpisodeInput(input: unknown): WebMcpEpisodeInput {
  if (typeof input !== 'object' || input === null) {
    throw new Error('請提供包含 date 的物件。')
  }

  const values = input as { date?: unknown, variant?: unknown }
  if (typeof values.date !== 'string' || !isValidDate(values.date)) {
    throw new Error('date 必須使用有效的 YYYY-MM-DD 日期。')
  }

  const rawVariant = values.variant === undefined ? 'hacker-news' : values.variant
  if (typeof rawVariant !== 'string' || !/^[a-z0-9-]{1,32}$/.test(rawVariant)) {
    throw new Error('variant 只能包含小寫英文字母、數字和連字號。')
  }

  return {
    date: values.date,
    variant: rawVariant === 'main' ? 'hacker-news' : rawVariant,
  }
}

export function buildWebMcpEpisodePath({ date, variant }: WebMcpEpisodeInput) {
  const path = `/agent-markdown/post/${encodeURIComponent(date)}`
  return variant === 'hacker-news'
    ? path
    : `${path}/${encodeURIComponent(variant)}`
}

export function truncateWebMcpOutput(value: string) {
  if (value.length <= WEBMCP_MAX_OUTPUT_LENGTH) {
    return value
  }

  return `${value.slice(0, WEBMCP_MAX_OUTPUT_LENGTH - 1)}…`
}
