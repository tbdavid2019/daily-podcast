export interface WorkflowParams {
  today?: string
  force?: boolean
  variant?: string // Default: 'hacker-news'
  phase?: 'script' | 'audio' // Default: 'script'
  type?: string // Alias for variant, for user convenience (e.g. 'main')
}

export interface PodcastDialogueLine {
  speaker: '男' | '女'
  text: string
}

export interface PodcastScriptResponse {
  dialogue: PodcastDialogueLine[]
}

export interface Story {
  id?: string
  title?: string
  url?: string
  content?: string
  summary?: string
  source?: 'hacker-news' | 'github-trending' | 'product-hunt' | 'dev-to' | 'reddit'
  sourceUrl?: string
  score?: number
  comments?: number
  time?: number
  description?: string
  votes?: number
  stars?: number
  upvotes?: number
  subreddit?: string
  hackerNewsUrl?: string
}

export interface GeneratedScriptData {
  dialogue: PodcastDialogueLine[]
  blogContent: string
  introContent: string
  stories: Story[]
  storySummaries: string[]
  displayDate: string
}
