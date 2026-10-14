# Podcast brand assets

The brand preserves the original orange background and the complete three-line
name `David888`, `Daily`, `每日放送`. Every favicon and app icon retains all three
lines. The standalone D monogram is retired.

The symbol now uses Google's official Material Symbols **Podcasts** SVG. The
user selected the Google Fonts open-source icon library as the source. The final
artwork uses that existing SVG and typeset lettering; it is not an AI-generated
symbol.

- Original icon: `public/brand/podcasts.svg`.
- Source: https://raw.githubusercontent.com/google/material-design-icons/master/symbols/web/podcasts/materialsymbolsoutlined/podcasts_48px.svg
- License: Apache 2.0, included at `public/brand/LICENSE`.
- Editable composed artwork: `public/brand/logo.svg`.
- Published cover: `public/podcast-cover.png`, 1400 × 1400.
- Companion logo: `public/logo.png`, 1024 × 1024.

The composition uses `#FF6508` orange and `#FFF8ED` ivory, the Podcasts symbol
above the complete name, Helvetica/Arial Latin lettering and PingFang TC Chinese
lettering. PNG assets preserve the rendered type; the favicon SVG embeds the
complete PNG artwork so browsers do not substitute fonts. SVG source text can
be edited before exporting updated PNGs.

The cover, `app/icon.png`, favicon ICO/PNG/SVG, Apple touch icon, and PWA icons all
share the complete artwork. Maskable PWA icons add an orange safe margin around
the complete cover. Small favicons retain the text as requested; text legibility
is naturally limited at 16px.

`config.ts` defines `brandAssetVersion` and the versioned cover URL. When replacing
assets again, update that version plus the manifest icon URLs and service-worker
precache URLs/cache name. The player, RSS artwork, and metadata then request fresh
assets. Existing unversioned paths remain available for compatibility.
The current asset revision is `podcast-20261014-material`; the service-worker
cache is `daily-podcast-offline-v4`.

This update changes brand images. The website's typography, colors, layout,
components, and theme continue to follow the existing system. The original
English cover continues to serve the English podcast.
