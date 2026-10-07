#!/usr/bin/env node
/**
 * Renders the link-preview and home-screen images into public/img/:
 *
 *   og-image.png           1200×630  real trees (dots in the logo colours) on a faded OSM map, with the wordmark
 *   og-image-square.png    400×400   the logo mark: second og:image, for square thumbnails (WhatsApp)
 *   apple-touch-icon.png   180×180   the logo mark
 *
 *   node tools/share-images.mjs        (from app/; needs ../api/data/*.db, Chrome or Edge, and internet for the map tiles)
 *
 * Writes an HTML page per image to the temp dir and screenshots it with headless Chrome. The map
 * tiles are downloaded here (OSM's tile policy wants an identifying User-Agent) and inlined.
 * Rerun after a logo change; the tree count in the tagline comes from meta.db.
 */
import { DatabaseSync } from 'node:sqlite'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA = path.join(APP, '..', 'api', 'data')
const PUBLIC = path.join(APP, 'public')
const IMG = path.join(PUBLIC, 'img')
const FONT = pathToFileURL(path.join(PUBLIC, 'fonts', 'bricolage-grotesque-latin.woff2')).href

// Amsterdam's canal ring: tree-lined canals make the streets readable from the dots alone.
// The map centre sits right of the image centre, clear of the card.
const CENTER = [52.3712, 4.8905]
const ZOOM = 16
const W = 1200, H = 630
const CENTER_X = 760

const GREEN = '#2d6a4f', GREEN_2 = '#52b788', AMBER = '#f59e0b'

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find(existsSync)
if (!CHROME) throw new Error('No Chrome or Edge found')

function worldPx(lat, lon) {
  const scale = 256 * 2 ** ZOOM
  const r = (lat * Math.PI) / 180
  return [((lon + 180) / 360) * scale, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * scale]
}

function lonLat(px, py) {
  const scale = 256 * 2 ** ZOOM
  const lon = (px / scale) * 360 - 180
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * py) / scale))) * 180) / Math.PI
  return [lat, lon]
}

// Image (0, 0) in world pixels.
const [cx, cy] = worldPx(...CENTER)
const ox = cx - CENTER_X, oy = cy - H / 2

function treeDots() {
  const [n, w] = lonLat(ox, oy)
  const [s, e] = lonLat(ox + W, oy + H)
  const db = new DatabaseSync(path.join(DATA, 'trees.db'), { readOnly: true })
  const rows = db.prepare('SELECT lat, lon, species_id FROM trees WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?').all(s, n, w, e)
  db.close()
  // Most dots dark green, some light green, the odd one amber, as in the logo.
  return rows.map((r) => {
    const [x, y] = worldPx(r.lat, r.lon)
    const tone = r.species_id % 16 === 0 ? 2 : r.species_id % 3 === 0 ? 1 : 0
    return [Math.round((x - ox) * 10) / 10, Math.round((y - oy) * 10) / 10, tone]
  })
}

async function tiles() {
  const imgs = []
  for (let tx = Math.floor(ox / 256); tx * 256 < ox + W; tx++) {
    for (let ty = Math.floor(oy / 256); ty * 256 < oy + H; ty++) {
      const res = await fetch(`https://tile.openstreetmap.org/${ZOOM}/${tx}/${ty}.png`, {
        headers: { 'User-Agent': 'bomenatlas-share-image/1.0 (+https://bomenatlas.nl)' },
      })
      if (!res.ok) throw new Error(`tile ${tx},${ty}: HTTP ${res.status}`)
      const png = Buffer.from(await res.arrayBuffer()).toString('base64')
      imgs.push(`<img src="data:image/png;base64,${png}" style="left:${tx * 256 - ox}px;top:${ty * 256 - oy}px">`)
    }
  }
  return imgs.join('')
}

function treeCount() {
  const db = new DatabaseSync(path.join(DATA, 'meta.db'), { readOnly: true })
  const total = db.prepare('SELECT tree_count FROM build').get().tree_count
  db.close()
  return `${(total / 1e6).toFixed(1).replace('.', ',')} miljoen`
}

