import { keepDays, podcastDescription, podcastTitle } from '@/config'

export const DEFAULT_BASE_URL = 'https://podcast.david888.com'
export const HOMEPAGE_LINK_HEADER = [
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
    'Allow: /.well-known/',
    'Allow: /docs/api',
    'Allow: /api/status',
    'Disallow: /_next/',
    'Disallow: /api/',
    'Disallow: /static/',
    '',
    'User-agent: OAI-SearchBot',
    'Allow: /',
    'Allow: /.well-known/',
    'Allow: /docs/api',
    'Allow: /api/status',
    'Disallow: /_next/',
    'Disallow: /api/',
    'Disallow: /static/',
    '',
    'User-agent: Claude-Web',
    'Allow: /',
    'Allow: /.well-known/',
    'Allow: /docs/api',
    'Allow: /api/status',
    'Disallow: /_next/',
    'Disallow: /api/',
    'Disallow: /static/',
    '',
    'User-agent: Google-Extended',
    'Allow: /',
    'Allow: /.well-known/',
    'Allow: /docs/api',
    'Allow: /api/status',
    'Disallow: /_next/',
    'Disallow: /api/',
    'Disallow: /static/',
    '',
    'User-agent: *',
    'Allow: /',
    'Allow: /.well-known/',
    'Allow: /docs/api',
    'Allow: /api/status',
    'Disallow: /_next/',
    'Disallow: /api/',
    'Disallow: /static/',
    '',
    'Content-Signal: ai-train=no, search=yes, ai-input=yes',
    `Sitemap: ${baseUrl}/sitemap.xml`,
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
    `- \`GET ${baseUrl}/api/status\`: service health and discovery summary`,
    `- \`GET ${baseUrl}/openapi.json\`: OpenAPI description for the public endpoint set`,
    `- \`GET ${baseUrl}/.well-known/api-catalog\`: RFC 9727 API catalog`,
    `- \`GET ${baseUrl}/.well-known/agent-skills/index.json\`: agent skills discovery index`,
    '',
    '## Notes',
    '',
    `- Homepage pagination exposes up to ${keepDays} days of generated episodes.`,
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
