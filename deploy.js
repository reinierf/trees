#!/usr/bin/env node
/**
 * Collects everything the server needs into webroot/, ready to upload.
 *
 *   node deploy.js [--build] [--build-db] [--db]
 *
 *   --build     build the app first (app: npm run build)
 *   --build-db  build the national databases first (open-data-fetcher: npm run build-db); implies --db
 *   --db        copy trees.db and meta.db into webroot/api/data/
 *
 * webroot/ layout:
 *   index.html, assets/, favicon, .htaccess   app/dist/
 *   api/index.php, api/.htaccess              api/
 *   api/data/trees.db, api/data/meta.db       api/data/ (only with --db / --build-db)
 *
 * webroot/ is updated, not wiped: the app files and API code are replaced, api/data/ is only
 * touched when databases are copied. issues.db is never copied — the live API owns it.
 */
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const ROOT = __dirname
const WEBROOT = path.join(ROOT, 'webroot')
const DIST = path.join(ROOT, 'app', 'dist')
const API = path.join(ROOT, 'api')
const API_FILES = ['index.php', '.htaccess']
const DB_FILES = ['trees.db', 'meta.db']

const FLAGS = { '--build': 'build', '--build-db': 'buildDb', '--db': 'db', '-db': 'db' }
const opts = { build: false, buildDb: false, db: false }
for (const arg of process.argv.slice(2)) {
  if (!(arg in FLAGS)) {
    console.error(`Unknown argument: ${arg}\nUsage: node deploy.js [--build] [--build-db] [--db]`)
    process.exit(1)
  }
  opts[FLAGS[arg]] = true
}
if (opts.buildDb) opts.db = true

function run(cwd, script) {
  console.log(`\n> npm run ${script}  (in ${path.relative(ROOT, cwd)})`)
  const { status } = spawnSync('npm', ['run', script], { cwd, stdio: 'inherit', shell: true })
  if (status !== 0) {
    console.error(`npm run ${script} failed`)
    process.exit(status ?? 1)
  }
}

function requireFile(file, hint) {
  if (!fs.existsSync(file)) {
    console.error(`Missing ${path.relative(ROOT, file)} — ${hint}`)
    process.exit(1)
  }
}

function size(file) {
  const bytes = fs.statSync(file).size
  return bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${(bytes / 1e3).toFixed(1)} kB`
}

if (opts.buildDb) run(path.join(ROOT, 'open-data-fetcher'), 'build-db')
if (opts.build) run(path.join(ROOT, 'app'), 'build')

requireFile(path.join(DIST, 'index.html'), 'run with --build')
for (const f of API_FILES) requireFile(path.join(API, f), 'not in the repo?')
if (opts.db) for (const f of DB_FILES) requireFile(path.join(API, 'data', f), 'run with --build-db')

// App: replace everything in webroot/ except api/, so stale hashed assets don't pile up
fs.mkdirSync(WEBROOT, { recursive: true })
for (const entry of fs.readdirSync(WEBROOT)) {
  if (entry !== 'api') fs.rmSync(path.join(WEBROOT, entry), { recursive: true, force: true })
}
fs.cpSync(DIST, WEBROOT, { recursive: true })

// API code: replace everything in webroot/api/ except data/
const apiOut = path.join(WEBROOT, 'api')
fs.mkdirSync(apiOut, { recursive: true })
for (const entry of fs.readdirSync(apiOut)) {
  if (entry !== 'data') fs.rmSync(path.join(apiOut, entry), { recursive: true, force: true })
}
for (const f of API_FILES) fs.copyFileSync(path.join(API, f), path.join(apiOut, f))

// Databases: only on request; issues.db is never copied
if (opts.db) {
  const dataOut = path.join(apiOut, 'data')
  fs.mkdirSync(dataOut, { recursive: true })
  for (const f of DB_FILES) fs.copyFileSync(path.join(API, 'data', f), path.join(dataOut, f))
}

console.log(`\nwebroot/ updated:`)
console.log(`  app        ${fs.readdirSync(DIST).join(', ')}`)
console.log(`  api/       ${API_FILES.join(', ')}`)
if (opts.db) {
  const dbs = DB_FILES.map(f => `${f} (${size(path.join(API, 'data', f))})`).join(', ')
  console.log(`  api/data/  ${dbs}`)
  console.log(`\nUpload the databases under temporary names and rename them on the server.`)
} else {
  console.log(`  api/data/  not touched (pass --db to copy the databases)`)
}
console.log(`Never overwrite api/data/issues.db on the server.`)
