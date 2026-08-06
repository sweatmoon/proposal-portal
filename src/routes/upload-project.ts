/**
 * 사업 제안작업표 HTML 업로드 → 파싱 → D1 DB 저장 API
 * POST /api/upload/project
 *
 * 중복 처리: audit_projects.project_name 동일 시 UPSERT (덮어쓰기)
 *   - project 업데이트 후 하위 테이블 삭제 후 재삽입
 */

import { Hono } from 'hono'
import { parseProjectHtml } from '../parsers/project-parser'

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
    parsed = parseProjectHtml(html)
  } catch (e) {
    return c.json({ ok: false, error: `파싱 실패: ${String(e)}` }, 422)
  }

  const {
    project, keywords, keyword_mappings,
    phases, phase_assignments, proposal_members,
    proposal_files, attachments_toc,
  } = parsed

  if (!project.project_name) {
    return c.json({ ok: false, error: '사업명을 파싱할 수 없습니다. 제안작업표 HTML인지 확인하세요' }, 422)
  }

  // ── DB 저장 ──
  try {
    // 1. audit_projects UPSERT
    await db.prepare(`
      INSERT INTO audit_projects (
        project_name, bid_notice_no, client_org, registered_yearmonth,
        target_project_name, target_client_org,
        target_period_start, target_period_end,
        bid_amount, bid_amount_excl_vat, bid_rate, base_budget,
        bid_deadline, bid_open_dt, eval_dt,
        required_md, proposed_md, optimal_md,
        md_unit_price_incl, md_unit_price_excl, base_unit_price,
        proposal_allowance, proposal_allowance_rate,
        required_phases, required_audit_days,
        eval_method, proposal_status,
        writer, director, supporters, references_cc,
        special_notes, remarks, proposal_template,
        updated_at
      ) VALUES (
        ?,?,?,?, ?,?, ?,?, ?,?,?,?, ?,?,?, ?,?,?, ?,?,?, ?,?, ?,?, ?,?, ?,?,?,?, ?,?,?,
        datetime('now','localtime')
      )
      ON CONFLICT(project_name) DO UPDATE SET
        bid_notice_no        = excluded.bid_notice_no,
        client_org           = excluded.client_org,
        registered_yearmonth = excluded.registered_yearmonth,
        target_project_name  = excluded.target_project_name,
        target_client_org    = excluded.target_client_org,
        target_period_start  = excluded.target_period_start,
        target_period_end    = excluded.target_period_end,
        bid_amount           = excluded.bid_amount,
        bid_amount_excl_vat  = excluded.bid_amount_excl_vat,
        bid_rate             = excluded.bid_rate,
        base_budget          = excluded.base_budget,
        bid_deadline         = excluded.bid_deadline,
        bid_open_dt          = excluded.bid_open_dt,
        eval_dt              = excluded.eval_dt,
        required_md          = excluded.required_md,
        proposed_md          = excluded.proposed_md,
        optimal_md           = excluded.optimal_md,
        md_unit_price_incl   = excluded.md_unit_price_incl,
        md_unit_price_excl   = excluded.md_unit_price_excl,
        base_unit_price      = excluded.base_unit_price,
        proposal_allowance   = excluded.proposal_allowance,
        proposal_allowance_rate = excluded.proposal_allowance_rate,
        required_phases      = excluded.required_phases,
        required_audit_days  = excluded.required_audit_days,
        eval_method          = excluded.eval_method,
        proposal_status      = excluded.proposal_status,
        writer               = excluded.writer,
        director             = excluded.director,
        supporters           = excluded.supporters,
        references_cc        = excluded.references_cc,
        special_notes        = excluded.special_notes,
        remarks              = excluded.remarks,
        proposal_template    = excluded.proposal_template,
        updated_at           = datetime('now','localtime')
    `).bind(
      project.project_name, project.bid_notice_no, project.client_org, project.registered_yearmonth,
      project.target_project_name, project.target_client_org,
      project.target_period_start, project.target_period_end,
      project.bid_amount, project.bid_amount_excl_vat, project.bid_rate, project.base_budget,
      project.bid_deadline, project.bid_open_dt, project.eval_dt,
      project.required_md, project.proposed_md, project.optimal_md,
      project.md_unit_price_incl, project.md_unit_price_excl, project.base_unit_price,
      project.proposal_allowance, project.proposal_allowance_rate,
      project.required_phases, project.required_audit_days,
      project.eval_method, project.proposal_status,
      project.writer, project.director, project.supporters, project.references_cc,
      project.special_notes, project.remarks, project.proposal_template,
    ).run()

    // ID 조회
    const projRow = await db.prepare(`SELECT id FROM audit_projects WHERE project_name = ?`)
      .bind(project.project_name).first<{ id: number }>()
    if (!projRow) throw new Error('project ID 조회 실패')
    const projectId = projRow.id

    // 2. 하위 테이블 전체 삭제
    await db.batch([
      db.prepare(`DELETE FROM keywords WHERE project_id = ?`).bind(projectId),
      db.prepare(`DELETE FROM keyword_mappings WHERE project_id = ?`).bind(projectId),
      db.prepare(`DELETE FROM audit_phases WHERE project_id = ?`).bind(projectId),
      db.prepare(`DELETE FROM proposal_members WHERE project_id = ?`).bind(projectId),
      db.prepare(`DELETE FROM proposal_files WHERE project_id = ?`).bind(projectId),
      db.prepare(`DELETE FROM proposal_attachments_toc WHERE project_id = ?`).bind(projectId),
    ])

    // phase 삭제 후 phase_assignments는 CASCADE로 자동 삭제됨

    // 3. keywords 삽입
    if (keywords.length > 0) {
      const kwStmts = keywords.map(kw =>
        db.prepare(`INSERT INTO keywords (project_id, keyword, sort_order) VALUES (?,?,?)`)
          .bind(projectId, kw.keyword, kw.sort_order)
      )
      await db.batch(kwStmts)
    }

    // 4. keyword_mappings 삽입 (keyword_id 연결)
    for (const km of keyword_mappings) {
      // original_keyword로 keyword 찾기 (없으면 keyword_id=NULL로 저장)
      const kwRow = await db.prepare(`SELECT id FROM keywords WHERE project_id = ? AND keyword = ?`)
        .bind(projectId, km.original_keyword).first<{ id: number }>()

      await db.prepare(`
        INSERT INTO keyword_mappings (project_id, keyword_id, original_keyword, mapped_keyword)
        VALUES (?, ?, ?, ?)
      `).bind(
        projectId,
        kwRow?.id ?? null,
        km.original_keyword,
        km.mapped_keyword,
      ).run()
    }

    // 5. audit_phases 삽입 & phase_assignments 삽입
    const phaseIdMap: Record<string, number> = {}
    for (const phase of phases) {
      const res = await db.prepare(`
        INSERT INTO audit_phases
          (project_id, phase_name, phase_days, phase_start_date, phase_end_date, phase_order,
           total_auditor_cnt, pre_survey_md, audit_md, action_confirm_md, proposed_md)
        VALUES (?,?,?,?,?,?, ?,?,?,?,?)
      `).bind(
        projectId, phase.phase_name, phase.phase_days,
        phase.phase_start_date, phase.phase_end_date, phase.phase_order,
        phase.total_auditor_cnt, phase.pre_survey_md, phase.audit_md,
        phase.action_confirm_md, phase.proposed_md,
      ).run()
      phaseIdMap[phase.phase_name] = res.meta.last_row_id as number
    }

    // phase_assignments 삽입
    const assignStmts = phase_assignments
      .filter(a => phaseIdMap[a.phase_name])
      .map(a => {
        const phaseId = phaseIdMap[a.phase_name]
        return db.prepare(`
          INSERT INTO audit_phase_assignments
            (phase_id, project_id, person_name, member_type, pre_survey_md, audit_md, action_confirm_md)
          VALUES (?,?,?,?,?,?,?)
        `).bind(phaseId, projectId, a.person_name, a.member_type, a.pre_survey_md, a.audit_md, a.action_confirm_md)
      })
    if (assignStmts.length > 0) await db.batch(assignStmts)

    // 6. proposal_members 삽입
    if (proposal_members.length > 0) {
      const BATCH = 30
      for (let i = 0; i < proposal_members.length; i += BATCH) {
        const stmts = proposal_members.slice(i, i + BATCH).map(m =>
          db.prepare(`
            INSERT INTO proposal_members
              (project_id, person_name, member_group, member_type, domain,
               regular_md, additional_md, acceptance_md,
               is_fulltime, auditor_grade, auditor_cert_no, phone, education_hours)
            VALUES (?,?,?,?,?, ?,?,?, ?,?,?,?,?)
          `).bind(
            projectId, m.person_name, m.member_group, m.member_type, m.domain,
            m.regular_md, m.additional_md, m.acceptance_md,
            m.is_fulltime, m.auditor_grade, m.auditor_cert_no, m.phone, m.education_hours,
          )
        )
        await db.batch(stmts)
      }
    }

    // 7. proposal_files 삽입
    if (proposal_files.length > 0) {
      const fileStmts = proposal_files.map(f =>
        db.prepare(`
          INSERT INTO proposal_files (project_id, file_category, file_name, file_size_kb, uploaded_at, file_type)
          VALUES (?,?,?,?,?,?)
        `).bind(projectId, f.file_category, f.file_name, f.file_size_kb, f.uploaded_at, f.file_type)
      )
      await db.batch(fileStmts)
    }

    // 8. attachments_toc 삽입
    if (attachments_toc.length > 0) {
      const tocStmts = attachments_toc.map(t =>
        db.prepare(`
          INSERT INTO proposal_attachments_toc (project_id, item_order, item_name)
          VALUES (?,?,?)
        `).bind(projectId, t.item_order, t.item_name)
      )
      await db.batch(tocStmts)
    }

    return c.json({
      ok: true,
      message: `사업 "${project.project_name}" 저장 완료`,
      data: {
        project_id:         projectId,
        project_name:       project.project_name,
        keywords:           keywords.length,
        keyword_mappings:   keyword_mappings.length,
        phases:             phases.length,
        phase_assignments:  phase_assignments.length,
        proposal_members:   proposal_members.length,
        proposal_files:     proposal_files.length,
        attachments_toc:    attachments_toc.length,
      },
    })
  } catch (e) {
    return c.json({ ok: false, error: `DB 저장 실패: ${String(e)}` }, 500)
  }
})

export default app
