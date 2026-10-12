import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildHackerNewsFeedUrl,
  buildHnAlgoliaDateUrl,
  HN_ALGOLIA_FRONT_PAGE_URL,
  HN_OFFICIAL_RSS_URL,
  parseHackerNewsMarkdown,
  parseHackerNewsRss,
  parseHnAlgoliaResponse,
  parseHnMinPoints,
  selectHackerNewsStories,
} from '../workflow/hackernews'

const hnrssSample = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Hacker News: Front Page</title>
    <link>https://news.ycombinator.com/</link>
    <item>
      <title><![CDATA[The death of web development education]]></title>
      <description><![CDATA[
        <p>Article URL: <a href="https://example.com/web-dev">https://example.com/web-dev</a></p>
        <p>Comments URL: <a href="https://news.ycombinator.com/item?id=49927100">https://news.ycombinator.com/item?id=49927100</a></p>
        <p>Points: 152</p>
        <p># Comments: 114</p>
      ]]></description>
      <link>https://example.com/web-dev</link>
      <comments>https://news.ycombinator.com/item?id=49927100</comments>
      <guid isPermaLink="false">https://news.ycombinator.com/item?id=49927100</guid>
    </item>
    <item>
      <title><![CDATA[Ask HN: Favorite tools for 2026?]]></title>
      <description><![CDATA[
        <p>Comments URL: <a href="https://news.ycombinator.com/item?id=49926000">https://news.ycombinator.com/item?id=49926000</a></p>
        <p>Points: 210</p>
        <p># Comments: 85</p>
      ]]></description>
      <comments>https://news.ycombinator.com/item?id=49926000</comments>
      <guid isPermaLink="false">https://news.ycombinator.com/item?id=49926000</guid>
    </item>
  </channel>
</rss>`

const officialHnRssSample = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Hacker News</title>
    <item>
      <title>Official RSS Article</title>
      <link>https://example.com/official-article</link>
      <comments>https://news.ycombinator.com/item?id=49925000</comments>
      <description><![CDATA[<a href="https://news.ycombinator.com/item?id=49925000">Comments</a>]]></description>
    </item>
  </channel>
</rss>`

