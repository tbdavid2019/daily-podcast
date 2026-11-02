import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

const rootUrl = new URL('../', import.meta.url)

describe('Garrul comments integration', () => {
  it('embeds comments component with exact Garrul specifications in comments.tsx', async () => {
    const commentsSrc = await readFile(new URL('components/comments.tsx', rootUrl), 'utf8')

    // Garrul API and Script URLs
    assert.match(commentsSrc, /https:\/\/garrul\.ai360\.workers\.dev/)
    assert.match(commentsSrc, /https:\/\/garrul\.ai360\.workers\.dev\/embed\.js/)

    // Layout stability min-height 220px
    assert.match(commentsSrc, /minHeight:\s*'220px'/)

    // id="garrul"
    assert.match(commentsSrc, /id="garrul"/)

    // data-api, data-slug, data-title, data-url, data-published, data-lang
    assert.match(commentsSrc, /data-api=/)
    assert.match(commentsSrc, /data-slug=/)
    assert.match(commentsSrc, /data-title=/)
    assert.match(commentsSrc, /data-url=/)
    assert.match(commentsSrc, /data-published=/)
    assert.match(commentsSrc, /data-lang=/)

    // Impeccable styling CSS custom properties matching daily-podcast theme
    assert.match(commentsSrc, /--garrul-accent/)
    assert.match(commentsSrc, /#0F4C81/) // Classic Blue
    assert.match(commentsSrc, /--garrul-radius/)
    assert.match(commentsSrc, /12px/)
  })

  it('embeds comments at the bottom of ArticleCard when showFooter is enabled', async () => {
    const cardSrc = await readFile(new URL('components/article-card.tsx', rootUrl), 'utf8')

    // Imports Comments
    assert.match(cardSrc, /import\s+\{\s*Comments\s*\}\s+from\s+'@\/components\/comments'/)

    // Embeds <Comments />
    assert.match(cardSrc, /<Comments/)
    assert.match(cardSrc, /date=\{article\.date\}/)
    assert.match(cardSrc, /title=\{article\.title\}/)
    assert.match(cardSrc, /variant=\{article\.variant\}/)
  })
})
