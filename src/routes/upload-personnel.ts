/**
 * 인력 HTML 업로드 → 파싱 → D1 DB 저장 API
 * POST /api/upload/personnel
 *
 * 중복 처리: personnel.name 동일 시 UPSERT (덮어쓰기)
 *   - personnel 업데이트 후 하위 테이블 삭제 후 재삽입
 */

import { Hono } from 'hono'
import { parsePersonnelHtml } from '../parsers/personnel-parser'

type Bindings = { DB: D1Database }
const app = new Hono<{ Bindings: Bindings }>()

app.post('/', async (c) => {
  const db = c.env.DB

  // ── multipart/form-data 파일 수신 ──
  let html: string
  try {
    const formData = await c.req.formData()
    const file = formData.get('file') as File | null
    if (!file) return c.json({ ok: false, error: 'file 필드가 없습니다' }, 400)
    if (!file.name.toLowerCase().endsWith('.html')) {
      return c.json({ ok: false, error: 'HTML 파일만 업로드 가능합니다' }, 400)
    }
    html = await file.text()
  } catch (e) {
    return c.json({ ok: false, error: `파일 읽기 실패: ${String(e)}` }, 400)
  }

  // ── 파싱 ──
  let parsed
  try {
    parsed = parsePersonnelHtml(html)
  } catch (e) {
    return c.json({ ok: false, error: `파싱 실패: ${String(e)}` }, 422)
  }

  const { personnel, certifications, audit_history, it_career } = parsed

  if (!personnel.name) {
    return c.json({ ok: false, error: '성명을 파싱할 수 없습니다. 인력 프로파일 HTML인지 확인하세요' }, 422)
  }

  // ── DB 저장 (트랜잭션) ──
  try {
    // 1. personnel UPSERT (name 중복 시 덮어쓰기)
    const upsertPersonnel = db.prepare(`
      INSERT INTO personnel (
        name, position, is_fulltime, company,
        email, phone, birthdate,
        auditor_cert_no, auditor_grade, tech_grade,
        school, major, degree,
        career_summary, career_qualif, career_project, career_expert,
        education_name, education_hours, education_org,
        updated_at
      ) VALUES (?,?,?,?, ?,?,?, ?,?,?, ?,?,?, ?,?,?,?, ?,?,?, datetime('now','localtime'))
      ON CONFLICT(name) DO UPDATE SET
        position        = excluded.position,
        is_fulltime     = excluded.is_fulltime,
        company         = excluded.company,
        email           = excluded.email,
        phone           = excluded.phone,
        birthdate       = excluded.birthdate,
        auditor_cert_no = excluded.auditor_cert_no,
        auditor_grade   = excluded.auditor_grade,
        tech_grade      = excluded.tech_grade,
        school          = excluded.school,
        major           = excluded.major,
        degree          = excluded.degree,
        career_summary  = excluded.career_summary,
        career_qualif   = excluded.career_qualif,
        career_project  = excluded.career_project,
        career_expert   = excluded.career_expert,
        education_name  = excluded.education_name,
        education_hours = excluded.education_hours,
        education_org   = excluded.education_org,
        updated_at      = datetime('now','localtime')
    `).bind(
      personnel.name, personnel.position, personnel.is_fulltime, personnel.company,
      personnel.email, personnel.phone, personnel.birthdate,
      personnel.auditor_cert_no, personnel.auditor_grade, personnel.tech_grade,
      personnel.school, personnel.major, personnel.degree,
      personnel.career_summary, personnel.career_qualif, personnel.career_project, personnel.career_expert,
      personnel.education_name, personnel.education_hours, personnel.education_org,
    )

    await upsertPersonnel.run()

    // ID 조회
    const row = await db.prepare(`SELECT id FROM personnel WHERE name = ?`).bind(personnel.name).first<{ id: number }>()
    if (!row) throw new Error('personnel ID 조회 실패')
    const pid = row.id

    // 2. 하위 테이블 삭제 후 재삽입
    await db.prepare(`DELETE FROM personnel_certifications WHERE personnel_id = ?`).bind(pid).run()
    await db.prepare(`DELETE FROM personnel_audit_history WHERE personnel_id = ?`).bind(pid).run()
    await db.prepare(`DELETE FROM personnel_it_career WHERE personnel_id = ?`).bind(pid).run()

    // 3. 자격증 삽입
    for (const cert of certifications) {
      await db.prepare(`
        INSERT INTO personnel_certifications (personnel_id, cert_name, cert_year, issuer, is_national, related_field)
        VALUES (?,?,?,?,?,?)
      `).bind(pid, cert.cert_name, cert.cert_year, cert.issuer, cert.is_national, cert.related_field).run()
    }

    // 4. 감리실적 삽입 (배치: 50건씩)
    const BATCH = 50
    for (let i = 0; i < audit_history.length; i += BATCH) {
      const stmts = audit_history.slice(i, i + BATCH).map(h =>
        db.prepare(`
          INSERT INTO personnel_audit_history
            (personnel_id, audit_yearmonth, project_name, client_org, sector, domain, role, phase, participation_rate)
          VALUES (?,?,?,?,?,?,?,?,?)
        `).bind(pid, h.audit_yearmonth, h.project_name, h.client_org, h.sector, h.domain, h.role, h.phase, h.participation_rate)
      )
      await db.batch(stmts)
    }

    // 5. IT 경력 삽입
    for (const c2 of it_career) {
      await db.prepare(`
        INSERT INTO personnel_it_career
          (personnel_id, period_start, period_end, project_name, client_org, domain, role, company, remarks)
        VALUES (?,?,?,?,?,?,?,?,?)
      `).bind(pid, c2.period_start, c2.period_end, c2.project_name, c2.client_org, c2.domain, c2.role, c2.company, c2.remarks).run()
    }

    return c.json({
      ok: true,
      message: `인력 "${personnel.name}" 저장 완료`,
      data: {
        personnel_id:      pid,
        name:              personnel.name,
        certifications:    certifications.length,
        audit_history:     audit_history.length,
        it_career:         it_career.length,
      },
    })
  } catch (e) {
    return c.json({ ok: false, error: `DB 저장 실패: ${String(e)}` }, 500)
  }
})

export default app
