export const podcastTitle = 'DAVID888 Daily 每日放送'

export const podcastDescription = '基於 AI 技術的多元科技新聞播客,每日彙整 Hacker News、GitHub Trending、Product Hunt、Dev.to 等優質內容,自動生成繁體中文摘要並轉換為播客節目 david888.com。'

// Podcast 擁有者資訊 (YouTube Podcast 等平台需要)
export const podcastOwner = {
  name: 'DAVID888',
  email: 'ok@vip.david888.com', // 請修改為您的實際 email
}

// 首頁顯示的天數 (建議 7-30 天,避免超過 Cloudflare Workers 的 subrequest 限制)
export const keepDays = 30

// Sitemap 和 RSS 可以保留更長時間的內容
export const sitemapDays = 365 // Sitemap 顯示一年
export const rssDays = 10 // RSS 顯示最近 10 天
