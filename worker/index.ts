export { PodcastScriptWorkflow } from '../workflow/index'
export { PodcastAudioWorkflow } from '../workflow/audio'
import type { WorkflowParams } from '../workflow/types'

interface Env extends CloudflareEnv {
  HACKER_NEWS_WORKFLOW: Workflow
  HACKER_NEWS_AUDIO_WORKFLOW: Workflow
  HACKER_NEWS_KV: KVNamespace
  BROWSER: Fetcher
  ASSETS: Fetcher
  WORKER_ENV?: string
}

function parseBoolean(value: string | null): boolean | undefined {
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
  return undefined
}

async function extractParamsFromRequest(request: Request): Promise<WorkflowParams | undefined> {
  const url = new URL(request.url)
  const params: WorkflowParams = {}

  const todayFromQuery = url.searchParams.get('today')?.trim()
  if (todayFromQuery) {
    params.today = todayFromQuery
  }

  const forceFromQuery = parseBoolean(url.searchParams.get('force'))
  if (forceFromQuery !== undefined) {
    params.force = forceFromQuery
  }

  const variantFromQuery = url.searchParams.get('variant')?.trim() || url.searchParams.get('type')?.trim()
  if (variantFromQuery) {
    params.variant = variantFromQuery
  }
  
  const phaseFromQuery = url.searchParams.get('phase')?.trim()
  if (phaseFromQuery === 'audio' || phaseFromQuery === 'script') {
    params.phase = phaseFromQuery
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const contentType = request.headers.get('content-type') || ''

    if (contentType.includes('application/json')) {
      try {
        const body = await request.clone().json() as Partial<WorkflowParams>
        if (body.today) {
          params.today = String(body.today).trim()
        }
        if (typeof body.force === 'boolean') {
          params.force = body.force
        }
        if (body.variant || body.type) {
            params.variant = (body.variant || body.type)?.trim()
        }
        if (body.phase === 'audio' || body.phase === 'script') {
            params.phase = body.phase
        }
      }
      catch (error) {
        console.warn('Failed to parse workflow request JSON body', { error })
      }
    }
  }

  return Object.keys(params).length ? params : undefined
}

export default {
  async runWorkflow(event: ScheduledEvent | Request, env: Env, _ctx: ExecutionContext) {
    console.info('trigger event by:', event)

    let params: WorkflowParams | undefined

    if (event instanceof Request) {
      params = await extractParamsFromRequest(event)
    }

    // Default params
    const effectiveParams = {
        variant: 'hacker-news',
        phase: 'script',
        ...params
    }
    
    // Alias handling
    if (params?.type && !params.variant) {
        effectiveParams.variant = params.type
    }
    if (effectiveParams.variant === 'main') {
        effectiveParams.variant = 'hacker-news'
    }

    // 檢查是否有相同參數的 workflow 正在執行
    const paramsKey = JSON.stringify(effectiveParams)
    const runningCheckKey = `workflow:running:${paramsKey}`

    try {
      // 檢查是否已有相同參數的 workflow 在 5 分鐘內被觸發
      const existingRun = await env.HACKER_NEWS_KV.get(runningCheckKey)
      if (existingRun) {
        const existing = JSON.parse(existingRun)
        console.warn('Duplicate workflow request detected, returning existing instance:', existing)
        return new Response(JSON.stringify({
          message: 'Workflow already running with same parameters',
          existingInstance: existing,
          duplicateDetected: true,
        }), {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
          },
          status: 409, // Conflict
        })
      }

      let instance;
      if (effectiveParams.phase === 'audio') {
          console.info('Triggering Audio Workflow', effectiveParams)
          instance = await env.HACKER_NEWS_AUDIO_WORKFLOW.create({ params: effectiveParams })
      } else {
          console.info('Triggering Script Workflow', effectiveParams)
          instance = await env.HACKER_NEWS_WORKFLOW.create({ params: effectiveParams })
      }

      const instanceDetails = {
        id: instance.id,
        params: effectiveParams,
        details: await instance.status(),
      }

      // 記錄此次執行，5 分鐘後自動過期
      await env.HACKER_NEWS_KV.put(runningCheckKey, JSON.stringify(instanceDetails), {
        expirationTtl: 300, // 5 分鐘
      })

      console.info('instance detail:', instanceDetails)
      return new Response(JSON.stringify(instanceDetails), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
      })
    }
    catch (error: any) {
      console.error('Error in runWorkflow:', error)
      // 清理可能殘留的鎖定狀態
      await env.HACKER_NEWS_KV.delete(runningCheckKey).catch(() => {})
      throw error
    }
  },
  
  async getScript(request: Request, env: Env) {
      const url = new URL(request.url)
      const today = url.searchParams.get('today')
      const variant = url.searchParams.get('variant') || url.searchParams.get('type') || 'hacker-news'
      
      const runEnv = env.WORKER_ENV || 'production'
      
      // Calculate date if not provided
      let displayDate = today
      if (!displayDate) {
         // Default to Taipei time if not provided, consistent with workflow
         const now = new Date()
         const timezoneOffset = 8 // Hardcoded default +8 for simplicity in viewer
         const localTime = new Date(now.getTime() + timezoneOffset * 60 * 60 * 1000)
         displayDate = localTime.toISOString().split('T')[0]
      }
      
      const normalizedVariant = variant === 'main' ? 'hacker-news' : variant
      const scriptKey = `script:${runEnv}:${normalizedVariant}:${displayDate}`
      
      const data = await env.HACKER_NEWS_KV.get(scriptKey)
      
      if (!data) {
          return new Response(JSON.stringify({ error: 'Script not found', key: scriptKey }), {
              status: 404,
              headers: { 'Content-Type': 'application/json' }
          })
      }
      
      return new Response(data, {
          headers: { 'Content-Type': 'application/json' }
      })
  },

  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url)

    // Handle workflow trigger endpoint
    if (url.pathname === '/workflow' || request.method === 'POST') {
      return this.runWorkflow(request, env, ctx)
    }
    
    // Handle script preview endpoint
    if (url.pathname === '/script') {
        return this.getScript(request, env)
    }

    if (url.pathname === '/audio') {
      const assetUrl = new URL('/audio.html', request.url)
      const assetRequest = new Request(assetUrl, request)
      return env.ASSETS.fetch(assetRequest)
    }

    // Redirect to our Web application instead of the original author's site
    return Response.redirect('https://daily-podcast.oobwei.workers.dev/')
  },
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    console.info('scheduled event', event.cron)
    return this.runWorkflow(event, env, ctx)
  },
}
