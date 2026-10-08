import assert from 'node:assert/strict'
import test from 'node:test'
import {
  chunkArray,
  curateStoriesWithDecision,
  DEFAULT_DECISION_TIMEOUT_MS,
  normalizeSystemOneEndpoint,
  parseDecisionTimeoutMs,
  resolveDecisionTiers,
} from '../workflow/decision'
import type { Story } from '../workflow/types'

test('normalizeSystemOneEndpoint handles varied URL forms', () => {
  assert.equal(
    normalizeSystemOneEndpoint('https://clef.create360.ai/v1/systemone'),
    'https://clef.create360.ai/v1/systemone',
  )
  assert.equal(
    normalizeSystemOneEndpoint('https://clef.create360.ai/v1/'),
    'https://clef.create360.ai/v1/systemone',
  )
  assert.equal(
    normalizeSystemOneEndpoint('https://clef.create360.ai'),
    'https://clef.create360.ai/v1/systemone',
  )
})

test('parseDecisionTimeoutMs honors 50-second default and custom values', () => {
  assert.equal(parseDecisionTimeoutMs(undefined), 50_000)
  assert.equal(parseDecisionTimeoutMs(''), 50_000)
  assert.equal(parseDecisionTimeoutMs('60000'), 60_000)
  assert.equal(parseDecisionTimeoutMs('invalid'), 50_000)
})

test('resolveDecisionTiers configures primary, backup and Jev cloud tiers', () => {
  // Scenario 1: No JEV_API_KEY -> only Clef primary and backup
  const tiersWithoutJev = resolveDecisionTiers({
    CLEF_BASE_URL: 'https://clef.create360.ai/v1',
    CLEF_FALLBACK_BASE_URL: 'https://clef.aiurl.tw/v1',
  })
  assert.equal(tiersWithoutJev.length, 2)
  assert.equal(tiersWithoutJev[0].name, 'clef-primary')
  assert.equal(tiersWithoutJev[0].url, 'https://clef.create360.ai/v1/systemone')
  assert.equal(tiersWithoutJev[0].timeoutMs, DEFAULT_DECISION_TIMEOUT_MS)
  assert.equal(tiersWithoutJev[1].name, 'clef-backup')
  assert.equal(tiersWithoutJev[1].url, 'https://clef.aiurl.tw/v1/systemone')
  assert.equal(tiersWithoutJev[1].timeoutMs, DEFAULT_DECISION_TIMEOUT_MS)

  // Scenario 2: With JEV_API_KEY -> includes fallback 3 (jev-cloud)
  const tiersWithJev = resolveDecisionTiers({
    CLEF_BASE_URL: 'https://clef.create360.ai/v1',
    CLEF_FALLBACK_BASE_URL: 'https://clef.aiurl.tw/v1',
    CLEF_TIMEOUT_MS: '50000',
    JEV_ENABLED: 'true',
    JEV_BASE_URL: 'https://api.typesafe.ai/v1',
    JEV_API_KEY: 'test-jev-key-123',
    JEV_MODEL: 'jev-latest',
  })
  assert.equal(tiersWithJev.length, 3)
  assert.equal(tiersWithJev[2].name, 'jev-cloud')
  assert.equal(tiersWithJev[2].url, 'https://api.typesafe.ai/v1/systemone')
  assert.equal(tiersWithJev[2].apiKey, 'test-jev-key-123')
  assert.equal(tiersWithJev[2].model, 'jev-latest')
})

test('chunkArray partitions items into conservative batches', () => {
  const items = Array.from({ length: 25 }, (_, i) => i)
  const chunks = chunkArray(items, 12)
  assert.equal(chunks.length, 3)
  assert.equal(chunks[0].length, 12)
  assert.equal(chunks[1].length, 12)
  assert.equal(chunks[2].length, 1)
})

test('curateStoriesWithDecision respects CLEF_ENABLED=false', async () => {
  const stories: Story[] = [
    { id: '1', title: 'Story 1', source: 'hacker-news' },
    { id: '2', title: 'Story 2', source: 'reddit' },
  ]
  const result = await curateStoriesWithDecision(stories, { CLEF_ENABLED: 'false' })
  assert.equal(result.length, 2)
  assert.equal(result[0].id, '1')
  assert.equal(result[1].id, '2')
})

