import MarkdownIt from 'markdown-it'
import { sanitizeMarkdownLinkUrl } from '@/lib/playback-share'

const markdownRenderer = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})

const defaultLinkRenderer = markdownRenderer.renderer.rules.link_open
  ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))

markdownRenderer.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const rawHref = token.attrGet('href')
  const safe = sanitizeMarkdownLinkUrl(typeof rawHref === 'string' ? rawHref : null)
  token.attrSet('href', safe?.href ?? '#')
  if (safe?.isExternal) {
    token.attrSet('target', '_blank')
    token.attrSet('rel', 'nofollow noopener noreferrer')
  }
  return defaultLinkRenderer(tokens, idx, options, env, self)
}

export function renderArticleMarkdownHtml(markdown?: string): string {
  if (!markdown || !markdown.trim()) {
    return ''
  }

  return markdownRenderer.render(markdown)
}

export function withRenderedBlogHtml(article: Article): Article {
  if (!article.blogContent || article.blogHtml !== undefined) {
    return article
  }

  return {
    ...article,
    blogHtml: renderArticleMarkdownHtml(article.blogContent),
  }
}
