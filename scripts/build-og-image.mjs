// scripts/build-og-image.mjs
//
// Rebuilds public/og-image.png — the OpenGraph / Twitter preview image
// served when someone shares a MyLab URL. The previous file was the
// legacy MyCart logo from the pre-rebrand template, so link previews on
// Slack / Messenger / WhatsApp / iMessage still showed "MyCart".
//
// Composites src/assets/MyLab-logo.png onto a 1200×630 white canvas
// (the size declared in index.html's og:image:width / og:image:height
// tags). Uses sharp so we don't have to spin up a headless browser.
//
// Usage: node scripts/build-og-image.mjs

import sharp from 'sharp'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const logoPath = resolve(root, 'src/assets/MyLab-logo.png')
const outPath  = resolve(root, 'public/og-image.png')

const W = 1200
const H = 630
// Cap the logo at ~55% of canvas width and ~52% of canvas height so it
// sits proudly centered with breathing room on every side. sharp scales
// proportionally when both fit inside those bounds.
const LOGO_MAX_W = Math.floor(W * 0.55)
const LOGO_MAX_H = Math.floor(H * 0.52)

const resizedLogo = await sharp(logoPath)
  .resize({
    width:  LOGO_MAX_W,
    height: LOGO_MAX_H,
    fit: 'inside',
    withoutEnlargement: false,
    background: { r: 255, g: 255, b: 255, alpha: 0 },
  })
  .toBuffer()

const meta = await sharp(resizedLogo).metadata()
const left = Math.round((W - meta.width)  / 2)
const top  = Math.round((H - meta.height) / 2)

await sharp({
  create: {
    width:  W,
    height: H,
    channels: 4,
    background: { r: 255, g: 255, b: 255, alpha: 1 },
  },
})
  .composite([{ input: resizedLogo, left, top }])
  .png()
  .toFile(outPath)

console.log(`Wrote ${outPath} (${W}×${H})`)
