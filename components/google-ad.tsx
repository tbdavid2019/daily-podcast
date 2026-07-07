'use client'

import { useEffect } from 'react'

interface GoogleAdProps {
  className?: string
  style?: React.CSSProperties
  slot?: string
  format?: string
  layoutKey?: string
  client?: string
  fullWidthResponsive?: boolean
}

declare global {
  interface Window {
    adsbygoogle?: unknown[]
  }
}

export function GoogleAd({
  className,
  style,
  slot = '7008136098', // User provided slot ID
  format = 'auto',
  layoutKey,
  client = 'ca-pub-5210017545918559', // User provided client ID
  fullWidthResponsive = true,
}: GoogleAdProps) {
  useEffect(() => {
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({})
    }
    catch (e) {
      console.error('AdSense error', e)
    }
  }, [])

  return (
    <div className={className} aria-hidden={true}>
      <ins
        className="adsbygoogle"
        style={style || { display: 'block' }}
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive={fullWidthResponsive ? 'true' : 'false'}
        {...(layoutKey ? { 'data-ad-layout-key': layoutKey } : {})}
      />
    </div>
  )
}
