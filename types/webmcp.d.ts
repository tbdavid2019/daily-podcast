import type { WebMcpTool } from '../lib/webmcp'

interface WebMcpModelContext {
  registerTool: (
    tool: WebMcpTool,
    options?: { signal?: AbortSignal, exposedTo?: string[] },
  ) => Promise<void>
}

declare global {
  interface Document {
    readonly modelContext?: WebMcpModelContext
  }
}

export {}
