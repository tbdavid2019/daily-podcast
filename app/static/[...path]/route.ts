import { getCloudflareContext } from '@opennextjs/cloudflare'

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
      return new Response('File not found', { status: 404 })
    }

    // 計算 Content-Range header
    let contentRange = ''
    if (file.range) {
      if ('offset' in file.range && file.range.offset !== undefined) {
        const start = file.range.offset
        const end = start + (file.range.length || 0) - 1
        contentRange = `bytes ${start}-${end}/${file.size}`
      }
      else if ('suffix' in file.range && file.range.suffix !== undefined) {
        const start = file.size - file.range.suffix
        const end = file.size - 1
        contentRange = `bytes ${start}-${end}/${file.size}`
      }
    }

    return new Response(file.body, {
      status: 206, // Partial Content
      headers: {
        'Content-Type': file.httpMetadata?.contentType || 'application/octet-stream',
        'Content-Range': contentRange,
        'Accept-Ranges': 'bytes',
        'Content-Length': file.size.toString(),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  }

  // 正常請求（無 Range header）
  const file = await env.HACKER_NEWS_R2.get(filePath)

  if (!file) {
    return new Response('File not found', { status: 404 })
  }

  return new Response(file.body, {
    headers: {
      'Content-Type': file.httpMetadata?.contentType || 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Content-Length': file.size.toString(),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
