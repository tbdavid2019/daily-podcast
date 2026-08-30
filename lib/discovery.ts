import { podcastDescription, podcastOwner, podcastTitle, rssDays } from '@/config'

export const DEFAULT_BASE_URL = 'https://podcast.david888.com'
export const HOMEPAGE_LINK_HEADER = [
  '</llms.txt>; rel="llms-txt"; type="text/markdown"',
  '</.well-known/api-catalog>; rel="api-catalog"',
  '</openapi.json>; rel="service-desc"; type="application/openapi+json"',
  '</docs/api>; rel="service-doc"; type="text/html"',
  '</api/status>; rel="status"; type="application/json"',
].join(', ')

export interface SkillDocument {
  description: string
  name: string
  path: string
  type: 'documentation'
  content: string
}

function trimTrailingSlash(value: string) {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

export function getBaseUrl() {
  return trimTrailingSlash(DEFAULT_BASE_URL)
}

export function withMarkdownHeaders(markdown: string, init: ResponseInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'text/markdown; charset=utf-8')
  headers.set('Vary', 'Accept')
  headers.set('X-Markdown-Tokens', estimateMarkdownTokens(markdown).toString())
  return new Response(markdown, {
    ...init,
    headers,
  })
}

export function buildRobotsTxt(baseUrl: string) {
  return [
    '# Crawl policy for DAVID888 Daily',
    '',
    'User-agent: GPTBot',
    'Allow: /',
    'Allow: /llms.txt',
    'Allow: /llms-full.txt',
    'Allow: /.well-known/',
    'Allow: /docs/api',
    'Allow: /api/status',
    'Disallow: /_next/',
    'Disallow: /api/',
    'Disallow: /static/',
    '',
    'User-agent: OAI-SearchBot',
    'Allow: /',
    'Allow: /llms.txt',
    'Allow: /llms-full.txt',
    'Allow: /.well-known/',
    'Allow: /docs/api',
    'Allow: /api/status',
    'Disallow: /_next/',
    'Disallow: /api/',
    'Disallow: /static/',
    '',
    'User-agent: CCBot',
    'Allow: /',
    'Allow: /llms.txt',
    'Allow: /llms-full.txt',
    'Allow: /.well-known/',
    'Allow: /docs/api',
    'Allow: /api/status',
    'Disallow: /_next/',
    'Disallow: /api/',
    'Disallow: /static/',
    '',
    'User-agent: ClaudeBot',
    'Allow: /',
    'Allow: /llms.txt',
    'Allow: /llms-full.txt',
    'Allow: /.well-known/',
    'Allow: /docs/api',
    'Allow: /api/status',
    'Disallow: /_next/',
    'Disallow: /api/',
    'Disallow: /static/',
    '',
    'User-agent: Claude-Web',
    'Allow: /',
    'Allow: /llms.txt',
    'Allow: /llms-full.txt',
    'Allow: /.well-known/',
    'Allow: /docs/api',
    'Allow: /api/status',
    'Disallow: /_next/',
    'Disallow: /api/',
    'Disallow: /static/',
    '',
    'User-agent: Google-Extended',
    'Allow: /',
    'Allow: /llms.txt',
    'Allow: /llms-full.txt',
    'Allow: /.well-known/',
    'Allow: /docs/api',
    'Allow: /api/status',
    'Disallow: /_next/',
    'Disallow: /api/',
    'Disallow: /static/',
    '',
    'User-agent: *',
    'Allow: /',
    'Allow: /llms.txt',
    'Allow: /llms-full.txt',
    'Allow: /.well-known/',
    'Allow: /docs/api',
    'Allow: /api/status',
    'Disallow: /_next/',
    'Disallow: /api/',
    'Disallow: /static/',
    '',
    'Content-Signal: ai-train=no, search=yes, ai-input=yes',
    `Sitemap: ${baseUrl}/sitemap.xml`,
  ].join('\n')
}