describe('Hacker News RSS feed and parsing', () => {
  it('builds feed URLs with points filter and validates thresholds', () => {
    assert.equal(buildHackerNewsFeedUrl(), 'https://hnrss.org/frontpage?points=100')
    assert.equal(buildHackerNewsFeedUrl(300), 'https://hnrss.org/frontpage?points=300')
    assert.equal(buildHackerNewsFeedUrl(0), 'https://hnrss.org/frontpage')
    // Invalid values fall back to default
    assert.equal(buildHackerNewsFeedUrl(Number.NaN), 'https://hnrss.org/frontpage?points=100')
    assert.equal(buildHackerNewsFeedUrl(undefined), 'https://hnrss.org/frontpage?points=100')
    assert.equal(HN_OFFICIAL_RSS_URL, 'https://news.ycombinator.com/rss')

    assert.equal(parseHnMinPoints('250'), 250)
    assert.equal(parseHnMinPoints('invalid'), 100)
    assert.equal(parseHnMinPoints(''), 100)
    assert.equal(parseHnMinPoints(-5), 0)
    assert.equal(parseHnMinPoints(null, 50), 50)
  })

  it('parses hnrss feed with points and comments', () => {
    const stories = parseHackerNewsRss(hnrssSample)
    assert.equal(stories.length, 2)

    assert.deepEqual(stories[0], {
      id: '49927100',
      title: 'The death of web development education',
      url: 'https://example.com/web-dev',
      hackerNewsUrl: 'https://news.ycombinator.com/item?id=49927100',
      score: 152,
      comments: 114,
    })

    // Ask HN post without explicit <link> uses comments URL
    assert.deepEqual(stories[1], {
      id: '49926000',
      title: 'Ask HN: Favorite tools for 2026?',
      url: 'https://news.ycombinator.com/item?id=49926000',
      hackerNewsUrl: 'https://news.ycombinator.com/item?id=49926000',
      score: 210,
      comments: 85,
    })
  })

  it('parses official Hacker News RSS format', () => {
    const stories = parseHackerNewsRss(officialHnRssSample)
    assert.equal(stories.length, 1)
    assert.deepEqual(stories[0], {
      id: '49925000',
      title: 'Official RSS Article',
      url: 'https://example.com/official-article',
      hackerNewsUrl: 'https://news.ycombinator.com/item?id=49925000',
      score: undefined,
      comments: undefined,
    })
  })

  it('returns empty array for invalid or empty RSS input', () => {
    assert.deepEqual(parseHackerNewsRss(''), [])
    assert.deepEqual(parseHackerNewsRss('<rss></rss>'), [])
  })

  it('filters and deduplicates stories correctly', () => {
    const rawStories = parseHackerNewsRss(hnrssSample)

    // Exclude by ID
    const excludeIds = new Set(['49927100'])
    const result1 = selectHackerNewsStories(rawStories, { excludeIds })
    assert.equal(result1.length, 1)
    assert.equal(result1[0].id, '49926000')
    assert.equal(result1[0].source, 'hacker-news')

    // Exclude by URL (with normalized query parameters)
    const excludeUrls = new Set(['https://example.com/web-dev'])
    const result2 = selectHackerNewsStories(rawStories, { excludeUrls })
    assert.equal(result2.length, 1)
    assert.equal(result2[0].id, '49926000')

    // Respects existingIds when supplementing
    const result3 = selectHackerNewsStories(rawStories, {
      existingIds: new Set(['49927100']),
    })
    assert.equal(result3.length, 1)
    assert.equal(result3[0].id, '49926000')

    // Bounded by targetCount
    const result4 = selectHackerNewsStories(rawStories, { targetCount: 1 })
    assert.equal(result4.length, 1)
    assert.equal(result4[0].id, '49927100')
  })

  it('builds Algolia date query URLs with start/end boundaries and points filter', () => {
    const url = buildHnAlgoliaDateUrl('2026-10-11', 150)
    assert.ok(url.startsWith('https://hn.algolia.com/api/v1/search?tags=story&numericFilters='))
    assert.ok(url.includes('created_at_i>=1791676800')) // 2026-10-11T00:00:00Z
    assert.ok(url.includes('created_at_i<=1791763199')) // 2026-10-11T23:59:59Z
    assert.ok(url.includes('points>=150'))
    assert.ok(url.includes('hitsPerPage=35'))
    assert.equal(HN_ALGOLIA_FRONT_PAGE_URL, 'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=35')
  })

  it('parses Algolia response hits into clean story objects', () => {
    const mockAlgolia = {
      hits: [
        {
          objectID: '50041619',
          title: 'Bot traffic from Yandex',
          url: 'https://radar.cloudflare.com/bots/as13238?dateRange=7d',
          points: 595,
          num_comments: 239,
        },
        {
          objectID: '50042000',
          title: 'Ask HN: Any good books?',
          url: null,
          points: 80,
          num_comments: 42,
        },
      ],
    }

    const stories = parseHnAlgoliaResponse(mockAlgolia)
    assert.equal(stories.length, 2)
    assert.deepEqual(stories[0], {
      id: '50041619',
      title: 'Bot traffic from Yandex',
      url: 'https://radar.cloudflare.com/bots/as13238?dateRange=7d',
      hackerNewsUrl: 'https://news.ycombinator.com/item?id=50041619',
      score: 595,
      comments: 239,
    })
    // Null url falls back to HN item url
    assert.equal(stories[1].url, 'https://news.ycombinator.com/item?id=50042000')

    assert.deepEqual(parseHnAlgoliaResponse(null), [])
    assert.deepEqual(parseHnAlgoliaResponse({}), [])
  })

  it('parses Hacker News markdown output from 2md/Jina Reader accurately', () => {
    const markdownSample = `Title: 10-11 front | Hacker News

URL Source: https://news.ycombinator.com/front?day=2026-10-11

Markdown Content:
1.[](https://news.ycombinator.com/vote?id=50040547&how=up&goto=front%3Fday%3D2026%2610%3D11)[3rd Yandex Cloud Data Center Was Hit](https://status.yandex.cloud/en/incidents/2136) ([yandex.cloud](https://news.ycombinator.com/from?site=yandex.cloud))
562 points by [defly](https://news.ycombinator.com/user?id=defly)[21 hours ago](https://news.ycombinator.com/item?id=50040547) | [686 comments](https://news.ycombinator.com/item?id=50040547)

2.[](https://news.ycombinator.com/vote?id=50043026&how=up&goto=front%3Fday%3D2026%2610%3D11)[Terence Tao: Math 2.0 [pdf]](https://teorth.github.io/tao-web/slides/math-2-0-caltech-2026.pdf) ([teorth.github.io](https://news.ycombinator.com/from?site=teorth.github.io))
355 points by [Anon84](https://news.ycombinator.com/user?id=Anon84)[15 hours ago](https://news.ycombinator.com/item?id=50043026) | [401 comments](https://news.ycombinator.com/item?id=50043026)

3.[](https://news.ycombinator.com/vote?id=50049133&how=up&goto=front%3Fday%3D2026%2610%3D11)[Ask HN: Favorite tools?](item?id=50049133)
50 points by [smilelamp](https://news.ycombinator.com/user?id=smilelamp)[5 hours ago](https://news.ycombinator.com/item?id=50049133) | [discuss](https://news.ycombinator.com/item?id=50049133)
`

    const stories = parseHackerNewsMarkdown(markdownSample)
    assert.equal(stories.length, 3)

    assert.deepEqual(stories[0], {
      id: '50040547',
      title: '3rd Yandex Cloud Data Center Was Hit',
      url: 'https://status.yandex.cloud/en/incidents/2136',
      source: 'hacker-news',
      sourceUrl: 'https://status.yandex.cloud/en/incidents/2136',
      hackerNewsUrl: 'https://news.ycombinator.com/item?id=50040547',
      score: 562,
      comments: 686,
    })

    // Story with brackets in title
    assert.equal(stories[1].id, '50043026')
    assert.equal(stories[1].title, 'Terence Tao: Math 2.0 [pdf]')
    assert.equal(stories[1].url, 'https://teorth.github.io/tao-web/slides/math-2-0-caltech-2026.pdf')
    assert.equal(stories[1].score, 355)
    assert.equal(stories[1].comments, 401)

    // Story with relative item?id= URL
    assert.equal(stories[2].id, '50049133')
    assert.equal(stories[2].title, 'Ask HN: Favorite tools?')
    assert.equal(stories[2].url, 'https://news.ycombinator.com/item?id=50049133')
    assert.equal(stories[2].score, 50)

    // Edge cases identified by Codex & Opencode review:
    // 1. Spacing after number: "4. [](...)"
    // 2. Parentheses inside URL (Wikipedia)
    // 3. Title attribute in markdown link
    // 4. Protocol-relative URL
    const edgeCaseSample = `1. [](https://news.ycombinator.com/vote?id=50050001&how=up&goto=front)[Lisp (Programming Language)](https://en.wikipedia.org/wiki/Lisp_(programming_language) "Wikipedia Link") ([wikipedia.org](https://news.ycombinator.com/from?site=wikipedia.org))
240 points by [coder](https://news.ycombinator.com/user?id=coder) | [50 comments](https://news.ycombinator.com/item?id=50050001)

2.[](https://news.ycombinator.com/vote?id=50050002&how=up&goto=front)[Protocol Relative](//example.org/path/sub)
120 points by [user2](https://news.ycombinator.com/user?id=user2) | [10 comments](https://news.ycombinator.com/item?id=50050002)
`
    const edgeStories = parseHackerNewsMarkdown(edgeCaseSample)
    assert.equal(edgeStories.length, 2)
    assert.equal(edgeStories[0].id, '50050001')
    assert.equal(edgeStories[0].title, 'Lisp (Programming Language)')
    // Must preserve the closing parenthesis inside the URL
    assert.equal(edgeStories[0].url, 'https://en.wikipedia.org/wiki/Lisp_(programming_language)')
    assert.equal(edgeStories[0].score, 240)

    assert.equal(edgeStories[1].id, '50050002')
    assert.equal(edgeStories[1].url, 'https://example.org/path/sub')

    assert.deepEqual(parseHackerNewsMarkdown(''), [])
    assert.deepEqual(parseHackerNewsMarkdown(null as any), [])
  })
})
