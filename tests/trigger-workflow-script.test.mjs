import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildTriggerRequest, parseArguments } from '../scripts/trigger-workflow.mjs'

describe('manual Workflow trigger script', () => {
  it('parses a forced script regeneration', () => {
    assert.deepEqual(
      parseArguments(['--phase', 'script', '--today', '2026-07-20', '--variant', 'main', '--force']),
      {
        phase: 'script',
        today: '2026-07-20',
        variant: 'main',
        force: true,
        idempotencyKey: undefined,
      },
    )
  })

  it('rejects unsupported arguments', () => {
    assert.throws(() => parseArguments(['--unknown']), /Unknown argument/)
  })

  it('builds an authenticated HTTPS request without exposing the token in the body', () => {
    const trigger = buildTriggerRequest({
      workerUrl: 'https://daily-podcast-worker.example.workers.dev',
      token: 'local-secret-token',
      options: {
        phase: 'audio',
        today: '2026-07-20',
        variant: 'hacker-news',
        force: true,
        idempotencyKey: undefined,
      },
      randomUUID: () => '11111111-2222-4333-8444-555555555555',
    })

    assert.equal(trigger.url, 'https://daily-podcast-worker.example.workers.dev/workflow')
    assert.equal(trigger.init.method, 'POST')
    assert.equal(trigger.init.headers.Authorization, 'Bearer local-secret-token')
    assert.equal(trigger.init.headers['Idempotency-Key'], '11111111-2222-4333-8444-555555555555')
    assert.equal(trigger.idempotencyKey, '11111111-2222-4333-8444-555555555555')
    assert.deepEqual(JSON.parse(trigger.init.body), {
      phase: 'audio',
      today: '2026-07-20',
      variant: 'hacker-news',
      force: true,
    })
    assert.equal(trigger.init.body.includes('local-secret-token'), false)
  })

  it('does not send an idempotency key for a normal daily invocation', () => {
    const trigger = buildTriggerRequest({
      workerUrl: 'https://worker.example/workflow',
      token: 'local-secret-token',
      options: {
        phase: 'script',
        variant: 'hacker-news',
        force: false,
        idempotencyKey: undefined,
      },
    })

    assert.equal('Idempotency-Key' in trigger.init.headers, false)
    assert.equal(trigger.idempotencyKey, undefined)
  })

  it('rejects an insecure remote Worker URL', () => {
    assert.throws(
      () => buildTriggerRequest({
        workerUrl: 'http://worker.example/workflow',
        token: 'local-secret-token',
        options: {
          phase: 'script',
          variant: 'hacker-news',
          force: false,
          idempotencyKey: undefined,
        },
      }),
      /HTTPS/,
    )
  })
})