export function buildLlmsTxt(baseUrl: string) {
  return [
    `# ${podcastTitle}`,
    '',
    `> ${podcastDescription}`,
    '',
    '## 核心服務與頁面 (Core Pages & Services)',
    '',
    `- [${podcastTitle}首頁](${baseUrl}/): 展示歷史每日科技新聞摘要與 Podcast 音訊播放器（支援分頁瀏覽全量歷史集數）。`,
    `- [節目文章頁面](${baseUrl}/post/{date}): 包含指定日期（如 ${baseUrl}/post/2026-08-10）的完整報導內文、故事導讀與延伸參考連結。`,
    `- [Podcast RSS Feed](${baseUrl}/rss.xml): 提供適用於各大 Podcast 播放器的標準 RSS 訂閱源（保留最新 ${rssDays} 天）。`,
    `- [Sitemap](${baseUrl}/sitemap.xml): 完整網站頁面索引與搜尋檢索地圖（永久典藏收錄全量集數）。`,
    '',
    '## AI Agent & API Discovery',
    '',
    `- [llms.txt](${baseUrl}/llms.txt): LLM 與 AI Agent 的精簡網站結構與資源索引。`,
    `- [llms-full.txt](${baseUrl}/llms-full.txt): 完整網站架構、路由說明與 API 詳細規範檔案。`,
    `- [Agent Skills 索引目錄](${baseUrl}/.well-known/agent-skills/index.json): 機器可讀的 Agent Skills 清單與 SHA-256 驗證雜湊。`,
    `- [API Catalog](${baseUrl}/.well-known/api-catalog): 符合 RFC 9727 規範的 API 服務鏈結目錄。`,
    `- [OpenAPI Specification](${baseUrl}/openapi.json): 標準 OpenAPI 3.1.0 介面規範。`,
    `- [API 服務說明文件](${baseUrl}/docs/api): 提供 AI Agent 呼叫之公開 API 節點與 HTTP 標頭說明。`,
    '',
    '## 內容協商與語法 (Content Negotiation)',
    '',
    '- 支持在首頁與文章頁面（`/` 與 `/post/{date}`）發送 `Accept: text/markdown` 請求標頭，直接取得乾淨的 Markdown 格式內文。',
    '',
    '## 研發團隊與維護資訊 (Development & Maintenance)',
    '',
    `> 本站點與 AI Agent 服務由 ${podcastOwner.name} 團隊設計、開發與維護。`,
    '',
    '- [DAVID888 官方專案庫](https://github.com/tbdavid2019/daily-podcast): 專案開源程式碼與開發說明。',
    `- [${podcastOwner.name} (${podcastOwner.email})](mailto:${podcastOwner.email}): 主要維護者與 Podcast 擁有者。`,
    '',
    '## 延伸說明',
    '',
    `- [LLMs Full Documentation](${baseUrl}/llms-full.txt): 完整網站結構、詳細 API 參數與延伸說明檔案。`,
    '',
  ].join('\n')
}

export function buildLlmsFullTxt(baseUrl: string) {
  return [
    `# ${podcastTitle} - LLM 完整網站與 API 說明`,
    '',
    `> ${podcastDescription}`,
    '',
    '## 系統架構簡介 (System Architecture)',
    '',
    '本系統部署於 Cloudflare Workers，前端基於 Next.js App Router 與 OpenNext 建構，後端採用 Cloudflare Workflows 自動處理每日科技新聞抓取、摘要彙整與 TTS 語音合成。',
    '',
    '## 完整路由與頁面說明 (Route Directory)',
    '',
    `### 1. 首頁 (\`${baseUrl}/\`)`,
    '- **功能**: 展示歷年 Podcast 集數列表（支援分頁瀏覽全量歷史）與線上音訊播放器。',
    '- **內容協商**: 發送 `Accept: text/markdown` 可直接取得 Markdown 格式之當日重點與摘要。',
    '',
    `### 2. 單集文章頁面 (\`${baseUrl}/post/{date}\` 或 \`${baseUrl}/post/{date}/{variant}\`)`,
    '- **功能**: 單一日期（例如 `2026-08-10`）的完整新聞報導與對話逐字稿。',
    '- **內容協商**: 發送 `Accept: text/markdown` 標頭取得對應 Markdown 內文。',
    '- **變體預設**: 預設變體為 `hacker-news`（可別名 `main`）。',
    '',
    `### 3. Podcast RSS 訂閱源 (\`${baseUrl}/rss.xml\`)`,
    `- **功能**: 提供符合 PodcastIndex 規範的 RSS XML（保留最新 ${rssDays} 天），包含音訊檔 enclosure 與文章連結。`,
    '- **快取策略**: 邊緣快取 10 分鐘，支援跨網域 CORS GET 請求。',
    '',
    `### 4. 網站地圖 (\`${baseUrl}/sitemap.xml\`)`,
    '- **功能**: 動態輸出所有歷史真實存在的文章 XML 地圖（無天數上限、0 死連結）供 AI 爬蟲與檢索機器人索引。',
    '',
    `### 5. API 狀態節點 (\`${baseUrl}/api/status\`)`,
    '- **功能**: 提供輕量級 JSON 狀態，包含服務名稱、當前狀態與 RSS URL。',
    '',
    '## AI Agent 探索與協定規範 (Agent & Protocol Discovery)',
    '',
    `- **llms.txt**: \`${baseUrl}/llms.txt\` (標準 Markdown 清單)`,
    `- **llms-full.txt**: \`${baseUrl}/llms-full.txt\` (完整規格檔案)`,
    `- **Agent Skills 索引**: \`${baseUrl}/.well-known/agent-skills/index.json\``,
    `- **RFC 9727 API Catalog**: \`${baseUrl}/.well-known/api-catalog\``,
    `- **OpenAPI 3.1.0 Specification**: \`${baseUrl}/openapi.json\``,
    `- **API 說明網頁**: \`${baseUrl}/docs/api\``,
    '',
    '## HTTP Content Negotiation 說明',
    '',
    'AI Agent 可在存取頁面時帶入 `Accept: text/markdown` 標頭：',
    '```http',
    `GET /post/2026-08-10 HTTP/1.1`,
    `Host: podcast.david888.com`,
    'Accept: text/markdown',
    '```',
    '伺服器將提供：',
    '- `Content-Type: text/markdown; charset=utf-8`',
    '- `Vary: Accept`',
    '- `X-Markdown-Tokens`: 預估 Markdown Token 數量',
    '',
    '## 爬蟲政策與 Content Signals (Robots Policy)',
    '',
    '本站點於 `robots.txt` 宣告下列 Content Signals 標頭與爬蟲規則：',
    '- `ai-train=no`: 不允許做為 AI 模型訓練集數據。',
    '- `search=yes`: 允許檢索機器人檢索。',
    '- `ai-input=yes`: 允許做為 RAG / AI Agent 即時輸入來源。',
    '',
    '## 維護團隊與聯絡資訊 (Maintenance & Contact)',
    '',
    `- **專案團隊**: ${podcastOwner.name}`,
    `- **聯絡 Email**: ${podcastOwner.email}`,
    '- **專案 GitHub 倉庫**: https://github.com/tbdavid2019/daily-podcast',
    '',
  ].join('\n')
}

