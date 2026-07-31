import Link from 'next/link'
import { podcastTitle } from '@/config'

export default function OfflinePage() {
  return (
    <section className="glass rounded-xl p-8 text-center">
      <h1 className="text-2xl font-black text-zinc-900">目前沒有網路連線</h1>
      <p className="mt-3 text-gray-600">
        重新連線後即可閱讀最新的
        {' '}
        {podcastTitle}
        。
      </p>
      <Link
        href="/"
        className="mt-6 inline-block rounded-lg bg-zinc-900 px-4 py-2 font-medium text-white transition-opacity hover:opacity-80"
      >
        回到首頁
      </Link>
    </section>
  )
}
