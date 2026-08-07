/**
 * GET /api/personnel       — 인력 목록
 * GET /api/personnel/:id   — 인력 상세
 */
import { Hono } from 'hono'
import { query, queryOne } from '../db/client.js'

const app = new Hono()

app.get('/', async (c) => {
  const search = c.req.query('search') || ''
  const grade  = c.req.query('grade')  || ''

  let sql = `
    SELECT
      p.id, p.name, p.position, p.company, p.is_fulltime,
      p.auditor_grade, p.auditor_cert_no, p.auditor_career_yrs,
      p.phone,
      COUNT(DISTINCT pc.id) AS cert_count,
      COUNT(DISTINCT ph.id) AS audit_count
    FROM personnel p
    LEFT JOIN personnel_certifications pc ON pc.personnel_id = p.id
    LEFT JOIN personnel_audit_history  ph ON ph.personnel_id = p.id
    WHERE 1=1
  `
  const params: string[] = []
  let idx = 1

  if (search) {
    sql += ` AND (p.name ILIKE $${idx} OR p.company ILIKE $${idx})`
    params.push(`%${search}%`)
    idx++
  }
  if (grade) {
    sql += ` AND p.auditor_grade = $${idx++}`
    params.push(grade)
  }

  sql += ` GROUP BY p.id ORDER BY p.name`

  const rows = await query(sql, params)
  return c.json({ ok: true, data: rows })
})

app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (isNaN(id)) return c.json({ ok: false, error: 'invalid id' }, 400)

  const person = await queryOne('SELECT * FROM personnel WHERE id = $1', [id])
  if (!person) return c.json({ ok: false, error: 'not found' }, 404)

  const [certs, auditHistory, itCareer] = await Promise.all([
    query('SELECT * FROM personnel_certifications WHERE personnel_id = $1 ORDER BY cert_year DESC', [id]),
    query('SELECT * FROM personnel_audit_history  WHERE personnel_id = $1 ORDER BY audit_yearmonth DESC', [id]),
    query('SELECT * FROM personnel_it_career      WHERE personnel_id = $1 ORDER BY period_start DESC', [id]),
  ])

  return c.json({ ok: true, data: { person, certs, auditHistory, itCareer } })
})

export default app
