# Podcast brand assets

The brand source is `public/podcast-cover.png`: orange background, ivory
broadcast/person symbol, and the complete three-line name `David888`, `Daily`,
`每日放送`. Preserve the complete name in every favicon and app icon. The
standalone D monogram is retired.

The updated cover is square (1400 × 1400) and enlarges the existing symbol above
the name. `public/logo.png`, `app/icon.png`, favicon ICO/PNG/SVG, Apple touch icon,
and PWA icons all derive from this complete cover. The SVG embeds the complete
PNG artwork, preserving its lettering rather than relying on browser fonts.
Maskable PWA variants add an orange safe margin around the complete cover.

`config.ts` defines `brandAssetVersion` and the versioned cover URL. When replacing
assets again, update that version plus the manifest icon URLs and service-worker
precache URLs/cache name. The player, RSS artwork, and metadata then request fresh
assets. Existing unversioned paths remain available for compatibility.

## Generation provenance

Edited with the built-in imagegen tool using the original committed
`public/podcast-cover.png` as the edit target. Prompt:

> Edit the provided existing DAVID888 Daily 每日放送 podcast brand cover. THIS EXACT EXISTING IMAGE IS THE EDIT TARGET. Preserve its identity: saturated orange background, warm ivory white lettering, and especially the original broadcast/person symbol (round head, tapered rounded torso, TWO circular broadcast arcs opening at the lower sides). Refine this ORIGINAL symbol, not replace it with a microphone or headphones. Create a polished crisp flat professional square 1024x1024 cover optimised to be recognisable as a 48px thumbnail. Enlarge the original broadcast/person symbol to be the main focal point, centered in the upper approximately 65% with generous safe margins. Place compact but bold perfectly readable branding in lower portion: exact text 'David888', next line 'Daily', next line Traditional Chinese '每日放送'. Use careful optically balanced spacing, clean sturdy sans typography. Rich solid orange #FF6508 and warm ivory #FFF8ED, with only extremely subtle tonal depth if appropriate. No standalone letter D, no monogram, no play triangle, no blue palette, no unrelated emblem, no new claims, no extra words. The original podcast signal symbol and full brand name must be clearly retained. Return the edited final cover image alone, no mockup, no comparison board.

Final assets use deterministic Sharp resizing and palette PNG export from the
edited cover. No symbol-only rendition is shipped. The original English cover
continues to serve the English podcast.
