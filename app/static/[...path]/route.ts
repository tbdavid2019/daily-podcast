import { getCloudflareContext } from '@opennextjs/cloudflare'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Content-Type, Accept',
  'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
}

function resolveContentType(filePath: string, storedType?: string) {
  if (storedType && storedType !== 'application/octet-stream') {
    return storedType
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

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders,
      'Access-Control-Max-Age': '86400',
    },
  })
}

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const { env } = await getCloudflareContext({ async: true })

  const filePath = path.join('/')

  // 取得 Range header (用於串流支援)
  const range = request.headers.get('range')

  if (range) {
    // 支援 byte-range 請求
    const file = await env.HACKER_NEWS_R2.get(filePath, {
      range: request.headers,
    })

    if (!file) {
      return new Response('File not found', { status: 404, headers: corsHeaders })
    }

    // 計算 Content-Range 與 Content-Length
    let contentRange = ''
    let contentLength = file.size
    if (file.range) {
      if ('offset' in file.range && file.range.offset !== undefined) {
        const start = file.range.offset
        const length = file.range.length || 0
        const end = start + length - 1
        contentRange = `bytes ${start}-${end}/${file.size}`
        contentLength = length
      }
      else if ('suffix' in file.range && file.range.suffix !== undefined) {
        const suffix = file.range.suffix
        const start = file.size - suffix
        const end = file.size - 1
        contentRange = `bytes ${start}-${end}/${file.size}`
        contentLength = suffix
      }
    }

    return new Response(file.body, {
      status: 206, // Partial Content
      headers: {
        'Content-Type': resolveContentType(filePath, file.httpMetadata?.contentType),
        'Content-Range': contentRange,
        'Accept-Ranges': 'bytes',
        'Content-Length': contentLength.toString(),
        'Cache-Control': 'public, max-age=31536000, immutable',
        ...corsHeaders,
      },
    })
  }

  // 正常請求（無 Range header）
  const file = await env.HACKER_NEWS_R2.get(filePath)

  if (!file) {
    return new Response('File not found', { status: 404, headers: corsHeaders })
  }

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
