/**
 * Entry point — Hono + @hono/node-server (Railway / Node.js)
 */
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import uploadPersonnelRoute from './routes/upload-personnel.js'
import uploadProjectRoute from './routes/upload-project.js'
import pagesRoute from './routes/pages.js'
import projectsApiRoute from './routes/projects.js'
import personnelApiRoute from './routes/personnel-list.js'
import pptMenuApiRoute from './routes/ppt-menu.js'

const app = new Hono()

// ── 미들웨어 ──────────────────────────────────────────────────
app.use('*', logger())
app.use('/api/*', cors())

// ── 정적 파일 서빙 (dist/static/) ────────────────────────────
app.use('/static/*', serveStatic({ root: './dist' }))

// ── 헬스체크 (Railway health probe) ──────────────────────────
app.get('/health', (c) => c.json({ ok: true, ts: new Date().toISOString() }))

// ── API 라우트 ────────────────────────────────────────────────
app.route('/api/upload/personnel', uploadPersonnelRoute)
app.route('/api/upload/project',   uploadProjectRoute)
app.route('/api/projects',         projectsApiRoute)
app.route('/api/personnel',        personnelApiRoute)
app.route('/api/ppt-menus',        pptMenuApiRoute)
app.route('/api/ppt-compositions', pptMenuApiRoute)   // compositions 서브라우트 별칭

// ── 페이지 라우트 (홈, /proposals, /personnel, /upload) ───────
app.route('/', pagesRoute)

// ── 전역 에러 핸들러 (디버그용 — 실제 에러 메시지 노출) ──────
app.onError((err, c) => {
  console.error('[onError]', err)
  return c.html(`
    <html><body style="background:#111;color:#f87171;font-family:monospace;padding:2rem">
      <h2 style="color:#fb923c">Internal Server Error</h2>
      <pre style="white-space:pre-wrap;font-size:13px">${err.stack ?? err.message}</pre>
    </body></html>
  `, 500)
})

// ── 서버 시작 ─────────────────────────────────────────────────
const port = parseInt(process.env.PORT ?? '3000', 10)
console.log(`🚀 서버 시작: http://localhost:${port}`)

serve({ fetch: app.fetch, port })

export default app
