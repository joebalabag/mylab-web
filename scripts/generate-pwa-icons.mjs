// Regenerate PWA icons (pwa-192.png, pwa-512.png, pwa-512-maskable.png)
// from public/favicon.png. Run this after replacing favicon.png with new
// branding artwork — the manifest references these three files by fixed
// name so no code changes are needed after regen.
//
//   node scripts/generate-pwa-icons.mjs
//
// Requires the dev-only `sharp` dependency (installed with the project).

import sharp from 'sharp'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.resolve(__dirname, '..', 'public')
const src = path.join(publicDir, 'favicon.png')

// Brand purple — matches theme_color in the manifest + <meta name="theme-color">.
const BRAND = { r: 0x4f, g: 0x46, b: 0xe5 }

async function main() {
  const meta = await sharp(src).metadata()
  console.log(`Source: ${src} (${meta.width}×${meta.height})`)

  // Standard 192 / 512 — favicon centered on a white canvas so the icon
  // reads on both light and dark home-screens without an ugly border.
  // 80% inner area leaves breathing room around the artwork.
  for (const size of [192, 512]) {
    const inner = Math.round(size * 0.8)
    const artwork = await sharp(src)
      .resize({ width: inner, height: inner, fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .toBuffer()
    const out = path.join(publicDir, `pwa-${size}.png`)
    await sharp({
      create: { width: size, height: size, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
    })
      .composite([{ input: artwork, gravity: 'center' }])
      .png()
      .toFile(out)
    console.log(`Wrote ${out}`)
  }

  // Maskable 512 — brand-purple background with a smaller inner (65%) so
  // Windows / Android rounded-corner masks don't crop into the artwork.
  // The safe area of a maskable icon is a 40% radius circle centered on
  // the canvas; keeping the visual inside 65% of the width satisfies it.
  const maskInner = Math.round(512 * 0.65)
  const maskArtwork = await sharp(src)
    .resize({ width: maskInner, height: maskInner, fit: 'contain', background: { ...BRAND, alpha: 0 } })
    .toBuffer()
  const maskOut = path.join(publicDir, 'pwa-512-maskable.png')
  await sharp({
    create: { width: 512, height: 512, channels: 4, background: { ...BRAND, alpha: 1 } },
  })
    .composite([{ input: maskArtwork, gravity: 'center' }])
    .png()
    .toFile(maskOut)
  console.log(`Wrote ${maskOut}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
