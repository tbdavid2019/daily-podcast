import { getCloudflareContext } from '@opennextjs/cloudflare'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Range',
  'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
}

const ALLOWED_EXTENSIONS = new Set(['.mp3', '.wav', '.png', '.jpg', '.jpeg'])
const AUDIO_PATH_PATTERN = /^\d{4}\/\d{2}\/\d{2}\/[\w-]+\/[\w-]+-\d{4}-\d{2}-\d{2}\.(?:mp3|wav)$/

export async function OPTIONS() {
  return new Response(null, {
    headers: corsHeaders,
  })
}

function resolveContentType(filePath: string, r2ContentType?: string | null): string {
  if (r2ContentType && r2ContentType !== 'application/octet-stream') {
    return r2ContentType
  }
  if (filePath.endsWith('.mp3'))
    return 'audio/mpeg'
  if (filePath.endsWith('.wav'))
    return 'audio/wav'
  if (filePath.endsWith('.png'))
    return 'image/png'
  if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg'))
    return 'image/jpeg'
  return 'application/octet-stream'
}

function validatePath(path: string[]): { ok: false, status: number, message: string } | { ok: true, filePath: string } {
  if (!path || path.length === 0 || path.some(seg => seg === '..' || seg === '.' || seg.includes('\\'))) {
    return { ok: false, status: 400, message: 'Invalid path' }
  }
  const filePath = path.join('/')
  if (filePath.startsWith('workflow-state/') || filePath.startsWith('.')) {
    return { ok: false, status: 403, message: 'Forbidden' }
  }
  const extMatch = filePath.match(/\.[a-z0-9]+$/i)
  const ext = extMatch ? extMatch[0].toLowerCase() : ''
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { ok: false, status: 403, message: 'Forbidden file type' }
  }
  if ((ext === '.mp3' || ext === '.wav') && !AUDIO_PATH_PATTERN.test(filePath)) {
    return { ok: false, status: 404, message: 'Invalid audio path' }
  }
  return { ok: true, filePath }
}

export async function HEAD(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params
  const validation = validatePath(path)
  if (!validation.ok) {
    return new Response(validation.message, { status: validation.status, headers: corsHeaders })
  }
  const { filePath } = validation
  const { env } = await getCloudflareContext({ async: true })
  const file = await env.HACKER_NEWS_R2.head(filePath)
  if (!file) {
    return new Response('File not found', { status: 404, headers: corsHeaders })
  }
  return new Response(null, {
    headers: {
      'Content-Type': resolveContentType(filePath, file.httpMetadata?.contentType),
      'Accept-Ranges': 'bytes',
      'Content-Length': file.size.toString(),
      'Cache-Control': 'public, max-age=31536000, immutable',
      ...corsHeaders,
    },
  })
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params
  const validation = validatePath(path)
  if (!validation.ok) {
    return new Response(validation.message, { status: validation.status, headers: corsHeaders })
  }
  const { filePath } = validation
  const { env } = await getCloudflareContext({ async: true })
  const rangeHeader = request.headers.get('range')

  try {
    const file = rangeHeader
      ? await env.HACKER_NEWS_R2.get(filePath, { range: request.headers })
      : await env.HACKER_NEWS_R2.get(filePath)

    if (!file) {
      return new Response('File not found', { status: 404, headers: corsHeaders })
    }

    if (!file.range) {
      return new Response(file.body, {
        headers: {
          'Content-Type': resolveContentType(filePath, file.httpMetadata?.contentType),
          'Accept-Ranges': 'bytes',
          'Content-Length': file.size.toString(),
          'Cache-Control': 'public, max-age=31536000, immutable',
          ...corsHeaders,
        },
      })
    }

    let start = 0
    let contentLength = file.size
    if ('offset' in file.range && file.range.offset !== undefined) {
      start = file.range.offset
      contentLength = file.range.length ?? (file.size - start)
    }
    else if ('suffix' in file.range && file.range.suffix !== undefined) {
      contentLength = Math.min(file.range.suffix, file.size)
      start = Math.max(0, file.size - file.range.suffix)
    }
    const end = Math.max(start, start + contentLength - 1)
    const contentRange = `bytes ${start}-${end}/${file.size}`

    return new Response(file.body, {
      status: 206,
      headers: {
        'Content-Type': resolveContentType(filePath, file.httpMetadata?.contentType),
        'Accept-Ranges': 'bytes',
        'Content-Range': contentRange,
        'Content-Length': contentLength.toString(),
        'Cache-Control': 'public, max-age=31536000, immutable',
        ...corsHeaders,
      },
    })
  }
  catch (error) {
    console.error('Failed to get static asset from R2:', error)
    return new Response('Internal server error', { status: 500, headers: corsHeaders })
  }
}