test('curateStoriesWithDecision filters and ranks with mock decision endpoint', async () => {
  const mockStories: Story[] = [
    { id: 's1', title: 'Obituary for someone', source: 'hacker-news' },
    { id: 's2', title: 'SQLite in Browser WASM', source: 'hacker-news' },
    { id: 's3', title: 'Political debate', source: 'reddit' },
    { id: 's4', title: 'LocalLLaMA fine tuning', source: 'reddit' },
    { id: 's5', title: 'VLLM high throughput', source: 'github-trending' },
    { id: 's6', title: 'Ask HN: Who is hiring?', source: 'hacker-news' },
  ]

  // Intercept fetch locally for this test
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(init?.body as string)
    const questions = body.questions as Record<string, { type: string, instructions: string }>
    const answers: Record<string, { type: 'noul', noul: number }> = {}

    for (const qKey of Object.keys(questions)) {
      if (qKey.includes('s2') || qKey.includes('s4') || qKey.includes('s5')) {
        answers[qKey] = { type: 'noul', noul: 0.85 }
      }
      else {
        answers[qKey] = { type: 'noul', noul: 0.1 }
      }
    }

    return new Response(JSON.stringify({
      model: 'clef-flash',
      answers,
      usage: { input_tokens: 500, output_tokens: 0 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    const result = await curateStoriesWithDecision(mockStories, {
      CLEF_ENABLED: 'true',
      CLEF_BASE_URL: 'https://clef.create360.ai/v1',
    }, {
      batchSize: 10,
      minScoreThreshold: 0.45,
    })

    // Should rank s2, s4, s5 highest, but keep safety floor of at least 5
    assert.equal(result.length, 5)
    assert.equal(result[0].decisionScore, 0.85)
    assert.equal(result[1].decisionScore, 0.85)
    assert.equal(result[2].decisionScore, 0.85)
    assert.ok(['s2', 's4', 's5'].includes(result[0].id!))
  }
  finally {
    globalThis.fetch = originalFetch
  }
})

test('curateStoriesWithDecision gracefully falls back when all tiers fail', async () => {
  const mockStories: Story[] = [
    { id: 's1', title: 'Story 1', source: 'hacker-news' },
    { id: 's2', title: 'Story 2', source: 'reddit' },
  ]

  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => {
    throw new Error('Connection refused')
  }

  try {
    const result = await curateStoriesWithDecision(mockStories, {
      CLEF_ENABLED: 'true',
    }, {
      timeoutMs: 1000,
    })

    assert.equal(result.length, 2)
    assert.equal(result[0].decisionScore, 0.5) // neutral fallback score
    assert.equal(result[1].decisionScore, 0.5)
  }
  finally {
    globalThis.fetch = originalFetch
  }
})

test('curateStoriesWithDecision enforces Plan B per-source caps and overall budget', async () => {
  const mockStories: Story[] = [
    // 4 HN stories (all high score)
    { id: 'hn-1', title: 'HN Top 1', source: 'hacker-news' },
    { id: 'hn-2', title: 'HN Top 2', source: 'hacker-news' },
    { id: 'hn-3', title: 'HN Top 3', source: 'hacker-news' },
    { id: 'hn-4', title: 'HN Top 4', source: 'hacker-news' },
    // 2 Dev.to stories (high score)
    { id: 'dev-1', title: 'Dev.to Gem 1', source: 'dev-to' },
    { id: 'dev-2', title: 'Dev.to Gem 2', source: 'dev-to' },
    // 2 Reddit stories (moderate score)
    { id: 'red-1', title: 'Reddit Good', source: 'reddit' },
    { id: 'red-2', title: 'Reddit Low', source: 'reddit' },
  ]

  const originalFetch = globalThis.fetch
  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(init?.body as string)
    const questions = body.questions as Record<string, { type: string, instructions: string }>
    const answers: Record<string, { type: 'noul', noul: number }> = {}

    for (const qKey of Object.keys(questions)) {
      if (qKey.includes('hn-1')) answers[qKey] = { type: 'noul', noul: 0.95 }
      else if (qKey.includes('hn-2')) answers[qKey] = { type: 'noul', noul: 0.90 }
      else if (qKey.includes('hn-3')) answers[qKey] = { type: 'noul', noul: 0.85 }
      else if (qKey.includes('hn-4')) answers[qKey] = { type: 'noul', noul: 0.80 }
      else if (qKey.includes('dev-1')) answers[qKey] = { type: 'noul', noul: 0.92 }
      else if (qKey.includes('dev-2')) answers[qKey] = { type: 'noul', noul: 0.88 }
      else if (qKey.includes('red-1')) answers[qKey] = { type: 'noul', noul: 0.70 }
      else answers[qKey] = { type: 'noul', noul: 0.30 } // red-2 filtered
    }

    return new Response(JSON.stringify({
      model: 'clef-flash',
      answers,
      usage: { input_tokens: 600, output_tokens: 0 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    const targetLimits = {
      'hacker-news': 2, // cap HN to at most 2 stories
      'dev-to': 2,
      'reddit': 2,
    }
    const result = await curateStoriesWithDecision(mockStories, {
      CLEF_ENABLED: 'true',
    }, {
      targetLimits,
      targetBudget: 4, // podcast budget is 4
      minScoreThreshold: 0.45,
    })

    // Despite 4 HN stories scoring high, HN cap of 2 is respected
    const hnCount = result.filter(s => s.source === 'hacker-news').length
    const devCount = result.filter(s => s.source === 'dev-to').length
    assert.equal(hnCount, 2)
    assert.equal(devCount, 2)
    assert.equal(result.length, 4)
    // Ordered by score descending
    assert.equal(result[0].id, 'hn-1') // 0.95
    assert.equal(result[1].id, 'dev-1') // 0.92
    assert.equal(result[2].id, 'hn-2') // 0.90
    assert.equal(result[3].id, 'dev-2') // 0.88
  }
  finally {
    globalThis.fetch = originalFetch
  }
})

test('curateStoriesWithDecision dynamically floats within minBudget and maxBudget based on score', async () => {
  const candidates: Story[] = Array.from({ length: 12 }, (_, i) => ({
    id: `item-${i + 1}`,
    title: `Story ${i + 1}`,
    source: (i % 2 === 0 ? 'hacker-news' : 'reddit') as Story['source'],
  }))

  const originalFetch = globalThis.fetch

  try {
    // Scenario A: Exactly 7 stories score >= 0.50 (between min 6 and max 9) -> selects exactly 7 stories!
    globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string)
      const questions = body.questions as Record<string, { type: string, instructions: string }>
      const answers: Record<string, { type: 'noul', noul: number }> = {}

      for (const qKey of Object.keys(questions)) {
        const match = qKey.match(/item-(\d+)/)
        const num = match ? Number.parseInt(match[1], 10) : 99
        answers[qKey] = { type: 'noul', noul: num <= 7 ? 0.70 : 0.20 }
      }

      return new Response(JSON.stringify({
        model: 'clef-flash',
        answers,
        usage: { input_tokens: 500, output_tokens: 0 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    const resA = await curateStoriesWithDecision(candidates, { CLEF_ENABLED: 'true' }, {
      minBudget: 6,
      maxBudget: 9,
      minScoreThreshold: 0.50,
    })
    assert.equal(resA.length, 7)

    // Scenario B: Only 4 stories score >= 0.50 -> backfills 2 to meet minBudget of 6!
    globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string)
      const questions = body.questions as Record<string, { type: string, instructions: string }>
      const answers: Record<string, { type: 'noul', noul: number }> = {}

      for (const qKey of Object.keys(questions)) {
        const match = qKey.match(/item-(\d+)/)
        const num = match ? Number.parseInt(match[1], 10) : 99
        answers[qKey] = { type: 'noul', noul: num <= 4 ? 0.80 : 0.30 }
      }

      return new Response(JSON.stringify({
        model: 'clef-flash',
        answers,
        usage: { input_tokens: 500, output_tokens: 0 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    const resB = await curateStoriesWithDecision(candidates, { CLEF_ENABLED: 'true' }, {
      minBudget: 6,
      maxBudget: 9,
      minScoreThreshold: 0.50,
    })
    assert.equal(resB.length, 6)

    // Scenario C: All 12 stories score >= 0.50 -> capped at maxBudget of 9!
    globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string)
      const questions = body.questions as Record<string, { type: string, instructions: string }>
      const answers: Record<string, { type: 'noul', noul: number }> = {}

      for (const qKey of Object.keys(questions)) {
        answers[qKey] = { type: 'noul', noul: 0.85 }
      }

      return new Response(JSON.stringify({
        model: 'clef-flash',
        answers,
        usage: { input_tokens: 500, output_tokens: 0 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    const resC = await curateStoriesWithDecision(candidates, { CLEF_ENABLED: 'true' }, {
      minBudget: 6,
      maxBudget: 9,
      minScoreThreshold: 0.50,
    })
    assert.equal(resC.length, 9)
  }
  finally {
    globalThis.fetch = originalFetch
  }
})
