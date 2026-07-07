import { skillDocuments, withMarkdownHeaders } from '@/lib/discovery'

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const skill = skillDocuments[slug]

  if (!skill) {
    return new Response('Not found', { status: 404 })
  }

  return withMarkdownHeaders(skill.content, {
    headers: {
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
