/**
 * Entry point — Hono + @hono/node-server (Railway / Node.js)
 */
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { uploadHtml } from './upload-html.js'
import uploadPersonnelRoute from './routes/upload-personnel.js'
import uploadProjectRoute from './routes/upload-project.js'

const app = new Hono()

// ── 미들웨어 ──────────────────────────────────────────────────
app.use('*', logger())
app.use('/api/*', cors())

// ── 페이지 라우트 ─────────────────────────────────────────────
app.get('/',       (c) => c.redirect('/upload'))
app.get('/upload', (c) => c.html(uploadHtml))

// ── 헬스체크 (Railway health probe) ──────────────────────────
app.get('/health', (c) => c.json({ ok: true, ts: new Date().toISOString() }))

// ── API 라우트 ────────────────────────────────────────────────
app.route('/api/upload/personnel', uploadPersonnelRoute)
app.route('/api/upload/project',   uploadProjectRoute)

// ── 서버 시작 ─────────────────────────────────────────────────
const port = parseInt(process.env.PORT ?? '3000', 10)
console.log(`🚀 서버 시작: http://localhost:${port}`)

serve({ fetch: app.fetch, port })

export default app
