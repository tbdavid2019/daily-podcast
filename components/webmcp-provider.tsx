'use client'

import type { WebMcpTool } from '@/lib/webmcp'
import { useEffect } from 'react'
import {
  buildWebMcpEpisodePath,
  normalizeWebMcpPage,
  parseWebMcpEpisodeInput,
  truncateWebMcpOutput,
} from '@/lib/webmcp'

async function readMarkdown(path: string) {
  const response = await fetch(path, {
    headers: {
      Accept: 'text/markdown',
    },
  })

  if (!response.ok) {
    throw new Error(`找不到指定內容（HTTP ${response.status}）。`)
  }

  return truncateWebMcpOutput(await response.text())
}

function createWebMcpTools(): WebMcpTool[] {
  return [
    {
      name: 'list_recent_episodes',
      description: '列出 DAVID888 Daily 某一頁的近期 Podcast 集數、日期、摘要與音訊連結。',
      inputSchema: {
        type: 'object',
        properties: {
          page: {
            type: 'integer',
            minimum: 1,
            maximum: 10,
            description: '頁碼，從 1 開始；省略時讀取第 1 頁。',
          },
        },
      },
      annotations: {
        readOnlyHint: true,
        untrustedContentHint: true,
      },
      execute: async (input) => {
        const page = normalizeWebMcpPage(input)
        return readMarkdown(`/agent-markdown?page=${page}`)
      },
    },
    {
      name: 'get_episode',
      description: '取得指定日期 Podcast 的繁體中文摘要、完整文章、節目稿與參考連結。',
      inputSchema: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: '集數日期，格式為 YYYY-MM-DD。',
          },
          variant: {
            type: 'string',
            description: '內容變體；預設為 hacker-news，也接受 main。',
          },
        },
        required: ['date'],
      },
      annotations: {
        readOnlyHint: true,
        untrustedContentHint: true,
      },
      execute: async (input) => {
        const episode = parseWebMcpEpisodeInput(input)
        return readMarkdown(buildWebMcpEpisodePath(episode))
      },
    },
    {
      name: 'open_episode',
      description: '開啟指定日期的 Podcast 集數頁面，讓使用者查看內容並播放音訊。',
      inputSchema: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: '集數日期，格式為 YYYY-MM-DD。',
          },
          variant: {
            type: 'string',
            description: '內容變體；預設為 hacker-news，也接受 main。',
          },
        },
        required: ['date'],
      },
      annotations: {
        readOnlyHint: false,
      },
      execute: async (input) => {
        const episode = parseWebMcpEpisodeInput(input)
        const path = buildWebMcpEpisodePath(episode).replace('/agent-markdown', '')
        window.location.assign(path)
        return `已開啟 ${episode.date} 的 Podcast 集數頁面。`
      },
    },
  ]
}

export function WebMcpProvider() {
  useEffect(() => {
    const modelContext = document.modelContext
    if (!modelContext) {
      return
    }

    const controller = new AbortController()
    void Promise.all(
      createWebMcpTools().map(tool => modelContext.registerTool(tool, { signal: controller.signal })),
    ).catch((error: unknown) => {
      if (!controller.signal.aborted) {
        console.warn('WebMCP 工具註冊失敗', error)
      }
    })

    return () => controller.abort()
  }, [])

  return null
}
