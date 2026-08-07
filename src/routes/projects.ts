/**
 * GET /api/projects       — 제안작업표 목록
 * GET /api/projects/:id   — 제안작업표 상세
 */
import { Hono } from 'hono'
import { query, queryOne } from '../db/client.js'

const app = new Hono()

// ── 목록 ──────────────────────────────────────────────────────
app.get('/', async (c) => {
  const status = c.req.query('status') || ''
  const search = c.req.query('search') || ''

  let sql = `
    SELECT
      p.id, p.project_name, p.client_org, p.bid_notice_no,
      p.bid_deadline, p.bid_amount, p.bid_rate,
      p.required_md, p.proposed_md,
      p.proposal_status, p.eval_method,
      p.writer, p.director,
      p.registered_yearmonth,
      p.eval_dt,
      COUNT(DISTINCT pm.id) AS member_count,
      COUNT(DISTINCT ph.id) AS phase_count
    FROM audit_projects p
    LEFT JOIN proposal_members pm ON pm.project_id = p.id
    LEFT JOIN audit_phases ph     ON ph.project_id = p.id
    WHERE 1=1
  `
  const params: string[] = []
  let idx = 1

  if (status) {
    sql += ` AND p.proposal_status = $${idx++}`
    params.push(status)
  }
  if (search) {
    sql += ` AND (p.project_name ILIKE $${idx} OR p.client_org ILIKE $${idx})`
    params.push(`%${search}%`)
    idx++
  }

  sql += ` GROUP BY p.id ORDER BY p.bid_deadline DESC NULLS LAST, p.id DESC`

  const rows = await query(sql, params)
  return c.json({ ok: true, data: rows })
})

// ── 상태 통계 ─────────────────────────────────────────────────
app.get('/stats', async (c) => {
  const rows = await query<{ proposal_status: string; cnt: string }>(`
    SELECT proposal_status, COUNT(*) AS cnt
    FROM audit_projects
    GROUP BY proposal_status
    ORDER BY cnt DESC
  `)
  const total = await queryOne<{ cnt: string }>('SELECT COUNT(*) AS cnt FROM audit_projects')
  return c.json({ ok: true, total: Number(total?.cnt ?? 0), byStatus: rows })
})

// ── 상세 ──────────────────────────────────────────────────────
app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (isNaN(id)) return c.json({ ok: false, error: 'invalid id' }, 400)

  const project = await queryOne<Record<string, unknown>>(
    'SELECT * FROM audit_projects WHERE id = $1', [id]
  )
  if (!project) return c.json({ ok: false, error: 'not found' }, 404)

  const [phases, members, keywords, files, toc] = await Promise.all([
    query(`
      SELECT ph.*,
        COALESCE(json_agg(pa ORDER BY pa.id) FILTER (WHERE pa.id IS NOT NULL), '[]') AS assignments
      FROM audit_phases ph
      LEFT JOIN audit_phase_assignments pa ON pa.phase_id = ph.id
      WHERE ph.project_id = $1
      GROUP BY ph.id
      ORDER BY ph.phase_order, ph.id
    `, [id]),
    query(`SELECT * FROM proposal_members WHERE project_id = $1 ORDER BY id`, [id]),
    query(`SELECT * FROM keywords WHERE project_id = $1 ORDER BY sort_order, id`, [id]),
    query(`SELECT * FROM proposal_files WHERE project_id = $1 ORDER BY id`, [id]),
    query(`SELECT * FROM proposal_attachments_toc WHERE project_id = $1 ORDER BY item_order`, [id]),
  ])

  return c.json({ ok: true, data: { project, phases, members, keywords, files, toc } })
})

export default app
