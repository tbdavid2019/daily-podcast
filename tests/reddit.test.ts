import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import {
  buildRedditCombinedFeedUrl,
  buildRedditPostFeedUrl,
  isPoliticalRedditStory,
  parseRedditListingFeed,
  parseRedditPostFeed,
  selectRedditStories,
} from '../workflow/reddit'

const listingFeed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <category term="LocalLLaMA" />
    <content type="html">&lt;div class="md"&gt;Local model details&lt;/div&gt; submitted by user &lt;a href="https://example.com/model"&gt;[link]&lt;/a&gt; &lt;a href="https://www.reddit.com/r/LocalLLaMA/comments/abc123/model/"&gt;[comments]&lt;/a&gt;</content>
    <id>t3_abc123</id>
    <link href="https://www.reddit.com/r/LocalLLaMA/comments/abc123/model/" />
    <published>2026-08-09T01:00:00Z</published>
    <title>A local model release</title>
  </entry>
  <entry>
    <category term="netsec" />
    <content type="html">&lt;div class="md"&gt;A detailed self post&lt;/div&gt; &lt;a href="https://www.reddit.com/r/netsec/comments/def456/security/"&gt;[link]&lt;/a&gt;</content>
    <id>t3_def456</id>
    <link href="https://www.reddit.com/r/netsec/comments/def456/security/" />
    <published>2026-08-09T02:00:00Z</published>
    <title>A security investigation</title>
  </entry>
</feed>`

const postFeed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry><id>t3_abc123</id><content type="html">&lt;div&gt;Original post body&lt;/div&gt;</content></entry>
  <entry><id>t1_comment1</id><content type="html">&lt;p&gt;First useful comment&lt;/p&gt;</content></entry>
  <entry><id>t1_comment2</id><content type="html">&lt;p&gt;Second useful comment&lt;/p&gt;</content></entry>
</feed>`

describe('Reddit RSS ingestion', () => {
  it('builds one combined feed request for every configured subreddit', () => {
    assert.equal(
      buildRedditCombinedFeedUrl(['LocalLLaMA', 'netsec', 'sysadmin']),
      'https://www.reddit.com/r/LocalLLaMA+netsec+sysadmin/.rss',
    )
    assert.equal(
      buildRedditPostFeedUrl({ id: 't3_abc123' }),
      'https://www.reddit.com/comments/abc123/.rss',
    )
  })

  it('parses external links and self posts from the Atom listing', () => {
    const stories = parseRedditListingFeed(listingFeed)
    assert.equal(stories.length, 2)
    assert.deepEqual(stories[0], {
      id: 'abc123',
      title: 'A local model release (r/LocalLLaMA)',
      url: 'https://example.com/model',
      source: 'reddit',
      sourceUrl: 'https://www.reddit.com/r/LocalLLaMA/comments/abc123/model/',
      description: 'Local model details submitted by user [link] [comments]',
      subreddit: 'LocalLLaMA',
      time: 1786237200,
    })
    assert.equal(stories[1].url, stories[1].sourceUrl)
  })

  it('extracts the post body and bounded comments from a post feed', () => {
    assert.deepEqual(parseRedditPostFeed(postFeed, 1), {
      article: 'Original post body',
      comments: '- First useful comment',
    })
  })

  it('selects a deterministic cross-subreddit mix and preserves political filtering', () => {
    const stories = parseRedditListingFeed(listingFeed)
    assert.deepEqual(
      selectRedditStories(stories, '2026-08-09', 2).map(story => story.id),
      selectRedditStories(stories, '2026-08-09', 2).map(story => story.id),
    )
    assert.equal(isPoliticalRedditStory({ title: 'A compiler release', url: 'https://example.com' }), false)
    assert.equal(isPoliticalRedditStory({ title: 'Election infrastructure', url: 'https://example.com' }), true)
  })

  it('keeps production ingestion on RSS with persisted rate-limit waits', async () => {
    const utilsSource = await readFile(new URL('../workflow/utils.ts', import.meta.url), 'utf8')
    const workflowSource = await readFile(new URL('../workflow/index.ts', import.meta.url), 'utf8')

    assert.match(utilsSource, /buildRedditCombinedFeedUrl\(\)/)
    assert.match(utilsSource, /buildRedditPostFeedUrl\(story\)/)
    assert.doesNotMatch(utilsSource, /redditJsonUrl|\/\.json\?limit=/)
    assert.match(workflowSource, /wait for reddit rss/)
    assert.match(workflowSource, /REDDIT_RSS_RATE_LIMIT_DELAY/)
  })
})
