import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildWebMcpEpisodePath,
  normalizeWebMcpPage,
  parseWebMcpEpisodeInput,
  truncateWebMcpOutput,
  WEBMCP_MAX_OUTPUT_LENGTH,
} from '../lib/webmcp'

describe('WebMCP input and output helpers', () => {
  it('builds same-origin Markdown paths for default and named variants', () => {
    assert.equal(
      buildWebMcpEpisodePath({ date: '2026-08-23', variant: 'hacker-news' }),
      '/agent-markdown/post/2026-08-23',
    )
    assert.equal(
      buildWebMcpEpisodePath({ date: '2026-08-23', variant: 'product-hunt' }),
      '/agent-markdown/post/2026-08-23/product-hunt',
    )
  })

  it('validates episode input and canonicalizes the main alias', () => {
    assert.deepEqual(
      parseWebMcpEpisodeInput({ date: '2026-08-23', variant: 'main' }),
      { date: '2026-08-23', variant: 'hacker-news' },
    )
    assert.throws(() => parseWebMcpEpisodeInput({ date: '2026-02-30' }), /有效的 YYYY-MM-DD/)
    assert.throws(() => parseWebMcpEpisodeInput({ date: '2026-08-23', variant: '../private' }), /小寫英文字母/)
  })

  it('keeps page requests bounded', () => {
    assert.equal(normalizeWebMcpPage({}), 1)
    assert.equal(normalizeWebMcpPage({ page: 10 }), 10)
    assert.throws(() => normalizeWebMcpPage({ page: 11 }), /1 到 10/)
    assert.throws(() => normalizeWebMcpPage({ page: 1.5 }), /整數/)
  })

  it('limits tool output to the WebMCP safety budget', () => {
    const output = truncateWebMcpOutput('x'.repeat(WEBMCP_MAX_OUTPUT_LENGTH + 100))

    assert.equal(output.length, WEBMCP_MAX_OUTPUT_LENGTH)
    assert.equal(output.at(-1), '…')
  })
})