export function buildApiCatalog(baseUrl: string) {
  return {
    linkset: [
      {
        'anchor': `${baseUrl}/api`,
        'service-desc': [
          {
            href: `${baseUrl}/openapi.json`,
            type: 'application/openapi+json',
          },
        ],
        'service-doc': [
          {
            href: `${baseUrl}/docs/api`,
            type: 'text/html',
          },
        ],
        'status': [
          {
            href: `${baseUrl}/api/status`,
            type: 'application/json',
          },
        ],
      },
    ],
  }
}

export function buildOpenApiSpec(baseUrl: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: `${podcastTitle} Public Discovery API`,
      version: '1.0.0',
      description: 'Minimal public endpoints for agent and service discovery.',
    },
    servers: [
      {
        url: baseUrl,
      },
    ],
    paths: {
      '/llms.txt': {
        get: {
          operationId: 'getLlmsTxt',
          summary: 'Return standard llms.txt Markdown index for LLMs and AI Agents',
          responses: {
            200: {
              description: 'llms.txt Markdown document',
              content: {
                'text/markdown': {
                  schema: {
                    type: 'string',
                  },
                },
              },
            },
          },
        },
      },
      '/llms-full.txt': {
        get: {
          operationId: 'getLlmsFullTxt',
          summary: 'Return comprehensive llms-full.txt Markdown documentation for LLMs and AI Agents',
          responses: {
            200: {
              description: 'llms-full.txt Markdown document',
              content: {
                'text/markdown': {
                  schema: {
                    type: 'string',
                  },
                },
              },
            },
          },
        },
      },
      '/api/status': {
        get: {
          operationId: 'getStatus',
          summary: 'Return a lightweight service status payload',
          responses: {
            200: {
              description: 'Service status',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      service: { type: 'string' },
                      status: { type: 'string' },
                      version: { type: 'string' },
                      rss: { type: 'string', format: 'uri' },
                    },
                    required: ['service', 'status', 'version', 'rss'],
                  },
                },
              },
            },
          },
        },
      },
    },
  }
}

