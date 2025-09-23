interface Story {
  id?: string
  title?: string
  url?: string
  hackerNewsUrl?: string
  source?: 'hacker-news' | 'github-trending' | 'product-hunt' | 'dev-to'
  sourceUrl?: string
  description?: string
  stars?: number // for GitHub repos
  votes?: number // for Product Hunt
}
