import type { WorkflowParams } from '../workflow/types'
import { z } from 'zod'

export interface NormalizedWorkflowParams extends WorkflowParams {
  force: boolean
  phase: 'script' | 'audio'
  variant: string
}

interface WorkflowRequestError {
  ok: false
  status: 400 | 401 | 503
  code: 'AUTH_NOT_CONFIGURED' | 'INVALID_JSON' | 'INVALID_PARAMS' | 'UNAUTHORIZED'
  message: string
}

type WorkflowAuthResult = { ok: true } | WorkflowRequestError
type WorkflowParseResult = { ok: true, params: NormalizedWorkflowParams } | WorkflowRequestError

interface WorkflowInstanceIdInput {
  runEnv: string
  operationDate: string
  params: Pick<NormalizedWorkflowParams, 'variant' | 'phase'> & Partial<Pick<NormalizedWorkflowParams, 'force'>>
  idempotencyKey?: string | null
}

interface WorkflowInstanceHandle {
  id: string
}

interface WorkflowBindingLike<Params, Instance extends WorkflowInstanceHandle> {
  create: (options: { id: string, params: Params }) => Promise<Instance>
  get: (id: string) => Promise<Instance>
}

const calendarDateSchema = z.string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  })

const variantSchema = z.string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/)

const workflowParamsSchema = z.object({
  today: calendarDateSchema.optional(),
  force: z.boolean().optional(),
  variant: variantSchema.optional(),
  type: variantSchema.optional(),
  phase: z.enum(['script', 'audio']).optional(),
})

function constantTimeEqual(actual: string, expected: string): boolean {
  const length = Math.max(actual.length, expected.length)
  let difference = actual.length ^ expected.length

  for (let index = 0; index < length; index += 1) {
    difference |= (actual.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0)
  }

  return difference === 0
}

function parseBoolean(value: string | null): boolean | undefined | null {
  if (value === null) {
    return undefined
  }

  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false
  }
  return null
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export function authenticateWorkflowRequest(request: Request, expectedToken?: string): WorkflowAuthResult {
  if (!expectedToken) {
    return {
      ok: false,
      status: 503,
      code: 'AUTH_NOT_CONFIGURED',
      message: 'Workflow trigger is unavailable',
    }
  }

  const authorization = request.headers.get('authorization') || ''
  const match = authorization.match(/^Bearer (\S+)$/i)
  if (!match || match[1].length > 256 || !constantTimeEqual(match[1], expectedToken)) {
    return {
      ok: false,
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'A valid bearer token is required',
    }
  }

  return { ok: true }
}

export async function parseWorkflowRequest(request: Request): Promise<WorkflowParseResult> {
  const url = new URL(request.url)
  const queryForce = parseBoolean(url.searchParams.get('force'))
  if (queryForce === null) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_PARAMS',
      message: 'Workflow parameters are invalid',
    }
  }

  const queryParams: Record<string, unknown> = {
    today: url.searchParams.get('today') || undefined,
    force: queryForce,
    variant: url.searchParams.get('variant') || undefined,
    type: url.searchParams.get('type') || undefined,
    phase: url.searchParams.get('phase') || undefined,
  }

  let bodyParams: unknown = {}
  if ((request.headers.get('content-type') || '').toLowerCase().includes('application/json')) {
    try {
      bodyParams = await request.clone().json()
    }
    catch {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_JSON',
        message: 'Request body must be valid JSON',
      }
    }
  }

  if (typeof bodyParams !== 'object' || bodyParams === null || Array.isArray(bodyParams)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_PARAMS',
      message: 'Workflow parameters are invalid',
    }
  }

  const parsed = workflowParamsSchema.safeParse({
    ...queryParams,
    ...bodyParams,
  })

  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_PARAMS',
      message: 'Workflow parameters are invalid',
    }
  }

  let variant = parsed.data.variant || parsed.data.type || 'hacker-news'
  if (variant === 'main') {
    variant = 'hacker-news'
  }

  return {
    ok: true,
    params: {
      ...(parsed.data.today ? { today: parsed.data.today } : {}),
      variant,
      phase: parsed.data.phase || 'script',
      force: parsed.data.force || false,
    },
  }
}

export function resolveOperationDate(today: string | undefined, now = new Date(), timezoneOffset = 8): string {
  if (today) {
    return today
  }

  return new Date(now.getTime() + timezoneOffset * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export async function buildWorkflowInstanceId(input: WorkflowInstanceIdInput): Promise<string> {
  const force = Boolean(input.params.force)
  const idempotencyKey = input.idempotencyKey?.trim()

  if (force && !idempotencyKey) {
    throw new Error('Idempotency-Key is required when force is true')
  }
  if (idempotencyKey && !/^[\w.:-]{8,128}$/.test(idempotencyKey)) {
    throw new Error('Idempotency-Key must be 8-128 safe characters')
  }

  const identity = JSON.stringify({
    version: 1,
    runEnv: input.runEnv,
    operationDate: input.operationDate,
    variant: input.params.variant,
    phase: input.params.phase,
    rerun: force ? idempotencyKey : 'daily',
  })
  const digest = await sha256Hex(identity)

  return `podcast-${input.params.phase}-${input.operationDate.replaceAll('-', '')}-${digest.slice(0, 32)}`
}

export async function buildChildWorkflowInstanceId(parentInstanceId: string): Promise<string> {
  const digest = await sha256Hex(`podcast-audio-child:${parentInstanceId}`)
  return `podcast-audio-child-${digest.slice(0, 32)}`
}

export async function createIdempotentWorkflowInstance<Params, Instance extends WorkflowInstanceHandle>(
  binding: WorkflowBindingLike<Params, Instance>,
  options: { id: string, params: Params },
): Promise<{ instance: Instance, duplicateDetected: boolean }> {
  try {
    return {
      instance: await binding.create(options),
      duplicateDetected: false,
    }
  }
  catch (createError) {
    try {
      return {
        instance: await binding.get(options.id),
        duplicateDetected: true,
      }
    }
    catch {
      throw createError
    }
  }
}
