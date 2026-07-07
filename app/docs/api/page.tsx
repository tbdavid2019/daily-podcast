import { buildApiDocMarkdown, getBaseUrl } from '@/lib/discovery'

export const metadata = {
  title: 'API Documentation',
  description: 'Public discovery endpoints for DAVID888 Daily.',
}

export default function ApiDocsPage() {
  const content = buildApiDocMarkdown(getBaseUrl())

  return (
    <article className="prose prose-zinc max-w-3xl mx-auto py-10 whitespace-pre-wrap">
      {content}
    </article>
  )
}
