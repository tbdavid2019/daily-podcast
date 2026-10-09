import type { Story } from './types'

export interface SystemOneNoulQuestion {
  type: 'noul'
  instructions: string
  criteria?: { true?: string, false?: string }
}

export interface SystemOneNoulAnswer {
  type: 'noul'
  noul: number
}

export interface SystemOneRequest {
  model: string
  state: unknown
  questions: Record<string, SystemOneNoulQuestion>
}

export interface SystemOneResponse {
  model: string
  answers: Record<string, SystemOneNoulAnswer>
  usage?: {
    input_tokens: number
    output_tokens: number
  }
}

export interface DecisionEnv {
  CLEF_ENABLED?: string
  CLEF_BASE_URL?: string
  CLEF_FALLBACK_BASE_URL?: string
  CLEF_TIMEOUT_MS?: string
  JEV_ENABLED?: string
  JEV_BASE_URL?: string
  JEV_API_KEY?: string
  JEV_MODEL?: string
}

export const DEFAULT_CLEF_PRIMARY_URL = 'https://clef.create360.ai/v1/systemone'
export const DEFAULT_CLEF_BACKUP_URL = 'https://clef.aiurl.tw/v1/systemone'
export const DEFAULT_JEV_URL = 'https://api.typesafe.ai/v1/systemone'
export const DEFAULT_DECISION_TIMEOUT_MS = 50_000 // 50 seconds timeout for CPU backup node
export const DEFAULT_DECISION_BATCH_SIZE = 12 // Conservative batch size to prevent token overflow (< 2500 tokens)
export const DEFAULT_SCORE_THRESHOLD = 0.50 // Minimum suitability probability (quality threshold)

export function normalizeSystemOneEndpoint(rawUrl: string): string {
  let url = rawUrl.trim().replace(/\/$/, '')
  if (url.endsWith('/systemone')) {
    return url
  }
  if (!url.endsWith('/v1')) {
    url = `${url}/v1`
  }
  return `${url}/systemone`
}

export function parseDecisionTimeoutMs(value?: string, defaultMs = DEFAULT_DECISION_TIMEOUT_MS): number {
  if (!value) {
    return defaultMs
  }
  const parsed = Number.parseInt(value.trim(), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultMs
}

export interface DecisionTier {
  name: string
  url: string
  model: string
  apiKey?: string
  timeoutMs: number
}

export function resolveDecisionTiers(env: DecisionEnv, customTimeoutMs?: number): DecisionTier[] {
  const tiers: DecisionTier[] = []
  const clefTimeout = customTimeoutMs || parseDecisionTimeoutMs(env.CLEF_TIMEOUT_MS, DEFAULT_DECISION_TIMEOUT_MS)

  // Tier 0: Clef Primary
  const primaryUrl = normalizeSystemOneEndpoint(env.CLEF_BASE_URL || DEFAULT_CLEF_PRIMARY_URL)
  tiers.push({
    name: 'clef-primary',
    url: primaryUrl,
    model: 'clef-flash',
    timeoutMs: clefTimeout,
  })

  // Tier 1: Clef Backup (CPU node, supports up to 50s timeout)
  const backupUrl = normalizeSystemOneEndpoint(env.CLEF_FALLBACK_BASE_URL || DEFAULT_CLEF_BACKUP_URL)
  if (backupUrl !== primaryUrl) {
    tiers.push({
      name: 'clef-backup',
      url: backupUrl,
      model: 'clef-flash',
      timeoutMs: clefTimeout,
    })
  }

  // Tier 2: TypeSafe Jev Cloud (requires JEV_API_KEY)
  const jevEnabled = env.JEV_ENABLED !== 'false'
  const jevKey = env.JEV_API_KEY?.trim()
  if (jevEnabled && jevKey) {
    const jevUrl = normalizeSystemOneEndpoint(env.JEV_BASE_URL || DEFAULT_JEV_URL)
    tiers.push({
      name: 'jev-cloud',
      url: jevUrl,
      model: env.JEV_MODEL?.trim() || 'jev-latest',
      apiKey: jevKey,
      timeoutMs: 30_000,
    })
  }

  return tiers
}

export async function callSingleTier(
  tier: DecisionTier,
  request: SystemOneRequest,
): Promise<SystemOneResponse> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), tier.timeoutMs)

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  }
  if (tier.apiKey) {
    headers.Authorization = `Bearer ${tier.apiKey}`
  }

  const payload = {
    ...request,
    model: tier.model,
  }

  try {
    const response = await fetch(tier.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      throw new Error(`HTTP ${response.status} ${response.statusText}: ${errText.slice(0, 300)}`)
    }

    const data = await response.json() as SystemOneResponse
    if (!data || typeof data !== 'object' || !data.answers) {
      throw new Error('Invalid System One response format')
    }

    return data
  }
  finally {
    clearTimeout(timeoutId)
  }
}

