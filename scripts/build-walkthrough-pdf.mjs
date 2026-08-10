// scripts/build-walkthrough-pdf.mjs
//
// Renders docs/walkthrough-patient-to-lab-result.md to a print-ready PDF at
// docs/walkthrough-patient-to-lab-result.pdf.
//
// Pipeline:
//   1. Convert MD -> HTML using the `marked` CLI (npx-cached, no local install).
//   2. Wrap the body in a minimal print-friendly HTML shell with CSS.
//   3. Render HTML -> PDF using Playwright's bundled Chromium (already in
//      devDependencies via @playwright/test).
//
// Usage: node scripts/build-walkthrough-pdf.mjs

import { chromium } from 'playwright'
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const here    = dirname(fileURLToPath(import.meta.url))
const root    = resolve(here, '..')
const mdPath  = join(root, 'docs/walkthrough-patient-to-lab-result.md')
const htmlTmp = join(root, 'docs/.walkthrough-tmp.html')
const pdfPath = join(root, 'docs/walkthrough-patient-to-lab-result.pdf')

if (!existsSync(mdPath)) {
  console.error(`Source markdown not found: ${mdPath}`)
  process.exit(1)
}

console.log('MD -> HTML via marked …')
// GFM tables + auto-line-breaks give us tables and consistent paragraph
// spacing. --no-html would be safer if the source contained raw HTML, but
// our walkthrough is pure markdown so we let marked pass through.
const bodyHtml = execSync(
  `npx --yes marked --gfm --breaks --input "${mdPath}"`,
  { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }
)

const css = `
  :root { color-scheme: light; }
  html, body {
    margin: 0; padding: 0;
    background: #fff; color: #0f172a;
    font: 12pt/1.55 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  main { max-width: 100%; padding: 0; }
  h1 { font-size: 22pt; margin: 0 0 6pt; line-height: 1.25; letter-spacing: -0.01em; }
  h2 { font-size: 16pt; margin: 22pt 0 6pt; padding-top: 10pt; border-top: 1px solid #e2e8f0; page-break-before: always; }
  h1 + h2, h2:first-of-type { page-break-before: auto; }
  h3 { font-size: 13pt; margin: 16pt 0 4pt; color: #1e293b; }
  p  { margin: 6pt 0; }
  strong { color: #0f172a; }
  ul, ol { margin: 6pt 0; padding-left: 20pt; }
  li { margin: 3pt 0; }
  code { background: #f1f5f9; border-radius: 3px; padding: 1px 4px; font-size: 0.9em; }
  hr { border: 0; border-top: 1px dashed #cbd5e1; margin: 14pt 0; }
  a  { color: #b91c1c; text-decoration: none; }
  img {
    display: block;
    max-width: 100%;
    height: auto;
    margin: 8pt auto 14pt;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    /* Keep each screenshot with the step heading above it when possible. */
    page-break-inside: avoid;
    break-inside: avoid;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 8pt 0 14pt;
    font-size: 10.5pt;
  }
  th, td {
    border: 1px solid #cbd5e1;
    padding: 5pt 7pt;
    text-align: left;
    vertical-align: top;
  }
  th { background: #f8fafc; font-weight: 700; }
  blockquote {
    margin: 8pt 0; padding: 6pt 12pt;
    border-left: 3px solid #cbd5e1; color: #475569;
    background: #f8fafc;
  }
  /* Try to keep an <h3> heading paired with at least its first paragraph. */
  h3 { page-break-after: avoid; break-after: avoid; }
`

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>MyLab — Patient to Lab Result Walkthrough</title>
  <style>${css}</style>
</head>
<body>
  <main>
    ${bodyHtml}
  </main>
</body>
</html>
`

writeFileSync(htmlTmp, html, 'utf8')
console.log(`Wrote intermediate HTML: ${htmlTmp}`)

console.log('HTML -> PDF via Playwright …')
const browser = await chromium.launch()
try {
  const context = await browser.newContext({ viewport: { width: 1024, height: 1440 } })
  const page = await context.newPage()
  await page.goto(pathToFileURL(htmlTmp).href, { waitUntil: 'load' })
  // Give any late-loading images a beat to settle before snapshotting.
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    margin: { top: '18mm', right: '14mm', bottom: '18mm', left: '14mm' },
    printBackground: true,
  })
} finally {
  await browser.close()
}

unlinkSync(htmlTmp)
console.log(`PDF written: ${pdfPath}`)