// Same dots as public/img/favicon.svg and the Wordmark component.
const LOGO = `<svg viewBox="0 0 64 64">${[
  [8, [0, 1, 0]], [17.5, [1, 0, 0, 1]], [27, [0, 1, 0, 2, 0]], [36.5, [1, 0, 1, 0]],
].flatMap(([y, tones]) => tones.map((t, i) =>
  `<circle cx="${32 + (i - (tones.length - 1) / 2) * 11}" cy="${y}" r="4.8" fill="${[GREEN, GREEN_2, AMBER][t]}"/>`)).join('')
}<rect x="29" y="40" width="6" height="21" rx="2" fill="${GREEN}"/></svg>`

const FONT_FACE = `@font-face{font-family:"Bricolage Grotesque";font-weight:400 700;src:url("${FONT}") format("woff2")}`

async function ogPage() {
  return `<!doctype html><meta charset="utf-8"><style>
${FONT_FACE}
*{margin:0;box-sizing:border-box}
body{width:${W}px;height:${H}px;overflow:hidden;position:relative;background:#fff;font-family:"Bricolage Grotesque",system-ui,sans-serif}
.tiles{position:absolute;inset:0;filter:grayscale(.75) contrast(.85);opacity:.45}.tiles img{position:absolute;width:256px;height:256px}
canvas{position:absolute;inset:0}
.card{position:absolute;left:56px;top:50%;transform:translateY(-50%);width:560px;padding:48px 52px;background:rgba(255,255,255,.96);
  border-radius:28px;box-shadow:0 12px 40px rgba(31,41,55,.18)}
.mark{display:flex;align-items:center;gap:18px;font-size:54px;line-height:1;letter-spacing:-.01em;color:#1f2937}
.mark svg{width:72px;height:72px;flex:none}
.mark b{color:${GREEN}}.mark i{font-style:normal;color:${AMBER}}
h1{margin-top:34px;font-size:40px;line-height:1.12;font-weight:700;color:#1f2937;letter-spacing:-.01em}
p{margin-top:16px;font-size:23px;line-height:1.35;color:#4b5563;font-family:system-ui,sans-serif;text-wrap:pretty}
.attr{position:absolute;right:8px;bottom:6px;font:12px system-ui,sans-serif;color:#6b7280;background:rgba(255,255,255,.75);padding:2px 6px;border-radius:4px}
</style>
<div class="tiles">${await tiles()}</div>
<canvas id="c" width="${W * 2}" height="${H * 2}" style="width:${W}px;height:${H}px"></canvas>
<div class="card">
  <div class="mark">${LOGO}<span><b>bomen</b>atlas<i>.</i>nl</span></div>
  <h1>Bomen van Nederland op de kaart</h1>
  <p>Zoek en bekijk details van ${treeCount()} straat-, park- en arboretumbomen uit open data.</p>
</div>
<div class="attr">Kaart © OpenStreetMap-bijdragers</div>
<script>
const dots = ${JSON.stringify(treeDots())}
const ctx = document.getElementById('c').getContext('2d')
ctx.scale(2, 2)
const fills = ['${GREEN}', '${GREEN_2}', '${AMBER}']
for (const tone of [1, 0, 2]) {
  ctx.fillStyle = fills[tone]
  ctx.globalAlpha = tone === 0 ? 0.85 : 0.95
  for (const [x, y, t] of dots) if (t === tone) { ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2); ctx.fill() }
}
</script>`
}

/** The logo mark centred on white, at size × 0.73 (the mark's own margins make up the rest). */
function logoPage(size) {
  return `<!doctype html><meta charset="utf-8"><style>
*{margin:0}body{width:${size}px;height:${size}px;overflow:hidden;background:#fff;display:flex;align-items:center;justify-content:center}
svg{width:${Math.round(size * 0.73)}px;height:${Math.round(size * 0.73)}px}
</style>${LOGO}`
}

function screenshot(html, width, height, out) {
  const dir = mkdtempSync(path.join(tmpdir(), 'share-image-'))
  const file = path.join(dir, 'page.html')
  writeFileSync(file, html)
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    `--user-data-dir=${path.join(dir, 'profile')}`, `--window-size=${width},${height}`,
    '--virtual-time-budget=20000', `--screenshot=${out}`, pathToFileURL(file).href,
  ], { stdio: 'inherit' })
  console.log(`wrote ${path.relative(APP, out)}`)
}

screenshot(await ogPage(), W, H, path.join(IMG, 'og-image.png'))
screenshot(logoPage(400), 400, 400, path.join(IMG, 'og-image-square.png'))
screenshot(logoPage(180), 180, 180, path.join(IMG, 'apple-touch-icon.png'))
