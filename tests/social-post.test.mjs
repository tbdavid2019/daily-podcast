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

const { publishIndependentPosts } = await import('../scripts/social-post.mjs')

function journal() {
  const entries = new Map()
  return { get: key => entries.get(key), set: (key, value) => entries.set(key, value) }
}

test('逐篇發布獨立貼文，重跑只核對已完成的貼文', async () => {
  const state = journal()
  const submitted = []
  const verified = []
  const options = {
    posts: ['第一篇', '第二篇', '第三篇'],
    journal: state,
    publish: async (post) => {
      submitted.push(post)
      return `https://example.com/post/${submitted.length}`
    },
    verify: async (post, url) => verified.push([post, url]),
  }
  await publishIndependentPosts(options)
  await publishIndependentPosts(options)
  assert.deepEqual(submitted, options.posts)
  assert.equal(verified.length, 6)
  assert.deepEqual(verified.slice(0, 3).map(row => row[1]), [
    'https://example.com/post/1', 'https://example.com/post/2', 'https://example.com/post/3',
  ])
})

test('送出後驗證失敗時停止，重跑保留待確認狀態且不重送', async () => {
  const state = journal()
  let count = 0
  const options = {
    posts: ['第一篇', '第二篇'], journal: state,
    publish: async () => { count += 1; return 'https://example.com/post/1' },
    verify: async () => { throw new Error('頁面逾時') },
  }
  await assert.rejects(publishIndependentPosts(options), /頁面逾時/)
  await assert.rejects(publishIndependentPosts(options), /送出狀態待確認/)
  assert.equal(count, 1)
})
