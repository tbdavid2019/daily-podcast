import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { handleMcpRequest } from '../lib/mcp-server'

function createContentEnv(article: Article): Pick<CloudflareEnv, 'HACKER_NEWS_KV'> {
  const kv = {
    get: async (key: string) => key.startsWith('content:') ? article : null,
    list: async () => ({ keys: [], list_complete: true }),
    put: async () => undefined,
  }

  return { HACKER_NEWS_KV: kv as unknown as KVNamespace }
}

function createRequest(message: unknown, init: RequestInit = {}) {
  return new Request('https://podcast.david888.com/mcp', {
    ...init,
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      Host: 'podcast.david888.com',
      ...init.headers,
    },
    body: JSON.stringify(message),
  })
}

async function readMcpResponse(response: Response) {
  const body = await response.text()
  const payload = response.headers.get('content-type')?.includes('text/event-stream')
    ? body.split(/\r?\n/).find(line => line.startsWith('data: '))?.slice(6)
    : body

  assert.ok(payload, 'MCP response must include a JSON-RPC payload')
  return JSON.parse(payload)
}

describe('MCP Streamable HTTP endpoint', () => {
  it('answers initialize, tools/list, and read-only episode calls', async () => {
    const article: Article = {
      date: '2026-09-30',
      title: 'MCP endpoint test episode',
      stories: [],
      podcastContent: 'Test podcast script',
      blogContent: 'Test article body',
      introContent: 'Test summary',
      audio: '2026/09/30/production/hacker-news-2026-09-30.mp3',
      updatedAt: 0,
    }
    const env = createContentEnv(article)
    const initialize = await handleMcpRequest(createRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'endpoint-test', version: '1.0.0' },
      },
    }), env)

    assert.equal(initialize.status, 200)
    assert.match(initialize.headers.get('content-type') ?? '', /application\/json|text\/event-stream/)
    const initializeBody = await readMcpResponse(initialize)
    assert.equal(initializeBody.result.protocolVersion, '2025-11-25')

    const list = await handleMcpRequest(createRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    }), env)
    const listBody = await readMcpResponse(list) as { result: { tools: Array<{ name: string }> } }

    assert.equal(list.status, 200)
    assert.deepEqual(listBody.result.tools.map(tool => tool.name), [
      'list_recent_episodes',
      'get_episode',
    ])

    const modernList = await handleMcpRequest(createRequest({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/list',
      params: {
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientInfo': { name: 'endpoint-test', version: '1.0.0' },
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    }, {
      headers: {
        'MCP-Protocol-Version': '2026-07-28',
        'Mcp-Method': 'tools/list',
      },
    }), env)
    const modernBody = await modernList.json() as { result: { tools: Array<{ name: string }> } }

    assert.equal(modernList.status, 200)
    assert.deepEqual(modernBody.result.tools.map(tool => tool.name), [
      'list_recent_episodes',
      'get_episode',
    ])

    const call = await handleMcpRequest(createRequest({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'get_episode', arguments: { date: article.date } },
    }), env)
    const callBody = await readMcpResponse(call) as { result: { content: Array<{ text: string }> } }

    assert.equal(call.status, 200)
    assert.match(callBody.result.content[0].text, /MCP endpoint test episode/)
    assert.match(callBody.result.content[0].text, /Test podcast script/)
  })

  it('rejects requests with an untrusted Host or Origin', async () => {
    const env = createContentEnv({
      date: '2026-09-30',
      title: 'Unused',
      stories: [],
      podcastContent: '',
      blogContent: '',
      introContent: '',
      audio: '',
      updatedAt: 0,
    })
    const message = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }
    const untrustedHost = await handleMcpRequest(new Request('https://attacker.example/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Host: 'attacker.example' },
      body: JSON.stringify(message),
    }), env)
    const untrustedOrigin = await handleMcpRequest(createRequest(message, {
      headers: { Origin: 'https://attacker.example' },
    }), env)

    assert.equal(untrustedHost.status, 403)
    assert.equal(untrustedOrigin.status, 403)
  })
})
