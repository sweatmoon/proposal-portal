import { Hono } from 'hono'
import erdHtml from './erd-html'
import { uploadHtml } from './upload-html'
import uploadPersonnelRoute from './routes/upload-personnel'
import uploadProjectRoute from './routes/upload-project'

type Bindings = { DB: D1Database }

const app = new Hono<{ Bindings: Bindings }>()

// ── 페이지 라우트 ─────────────────────────────────────────────
app.get('/', (c) => c.redirect('/upload'))
app.get('/erd',    (c) => c.html(erdHtml))
app.get('/upload', (c) => c.html(uploadHtml))

// ── API 라우트 ────────────────────────────────────────────────
app.route('/api/upload/personnel', uploadPersonnelRoute)
app.route('/api/upload/project',   uploadProjectRoute)

export default app
