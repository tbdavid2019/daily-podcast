import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatThreadsPosts } from '../scripts/social-post.mjs'

const data = {
  date: '2026-11-02', cleanTitle: '科技焦點', episodeUrl: 'https://example.com/episode',
  stories: [
    { title: '第一篇', desc: '摘要一', link: 'https://example.com/1' },
    { title: '第二篇', desc: '摘要二', link: 'https://example.com/2' },
  ],
}

test('Threads 串文逐篇呈現標題、摘要與原文連結', () => {
  const posts = formatThreadsPosts(data)
  assert.equal(posts.length, 3)
  assert.match(posts[0], /https:\/\/example.com\/episode/)
  assert.match(posts[1], /1\/2 📌 第一篇\n\n摘要一\n🔗 原文：https:\/\/example.com\/1/)
  assert.match(posts[2], /2\/2 📌 第二篇/)
  assert.equal(formatThreadsPosts(data, 1).length, 2)
})

test('長摘要維持單則上限並保留原文連結', () => {
  const posts = formatThreadsPosts({ ...data, stories: [{ ...data.stories[0], desc: '🌟'.repeat(600) }] })
  assert.equal(Array.from(posts[1]).length, 500)
  assert.ok(posts[1].endsWith('https://example.com/1'))
})
