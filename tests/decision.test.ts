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
