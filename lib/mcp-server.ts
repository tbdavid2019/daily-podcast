import {
  createMcpHandler,
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  McpServer,
  originValidationResponse,
} from '@modelcontextprotocol/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { z } from 'zod4'
import { buildArticleMarkdown, buildHomepageMarkdown, getArticleByDate, getHomepageArticles } from '@/lib/content'
import { DEFAULT_BASE_URL, getBaseUrl } from '@/lib/discovery'
import {
  normalizeWebMcpPage,
  parseWebMcpEpisodeInput,
  truncateWebMcpOutput,
} from '@/lib/webmcp'

type PodcastMcpEnv = Pick<CloudflareEnv, 'HACKER_NEWS_KV'> & { NEXTJS_ENV?: string }

const siteHostname = new URL(DEFAULT_BASE_URL).hostname
const allowedHostnames = [...new Set([...localhostAllowedHostnames(), siteHostname])]
const allowedOriginHostnames = [...new Set([...localhostAllowedOrigins(), siteHostname])]

async function getMcpEnv(env?: PodcastMcpEnv) {
  if (env) {
    return env
  }

  return (await getCloudflareContext({ async: true })).env
}

function createPodcastMcpServer(env?: PodcastMcpEnv) {
  const server = new McpServer({
    name: 'DAVID888 Daily',
    version: '1.0.0',
  }, {
    capabilities: { tools: {} },
  })

  server.registerTool('list_recent_episodes', {
    title: '列出近期集數',
    description: '列出 DAVID888 Daily 某一頁的近期 Podcast 集數、日期、摘要與音訊連結。',
    inputSchema: z.object({
      page: z.number().int().min(1).max(10).optional(),
    }),
    annotations: { readOnlyHint: true },
  }, async ({ page }) => {
    const currentEnv = await getMcpEnv(env)
    const currentPage = normalizeWebMcpPage({ page })
    const { posts, totalPages } = await getHomepageArticles(currentEnv, currentPage)
    const markdown = buildHomepageMarkdown(getBaseUrl(), posts, currentPage, totalPages)

    return { content: [{ type: 'text', text: truncateWebMcpOutput(markdown) }] }
  })

  server.registerTool('get_episode', {
    title: '讀取 Podcast 集數',
    description: '取得指定日期 Podcast 的繁體中文摘要、完整文章、節目稿與參考連結。',
    inputSchema: z.object({
      date: z.string(),
      variant: z.string().optional(),
    }),
    annotations: { readOnlyHint: true },
  }, async ({ date, variant }) => {
    const episode = parseWebMcpEpisodeInput({ date, variant })
    const currentEnv = await getMcpEnv(env)
    const article = await getArticleByDate(currentEnv, episode.date, episode.variant)

    if (!article) {
      return {
        content: [{ type: 'text', text: `找不到 ${episode.date} 的 Podcast 集數。` }],
        isError: true,
      }
    }

    return {
      content: [{
        type: 'text',
        text: truncateWebMcpOutput(buildArticleMarkdown(getBaseUrl(), article)),
      }],
    }
  })

  return server
}

export async function handleMcpRequest(request: Request, env?: PodcastMcpEnv) {
  const rejected = hostHeaderValidationResponse(request, allowedHostnames)
    ?? originValidationResponse(request, allowedOriginHostnames)

  if (rejected) {
    return rejected
  }

  const handler = createMcpHandler(() => createPodcastMcpServer(env))

  return handler.fetch(request)
}
