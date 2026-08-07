/**
 * Entry point — Hono + @hono/node-server (Railway / Node.js)
 */
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import uploadPersonnelRoute from './routes/upload-personnel.js'
import uploadProjectRoute from './routes/upload-project.js'
import pagesRoute from './routes/pages.js'
import projectsApiRoute from './routes/projects.js'
import personnelApiRoute from './routes/personnel-list.js'

const app = new Hono()

// ── 미들웨어 ──────────────────────────────────────────────────
app.use('*', logger())
app.use('/api/*', cors())

// ── 헬스체크 (Railway health probe) ──────────────────────────
app.get('/health', (c) => c.json({ ok: true, ts: new Date().toISOString() }))

// ── API 라우트 ────────────────────────────────────────────────
app.route('/api/upload/personnel', uploadPersonnelRoute)
app.route('/api/upload/project',   uploadProjectRoute)
app.route('/api/projects',         projectsApiRoute)
app.route('/api/personnel',        personnelApiRoute)

// ── 페이지 라우트 (홈, /proposals, /personnel, /upload) ───────
app.route('/', pagesRoute)

// ── 서버 시작 ─────────────────────────────────────────────────
const port = parseInt(process.env.PORT ?? '3000', 10)
console.log(`🚀 서버 시작: http://localhost:${port}`)

serve({ fetch: app.fetch, port })

export default app
