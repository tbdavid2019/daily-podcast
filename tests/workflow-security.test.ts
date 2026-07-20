import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  authenticateWorkflowRequest,
  buildChildWorkflowInstanceId,
  buildWorkflowInstanceId,
  createIdempotentWorkflowInstance,
  parseWorkflowRequest,
  resolveOperationDate,
} from '../worker/workflow-security'

describe('workflow authentication', () => {
  it('fails closed when the Worker secret is not configured', () => {
    const request = new Request('https://worker.example/workflow', {
      method: 'POST',
      headers: { Authorization: 'Bearer supplied-token' },
    })

    assert.deepEqual(authenticateWorkflowRequest(request, undefined), {
      ok: false,
      status: 503,
      code: 'AUTH_NOT_CONFIGURED',
      message: 'Workflow trigger is unavailable',
    })
  })

  it('rejects requests without a bearer token', () => {
    const request = new Request('https://worker.example/workflow', { method: 'POST' })

    assert.deepEqual(authenticateWorkflowRequest(request, 'server-token'), {
      ok: false,
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'A valid bearer token is required',
    })
  })

  it('rejects a bearer token with a different value', () => {
    const request = new Request('https://worker.example/workflow', {
      method: 'POST',
      headers: { Authorization: 'Bearer wrong-token' },
    })

    assert.equal(authenticateWorkflowRequest(request, 'server-token').ok, false)
  })

  it('rejects an oversized bearer token before comparing it', () => {
    const request = new Request('https://worker.example/workflow', {
      method: 'POST',
      headers: { Authorization: `Bearer ${'a'.repeat(257)}` },
    })

    assert.equal(authenticateWorkflowRequest(request, 'server-token').ok, false)
  })

  it('accepts the configured bearer token', () => {
    const request = new Request('https://worker.example/workflow', {
      method: 'POST',
      headers: { Authorization: 'Bearer server-token' },
    })

    assert.deepEqual(authenticateWorkflowRequest(request, 'server-token'), { ok: true })
  })
})

describe('workflow request parsing', () => {
  it('keeps query compatibility and normalizes the main variant alias', async () => {
    const request = new Request('https://worker.example/workflow?today=2026-07-20&type=main&phase=audio&force=true', {
      method: 'POST',
    })

    assert.deepEqual(await parseWorkflowRequest(request), {
      ok: true,
      params: {
        today: '2026-07-20',
        variant: 'hacker-news',
        phase: 'audio',
        force: true,
      },
    })
  })

  it('uses JSON values over query values', async () => {
    const request = new Request('https://worker.example/workflow?today=2026-07-19&phase=script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ today: '2026-07-20', phase: 'audio' }),
    })

    assert.deepEqual(await parseWorkflowRequest(request), {
      ok: true,
      params: {
        today: '2026-07-20',
        variant: 'hacker-news',
        phase: 'audio',
        force: false,
      },
    })
  })

  it('rejects malformed JSON instead of silently starting a default Workflow', async () => {
    const request = new Request('https://worker.example/workflow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    })

    assert.deepEqual(await parseWorkflowRequest(request), {
      ok: false,
      status: 400,
      code: 'INVALID_JSON',
      message: 'Request body must be valid JSON',
    })
  })

  it('rejects impossible calendar dates', async () => {
    const request = new Request('https://worker.example/workflow?today=2026-02-30', {
      method: 'POST',
    })

    const result = await parseWorkflowRequest(request)
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.code, 'INVALID_PARAMS')
      assert.equal(result.status, 400)
    }
  })
})

describe('workflow idempotency', () => {
  const now = new Date('2026-07-19T18:00:00.000Z')

  it('resolves an omitted date using the configured Taipei offset', () => {
    assert.equal(resolveOperationDate(undefined, now, 8), '2026-07-20')
  })

  it('returns the same instance ID for the same normal daily operation', async () => {
    const input = {
      runEnv: 'production',
      operationDate: '2026-07-20',
      params: { variant: 'hacker-news', phase: 'script' } as const,
    }

    const first = await buildWorkflowInstanceId(input)
    const second = await buildWorkflowInstanceId(input)

    assert.equal(first, second)
    assert.match(first, /^podcast-script-20260720-[a-f0-9]{32}$/)
    assert.ok(first.length <= 100)
  })

  it('requires an idempotency key for an intentional force rerun', async () => {
    await assert.rejects(
      buildWorkflowInstanceId({
        runEnv: 'production',
        operationDate: '2026-07-20',
        params: { variant: 'hacker-news', phase: 'audio', force: true },
      }),
      /Idempotency-Key/,
    )
  })

  it('deduplicates force retries with the same key and permits a new key', async () => {
    const base = {
      runEnv: 'production',
      operationDate: '2026-07-20',
      params: { variant: 'hacker-news', phase: 'audio', force: true } as const,
    }

    const first = await buildWorkflowInstanceId({ ...base, idempotencyKey: 'manual-run-1' })
    const retry = await buildWorkflowInstanceId({ ...base, idempotencyKey: 'manual-run-1' })
    const nextRun = await buildWorkflowInstanceId({ ...base, idempotencyKey: 'manual-run-2' })

    assert.equal(first, retry)
    assert.notEqual(first, nextRun)
  })

  it('derives a deterministic audio child ID from the parent instance', async () => {
    const first = await buildChildWorkflowInstanceId('podcast-script-20260720-abc123')
    const retry = await buildChildWorkflowInstanceId('podcast-script-20260720-abc123')
    const anotherParent = await buildChildWorkflowInstanceId('podcast-script-20260720-def456')

    assert.equal(first, retry)
    assert.notEqual(first, anotherParent)
    assert.match(first, /^podcast-audio-child-[a-f0-9]{32}$/)
  })

  it('creates a Workflow instance with the deterministic ID', async () => {
    const createdInstance = { id: 'podcast-script-created' }
    const binding = {
      async create(options: { id: string }) {
        assert.equal(options.id, 'podcast-script-created')
        return createdInstance
      },
      async get() {
        throw new Error('get should not be called')
      },
    }

    assert.deepEqual(
      await createIdempotentWorkflowInstance(binding, {
        id: 'podcast-script-created',
        params: { phase: 'script' },
      }),
      { instance: createdInstance, duplicateDetected: false },
    )
  })

  it('returns the existing instance when create reports the ID is already used', async () => {
    const existingInstance = { id: 'podcast-script-existing' }
    const binding = {
      async create() {
        throw new Error('instance ID already exists')
      },
      async get(id: string) {
        assert.equal(id, 'podcast-script-existing')
        return existingInstance
      },
    }

    assert.deepEqual(
      await createIdempotentWorkflowInstance(binding, {
        id: 'podcast-script-existing',
        params: { phase: 'script' },
      }),
      { instance: existingInstance, duplicateDetected: true },
    )
  })

  it('preserves the create error when no existing instance can be retrieved', async () => {
    const createError = new Error('service unavailable')
    const binding = {
      async create() {
        throw createError
      },
      async get() {
        throw new Error('instance not found')
      },
    }

    await assert.rejects(
      createIdempotentWorkflowInstance(binding, {
        id: 'podcast-script-failed',
        params: { phase: 'script' },
      }),
      error => error === createError,
    )
  })
})
