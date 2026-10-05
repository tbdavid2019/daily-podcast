export type Language = 'zh' | 'en'

export interface I18nDictionary {
  siteTitle: string
  siteDescription: string
  footerTitle: string
  footerTagline: string
  builtBy: string
  maintain: string
  rssFeed: string
  apiDocs: string
  home: string
  advertisement: string
  installApp: string
  shareMoment: string
  linkCopied: string
  shareError: string
  audioNotReady: string
  playEpisode: string
  pauseEpisode: string
  resumeEpisode: string
  relisten: string
  completed: string
  inProgress: string
  playbackSpeed: string
  volume: string
  mute: string
  unmute: string
  rewind10s: string
  forward10s: string
  closePlayer: string
  listeningPractice: string
  tabs: {
    summary: string
    podcast: string
    references: string
  }
  sources: {
    comment: string
    github: string
    productHunt: string
    devto: string
    reddit: string
  }
}

export const dictionaries: Record<Language, I18nDictionary> = {
  zh: {
    siteTitle: 'DAVID888 Daily 每日放送',
    siteDescription: '多元科技新聞 Podcast，每日彙整 Hacker News、GitHub Trending、Product Hunt、Dev.to 等優質內容，自動產生台灣繁體中文摘要與 Podcast 節目。',
    footerTitle: 'DAVID888 Daily 每日放送',
    footerTagline: '繁體中文科技廣播 · Hacker News / GitHub / Product Hunt 精華',
    builtBy: '由',
    maintain: '製作維護',
    rssFeed: 'RSS 訂閱',
    apiDocs: 'API 文件',
    home: '首頁',
    advertisement: 'ADVERTISEMENT',
    installApp: '安裝 App',
    shareMoment: '分享此時刻',
    linkCopied: '已複製此時刻播放連結',
    shareError: '無法複製連結',
    audioNotReady: '音訊處理中，請稍候重試',
    playEpisode: '播放本集',
    pauseEpisode: '暫停',
    resumeEpisode: '繼續播放',
    relisten: '重新播放',
    completed: '已聽完',
    inProgress: '收聽中',
    playbackSpeed: '播放速度',
    volume: '音量',
    mute: '靜音',
    unmute: '取消靜音',
    rewind10s: '倒轉 10 秒',
    forward10s: '快轉 10 秒',
    closePlayer: '關閉播放列',
    listeningPractice: '英聽練習',
    tabs: {
      summary: '總結',
      podcast: 'Podcast',
      references: '參考',
    },
    sources: {
      comment: '評論',
      github: 'GitHub',
      productHunt: 'Product Hunt',
      devto: 'Dev.to',
      reddit: 'Reddit',
    },
  },
  en: {
    siteTitle: 'DAVID888 Daily Tech',
    siteDescription: 'Daily technology podcast curating top stories from Hacker News, GitHub Trending, Product Hunt, and Dev.to in English.',
    footerTitle: 'DAVID888 Daily Tech',
    footerTagline: 'English Tech Broadcast · Top Stories from HN, GitHub, and Product Hunt',
    builtBy: 'Built & maintained by',
    maintain: '',
    rssFeed: 'RSS Feed',
    apiDocs: 'API Docs',
    home: 'Home',
    advertisement: 'ADVERTISEMENT',
    installApp: 'Install App',
    shareMoment: 'Share Timestamp',
    linkCopied: 'Link Copied',
    shareError: 'Unable to copy link',
    audioNotReady: 'Audio is generating, please retry shortly',
    playEpisode: 'Play Episode',
    pauseEpisode: 'Pause',
    resumeEpisode: 'Resume',
    relisten: 'Replay',
    completed: 'Completed',
    inProgress: 'Listening',
    playbackSpeed: 'Speed',
    volume: 'Volume',
    mute: 'Mute',
    unmute: 'Unmute',
    rewind10s: 'Back 10s',
    forward10s: 'Forward 10s',
    closePlayer: 'Close Player',
    listeningPractice: 'Listening Practice',
    tabs: {
      summary: 'Summary',
      podcast: 'Podcast',
      references: 'Sources',
    },
    sources: {
      comment: 'HN Discussion',
      github: 'GitHub',
      productHunt: 'Product Hunt',
      devto: 'Dev.to',
      reddit: 'Reddit',
    },
  },
}
