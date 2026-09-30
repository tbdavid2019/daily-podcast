import { handleMcpRequest } from '@/lib/mcp-server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  return handleMcpRequest(request)
}