export function buildApiDocMarkdown(baseUrl: string) {
  return [
    `# ${podcastTitle} API`,
    '',
    podcastDescription,
    '',
    '## Endpoints',
    '',
    `- \`GET ${baseUrl}/llms.txt\`: LLM and AI Agent discovery index`,
    `- \`GET ${baseUrl}/llms-full.txt\`: Full LLM documentation and route reference`,
    `- \`GET ${baseUrl}/api/status\`: service health and discovery summary`,
    `- \`GET ${baseUrl}/openapi.json\`: OpenAPI description for the public endpoint set`,
    `- \`GET ${baseUrl}/.well-known/api-catalog\`: RFC 9727 API catalog`,
    `- \`GET ${baseUrl}/.well-known/agent-skills/index.json\`: agent skills discovery index`,
    '',
    '## Notes',
    '',
    '- Homepage pagination exposes all generated episodes across full history.',
    '- Main content remains HTML by default. Agents can request Markdown with `Accept: text/markdown` on the homepage and episode pages.',
    '',
  ].join('\n')
}

export function estimateMarkdownTokens(markdown: string) {
  return Math.max(1, Math.ceil(markdown.length / 4))
}

export async function sha256Hex(content: string) {
  const bytes = new TextEncoder().encode(content)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

export const skillDocuments: Record<string, SkillDocument> = {
  'agent-skills': {
    name: 'agent-skills',
    type: 'documentation',
    description: 'Describes how to discover DAVID888 Daily agent-facing resources.',
    path: '/.well-known/agent-skills/agent-skills',
    content: [
      '# Agent Skills Discovery',
      '',
      'Use `/.well-known/agent-skills/index.json` to discover the site skill inventory.',
      'Each skill entry includes a SHA-256 digest so agents can verify the fetched document.',
      '',
      '## Primary resources',
      '',
      '- `/.well-known/agent-skills/index.json`',
      '- `/.well-known/api-catalog`',
      '- `/openapi.json`',
      '- `/docs/api`',
      '- `/llms.txt`',
      '- `/llms-full.txt`',
      '',
    ].join('\n'),
  },
  'api-catalog': {
    name: 'api-catalog',
    type: 'documentation',
    description: 'Explains the API catalog and linked discovery endpoints.',
    path: '/.well-known/agent-skills/api-catalog',
    content: [
      '# API Catalog',
      '',
      'The API catalog is published at `/.well-known/api-catalog` with media type `application/linkset+json`.',
      'It advertises the public API anchor, OpenAPI description, HTML documentation, and status endpoint.',
      '',
      '## Link relations',
      '',
      '- `service-desc`: `/openapi.json`',
      '- `service-doc`: `/docs/api`',
      '- `status`: `/api/status`',
      '',
    ].join('\n'),
  },
  'llms-txt': {
    name: 'llms-txt',
    type: 'documentation',
    description: 'Documents llms.txt and llms-full.txt discovery standards.',
    path: '/.well-known/agent-skills/llms-txt',
    content: [
      '# llms.txt Discovery Standard',
      '',
      'The site provides standard Markdown discovery files at `/llms.txt` and `/llms-full.txt`.',
      'These files index the primary routes, RSS feeds, API endpoints, agent skills, and maintenance contacts.',
      '',
      '## Endpoints',
      '',
      '- `/llms.txt`: Machine-friendly index of core site pages and discovery links.',
      '- `/llms-full.txt`: Detailed site architecture, route reference, and protocol specs.',
      '',
    ].join('\n'),
  },
  'markdown-negotiation': {
    name: 'markdown-negotiation',
    type: 'documentation',
    description: 'Documents Markdown content negotiation for homepage and episode pages.',
    path: '/.well-known/agent-skills/markdown-negotiation',
    content: [
      '# Markdown Negotiation',
      '',
      'Send `Accept: text/markdown` to the homepage or an episode page under `/post/...` to receive Markdown instead of HTML.',
      'Markdown responses return `Content-Type: text/markdown; charset=utf-8`, `Vary: Accept`, and `X-Markdown-Tokens`.',
      '',
      '## Covered routes',
      '',
      '- `/`',
      '- `/post/{date}`',
      '- `/post/{date}/{variant}`',
      '',
    ].join('\n'),
  },
  'robots-txt': {
    name: 'robots-txt',
    type: 'documentation',
    description: 'Documents crawl policy, AI bot rules, and Content Signals.',
    path: '/.well-known/agent-skills/robots-txt',
    content: [
      '# Robots Policy',
      '',
      'The site publishes `robots.txt` at the origin root with explicit groups for GPTBot, OAI-SearchBot, Claude-Web, Google-Extended, and `*`.',
      'The policy allows site content and discovery resources while blocking framework internals and most API/static paths.',
      '',
      '## Content Signals',
      '',
      '- `ai-train=no`',
      '- `search=yes`',
      '- `ai-input=yes`',
      '',
    ].join('\n'),
  },
}
