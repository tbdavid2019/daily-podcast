// 測試新增的新聞來源爬蟲功能
// 這個文件用於本地測試，確保新的爬蟲函數運作正常

import { getAllStories, getDevToStories, getGitHubTrendingStories, getProductHuntStories } from './workflow/utils'

async function testNewSources() {
  console.log('🚀 測試新的新聞來源...\n')

  const today = new Date().toISOString().split('T')[0]
  const testEnv = { JINA_KEY: process.env.JINA_KEY }

  try {
    // 測試 GitHub Trending
    console.log('📊 測試 GitHub Trending...')
    const githubStories = await getGitHubTrendingStories(testEnv)
    console.log(`✅ GitHub Trending: ${githubStories.length} 個項目`)
    githubStories.slice(0, 3).forEach((story) => {
      console.log(`  - ${story.title}`)
      console.log(`    URL: ${story.url}`)
      console.log(`    來源: ${story.source}`)
    })
    console.log()

    // 測試 Product Hunt
    console.log('🎯 測試 Product Hunt...')
    const productHuntStories = await getProductHuntStories(testEnv)
    console.log(`✅ Product Hunt: ${productHuntStories.length} 個產品`)
    productHuntStories.slice(0, 3).forEach((story) => {
      console.log(`  - ${story.title}`)
      console.log(`    URL: ${story.url}`)
      console.log(`    來源: ${story.source}`)
    })
    console.log()

    // 測試 Dev.to
    console.log('📝 測試 Dev.to...')
    const devToStories = await getDevToStories(testEnv)
    console.log(`✅ Dev.to: ${devToStories.length} 篇文章`)
    devToStories.slice(0, 3).forEach((story) => {
      console.log(`  - ${story.title}`)
      console.log(`    URL: ${story.url}`)
      console.log(`    來源: ${story.source}`)
    })

    if (devToStories.length > 0) {
        console.log('\n🕵️ 測試 Dev.to 內容爬取 (Jina)...')
        try {
            // Import getHackerNewsStory locally if not exported, or assume it's imported
            // Verify content fetching for the first story
            const { getHackerNewsStory } = await import('./workflow/utils.ts')
            const content = await getHackerNewsStory(devToStories[0], 1000, testEnv)
            
            if (content && content.length > 100) {
                console.log(`✅ 成功抓取內容！長度: ${content.length}`)
                console.log('--- 內容預覽 ---')
                console.log(content.substring(0, 200) + '...')
            } else {
                console.log('❌ 內容抓取失敗或過短 (可能被 Jina 擋掉或解析失敗)')
            }
        } catch (err) {
            console.error('❌ 內容爬取發生錯誤:', err.message)
        }
    }
    console.log()

    // 測試所有來源聚合
    console.log('🌟 測試所有來源聚合...')
    const allStories = await getAllStories(today, testEnv)
    console.log(`✅ 所有來源總計: ${allStories.length} 個故事`)

    // 按來源分組統計
    const sourceStats = allStories.reduce((acc, story) => {
      acc[story.source || 'unknown'] = (acc[story.source || 'unknown'] || 0) + 1
      return acc
    }, {})

    console.log('📈 來源統計:')
    Object.entries(sourceStats).forEach(([source, count]) => {
      console.log(`  ${source}: ${count} 個`)
    })
  }
  catch (error) {
    console.error('❌ 測試失敗:', error.message)
  }
}

// 執行測試
testNewSources()
