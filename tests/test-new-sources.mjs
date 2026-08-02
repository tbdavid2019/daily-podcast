// 測試新增的新聞來源網站可用性
// 這個文件用於測試新聞來源網站的基本可用性
// 注意：實際的內容爬取使用自架 Markdown 閱讀器

async function testNewsSources() {
  console.log('🚀 測試新聞來源網站可用性...\n')

  const sources = [
    {
      name: 'Hacker News',
      url: 'https://news.ycombinator.com/',
      description: '程式設計師社群新聞',
    },
    {
      name: 'GitHub Trending',
      url: 'https://github.com/trending',
      description: '熱門開源專案',
    },
    {
      name: 'Product Hunt',
      url: 'https://www.producthunt.com/',
      description: '新產品發現平台',
    },
    {
      name: 'Dev.to',
      url: 'https://dev.to/',
      description: '開發者技術文章',
    },
  ]

  for (const source of sources) {
    try {
      console.log(`📊 測試 ${source.name} (${source.description})...`)

      const response = await fetch(source.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; DailyPodcast/1.0)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      })

      if (response.ok) {
        const html = await response.text()
        console.log(`✅ ${source.name}: 網站可用`)

        // 顯示響應大小作為參考
        console.log(`   響應大小: ${(html.length / 1024).toFixed(1)} KB`)
        console.log(`   狀態碼: ${response.status}`)
      }
      else {
        console.log(`❌ ${source.name}: 網站不可用 (${response.status})`)
      }
    }
    catch (error) {
      console.log(`❌ ${source.name}: 請求失敗 - ${error.message}`)
    }

    console.log()
  }

  console.log('✨ 測試完成！')
  console.log('💡 注意：')
  console.log('   - 這個測試只檢查網站基本可用性')
  console.log('   - 實際內容爬取使用自架 Markdown 閱讀器')
  console.log('   - 如果網站可用但應用無法獲取內容，請檢查閱讀器節點')
}

// 執行測試
testNewsSources()