export async function callDecisionSystemOne(
  request: SystemOneRequest,
  env: DecisionEnv,
  options: { timeoutMs?: number, deadline?: number } = {},
): Promise<{ response: SystemOneResponse, tierUsed: string }> {
  const tiers = resolveDecisionTiers(env, options.timeoutMs)
  let lastError: Error | null = null

  for (const tier of tiers) {
    const remainingMs = options.deadline ? options.deadline - Date.now() : tier.timeoutMs
    if (remainingMs <= 2000) {
      console.warn(`[Decision System One] Skipping tier ${tier.name} due to low time budget (${remainingMs}ms remaining)`)
      break
    }

    const effectiveTier: DecisionTier = {
      ...tier,
      timeoutMs: Math.min(tier.timeoutMs, Math.max(1000, remainingMs)),
    }

    try {
      console.info(`[Decision System One] Attempting tier: ${effectiveTier.name} (${effectiveTier.url}), timeout: ${effectiveTier.timeoutMs}ms`)
      const start = Date.now()
      const response = await callSingleTier(effectiveTier, request)
      const durationMs = Date.now() - start
      console.info(`[Decision System One] Success via ${effectiveTier.name} in ${durationMs}ms, tokens: in=${response.usage?.input_tokens ?? 0}`)
      return { response, tierUsed: effectiveTier.name }
    }
    catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err))
      console.warn(`[Decision System One] Tier ${effectiveTier.name} failed:`, error.message)
      lastError = error
    }
  }

  throw new Error(`All decision tiers failed. Last error: ${lastError?.message || 'unknown'}`)
}

export function chunkArray<T>(items: readonly T[], chunkSize: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize))
  }
  return chunks
}

export interface CurateStoriesOptions {
  batchSize?: number
  minScoreThreshold?: number
  targetBudget?: number
  minBudget?: number
  maxBudget?: number
  targetLimits?: Record<string, number>
  hnFloor?: number
  hnTarget?: number
  maxSecondaryStories?: number
  timeoutMs?: number
  overallTimeoutMs?: number
  delayBetweenBatchesMs?: number
}

export function isObituaryOrMemorial(title?: string): boolean {
  if (!title) {
    return false
  }
  return /\b(?:has died|passed away|dies at \d+|dead at \d+|in memoriam|obituary|r\.?i\.?p\.?)\b/i.test(title)
    || /辭世|逝世|去世|享年|訃告|訃聞|逝去/.test(title)
}

/**
 * 依據決策模型對候選故事進行批次評分與篩選
 * 採保守分批策略（預設每批 12 篇），避免擠爆模型上下文視窗（4096 tokens）與保護自架 CPU 節點
 */
