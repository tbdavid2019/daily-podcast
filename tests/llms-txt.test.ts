import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { buildLlmsFullTxt, buildLlmsTxt, DEFAULT_BASE_URL, HOMEPAGE_LINK_HEADER } from '../lib/discovery'

const rootUrl = new URL('../', import.meta.url)

describe('llms.txt & llms-full.txt discovery standards', () => {
  it('includes llms.txt Link header in HOMEPAGE_LINK_HEADER', () => {
    assert.match(HOMEPAGE_LINK_HEADER, /<\/llms\.txt>; rel="llms-txt"; type="text\/markdown"/)
  })

  it('builds valid llms.txt content containing core pages and discovery links', () => {
    const content = buildLlmsTxt(DEFAULT_BASE_URL)

    assert.match(content, /^# DAVID888 Daily 每日放送/)
    assert.match(content, /## 核心服務與頁面 \(Core Pages & Services\)/)
    assert.match(content, /## AI Agent & API Discovery/)
    assert.match(content, /## 研發團隊與維護資訊 \(Development & Maintenance\)/)
    assert.match(content, /\[llms\.txt\]\(https:\/\/podcast\.david888\.com\/llms\.txt\)/)
    assert.match(content, /\[llms-full\.txt\]\(https:\/\/podcast\.david888\.com\/llms-full\.txt\)/)
    assert.match(content, /Accept: text\/markdown/)
  })

  it('builds valid llms-full.txt content containing system architecture and route reference', () => {
    const content = buildLlmsFullTxt(DEFAULT_BASE_URL)

    assert.match(content, /^# DAVID888 Daily 每日放送 - LLM 完整網站與 API 說明/)
    assert.match(content, /## 系統架構簡介 \(System Architecture\)/)
    assert.match(content, /## 完整路由與頁面說明 \(Route Directory\)/)
    assert.match(content, /## HTTP Content Negotiation 說明/)
    assert.match(content, /## 爬蟲政策與 Content Signals \(Robots Policy\)/)
    assert.match(content, /## 維護團隊與聯絡資訊 \(Maintenance & Contact\)/)
  })

  it('provides static files in public/ matching canonical URLs and specifies UTF-8 headers', async () => {
    const llmsTxt = await readFile(new URL('public/llms.txt', rootUrl), 'utf8')
    const llmsFullTxt = await readFile(new URL('public/llms-full.txt', rootUrl), 'utf8')
    const headers = await readFile(new URL('public/_headers', rootUrl), 'utf8')

    assert.match(llmsTxt, /# DAVID888 Daily 每日放送/)
    assert.match(llmsTxt, /https:\/\/podcast\.david888\.com\/llms\.txt/)
    assert.match(llmsFullTxt, /# DAVID888 Daily 每日放送 - LLM 完整網站與 API 說明/)
    assert.match(llmsFullTxt, /https:\/\/podcast\.david888\.com\/llms-full\.txt/)
    assert.match(headers, /\/llms\.txt[\s\S]*?Content-Type: text\/markdown; charset=utf-8/)
    assert.match(headers, /\/llms-full\.txt[\s\S]*?Content-Type: text\/markdown; charset=utf-8/)
  })

  it('does not contain forbidden mainland/simplified terms in llms.txt or llms-full.txt', () => {
    const forbidden = /播客|博客|用戶|用户|搜索引擎|評論區|评论区|內存|内存|函數|函数|純文本|纯文本|超鏈接|超链接|主播|音頻|音频|視頻|视频|文檔|配置|返回|獲取|获取|生成/
    const llmsTxt = buildLlmsTxt(DEFAULT_BASE_URL)
    const llmsFullTxt = buildLlmsFullTxt(DEFAULT_BASE_URL)

    assert.doesNotMatch(llmsTxt, forbidden)
    assert.doesNotMatch(llmsFullTxt, forbidden)
  })
})