export async function curateStoriesWithDecision(
  stories: readonly Story[],
  env: DecisionEnv,
  options: CurateStoriesOptions = {},
): Promise<Story[]> {
  const candidateStories = stories.filter((story) => {
    if (isObituaryOrMemorial(story.title)) {
      console.info(`[Decision] Excluding obituary/memorial topic: "${story.title}"`)
      return false
    }
    return true
  })

  if (!candidateStories.length) {
    return []
  }

  // 若使用者明確關閉 Clef
  if (env.CLEF_ENABLED === 'false') {
    console.info('[Decision] Clef is explicitly disabled via CLEF_ENABLED=false, keeping candidate stories')
    return candidateStories
  }

  const batchSize = Math.max(1, options.batchSize || DEFAULT_DECISION_BATCH_SIZE)
  const minThreshold = options.minScoreThreshold ?? DEFAULT_SCORE_THRESHOLD
  const overallTimeoutMs = options.overallTimeoutMs ?? 90_000
  const deadline = Date.now() + overallTimeoutMs
  const batches = chunkArray(candidateStories, batchSize)
  const scoredStories: Story[] = []

  console.info(`[Decision] Curating ${candidateStories.length} stories across ${batches.length} batch(es) of max ${batchSize}, budget: ${overallTimeoutMs}ms`)

  for (let bIndex = 0; bIndex < batches.length; bIndex++) {
    const batch = batches[bIndex]

    if (Date.now() >= deadline - 3000) {
      console.warn(`[Decision] Curation deadline reached before batch ${bIndex + 1}/${batches.length}, using neutral score for remaining`)
      for (const story of batch) {
        scoredStories.push({
          ...story,
          decisionScore: 0.5,
        })
      }
      continue
    }

    if (bIndex > 0 && options.delayBetweenBatchesMs) {
      await new Promise(resolve => setTimeout(resolve, options.delayBetweenBatchesMs))
    }

    const state = batch.map((story, idx) => ({
      id: story.id || `idx-${idx}`,
      title: story.title || '',
      source: story.source || 'unknown',
      ...(story.description ? { description: story.description.slice(0, 150) } : {}),
    }))

    const questionKeys: string[] = []
    const questions: Record<string, SystemOneNoulQuestion> = {}
    for (const [idx, story] of batch.entries()) {
      const safeId = (story.id || '').replace(/[^\w-]/g, '_').slice(0, 30)
      const qKey = `fit_${bIndex}_${idx}_${safeId}`
      questionKeys.push(qKey)
      questions[qKey] = {
        type: 'noul',
        instructions: 'Rate the suitability of this topic for a premier daily hacker & tech news podcast (like Hacker News Daily). High suitability (0.7-1.0): cutting-edge AI/LLM models, developer tooling, databases, open-source projects, system engineering, security research, and hacker tech culture. Low suitability (0.0-0.4): obituaries/memorials, hiring/job ads, beginner tutorials, corporate PR marketing, or general non-tech news.',
      }
    }

    try {
      const { response, tierUsed } = await callDecisionSystemOne(
        { model: 'clef-flash', state, questions },
        env,
        { timeoutMs: options.timeoutMs, deadline },
      )

      for (const [idx, story] of batch.entries()) {
        const qKey = questionKeys[idx]
        const answer = response.answers[qKey]
        const score = typeof answer?.noul === 'number' ? answer.noul : 0.5
        scoredStories.push({
          ...story,
          decisionScore: score,
        })
      }
      console.info(`[Decision] Batch ${bIndex + 1}/${batches.length} evaluated via ${tierUsed}`)
    }
    catch (err: unknown) {
      console.warn(`[Decision] Batch ${bIndex + 1}/${batches.length} decision call failed, using neutral score:`, err instanceof Error ? err.message : err)
      for (const story of batch) {
        scoredStories.push({
          ...story,
          decisionScore: 0.5,
        })
      }
    }
  }

  // 排序：高分優先
  const sorted = [...scoredStories].sort((a, b) => (b.decisionScore ?? 0) - (a.decisionScore ?? 0))
  const targetFloor = options.minBudget ?? (options.targetBudget ? Math.min(options.targetBudget, 5) : 5)
  const minKeepCount = Math.min(sorted.length, targetFloor)
  const effectiveMaxBudget = options.maxBudget ?? options.targetBudget

  // 依來源限制與分數挑選故事（雙軌制：確保 Hacker News 核心主力地位，副來源點綴多樣性）
  let finalSelection: Story[] = []
  if (options.targetLimits && Object.keys(options.targetLimits).length > 0) {
    const limits = options.targetLimits
    const hnLimit = limits['hacker-news'] ?? 8
    const hnFloor = Math.min(options.hnFloor ?? 6, hnLimit)
    const hnTarget = Math.min(options.hnTarget ?? 7, hnLimit)
    const maxSecondary = options.maxSecondaryStories ?? 4

    // 分流：Hacker News 與副來源獨立評估
    const hnStories = sorted.filter(s => s.source === 'hacker-news')
    const secondaryStories = sorted.filter(s => s.source !== 'hacker-news')

    // 1. Hacker News 主軌挑選
    const hnQualified = hnStories.filter(s => (s.decisionScore ?? 0) >= minThreshold)
    let selectedHn: Story[] = []

    if (hnQualified.length >= hnTarget) {
      // 超過或達到目標篇數：取至上限 (最多 hnLimit 篇，例如 8 篇)
      selectedHn = hnQualified.slice(0, hnLimit)
    }
    else if (hnQualified.length >= hnFloor) {
      // 介於保底與目標篇數之間：保留全部合格文章
      selectedHn = hnQualified
    }
    else {
      // 合格數量不足保底篇數：取全部合格文章，並由未達門檻文章中依最高分依序補足至保底篇數 (hnFloor 篇)
      const needed = Math.min(hnStories.length, hnFloor) - hnQualified.length
      const unqualified = hnStories.filter(s => (s.decisionScore ?? 0) < minThreshold)
      selectedHn = [...hnQualified, ...unqualified.slice(0, needed)]
    }

    // 2. 副來源客座軌挑選 (嚴格限制每源上限，且總量不超過 maxSecondary)
    const secondaryCounts: Record<string, number> = {}
    const selectedSecondary: Story[] = []

    for (const story of secondaryStories) {
      if (selectedSecondary.length >= maxSecondary) {
        break
      }
      const src = story.source || 'unknown'
      const limit = limits[src]
      const count = secondaryCounts[src] || 0
      const passesThreshold = (story.decisionScore ?? 0) >= minThreshold

      if (passesThreshold && (typeof limit !== 'number' || count < limit)) {
        selectedSecondary.push(story)
        secondaryCounts[src] = count + 1
      }
    }

    finalSelection = [...selectedHn, ...selectedSecondary]

    // 若通過門檻或合格數量未達 minKeepCount：
    // 第一階段：優先從未入選的故事中挑選「仍符合來源配額上限」的故事（按分數由高到低，確保社群多樣性與遵守上限）
    if (finalSelection.length < minKeepCount) {
      const selectedIds = new Set(finalSelection.map(s => s.id))
      const currentCounts: Record<string, number> = {
        'hacker-news': selectedHn.length,
        ...secondaryCounts,
      }
      const unselected = sorted.filter(s => s.id && !selectedIds.has(s.id))
      const remainingUnselected: Story[] = []

      for (const story of unselected) {
        if (finalSelection.length >= minKeepCount) {
          remainingUnselected.push(story)
          continue
        }
        const src = story.source || 'unknown'
        const limit = limits[src]
        const count = currentCounts[src] || 0
        if (typeof limit !== 'number' || count < limit) {
          finalSelection.push(story)
          currentCounts[src] = count + 1
        }
        else {
          remainingUnselected.push(story)
        }
      }

      // 第二階段：若所有來源上限皆已滿仍未達 minKeepCount，再依分數補齊缺額
      if (finalSelection.length < minKeepCount) {
        const needed = minKeepCount - finalSelection.length
        finalSelection.push(...remainingUnselected.slice(0, needed))
      }
    }

    // 最終按分數由高到低排序呈現
    finalSelection.sort((a, b) => (b.decisionScore ?? 0) - (a.decisionScore ?? 0))
  }
  else {
    const filtered = sorted.filter(s => (s.decisionScore ?? 0) >= minThreshold)
    finalSelection = filtered.length >= minKeepCount ? filtered : sorted.slice(0, minKeepCount)
  }

  // 若有指定最大篇數限制 (maxBudget，預設上限 9 篇)，截取前 N 篇
  if (typeof effectiveMaxBudget === 'number' && effectiveMaxBudget > 0 && finalSelection.length > effectiveMaxBudget) {
    finalSelection = finalSelection.slice(0, effectiveMaxBudget)
  }

  console.info(`[Decision] Curated ${finalSelection.length} stories (target range ${minKeepCount}-${effectiveMaxBudget ?? 'unlimited'}) from ${stories.length} candidates. Top score: ${finalSelection[0]?.decisionScore?.toFixed(3)}, Lowest: ${finalSelection[finalSelection.length - 1]?.decisionScore?.toFixed(3)}`)
  return finalSelection
}
