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

  sql += ` GROUP BY p.id ORDER BY TRIM(p.name) COLLATE "C" ASC`

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

/**
 * GET /api/personnel/:id/audit-match?projectId=N
 * 특정 인원의 감리이력을 제안 프로젝트 키워드 기준으로 매칭/정렬하여 반환
 * 응답: { ok, person, keywords, rows }
 *   rows[]: { ...audit_history, matched_keywords: string[], mapped_keywords: string[], match_count: number }
 */
app.get('/:id/audit-match', async (c) => {
  const personnelId = Number(c.req.param('id'))
  const projectId   = Number(c.req.query('projectId') || '0')

  if (isNaN(personnelId) || personnelId <= 0)
    return c.json({ ok: false, error: 'invalid personnelId' }, 400)
  if (isNaN(projectId) || projectId <= 0)
    return c.json({ ok: false, error: 'projectId required' }, 400)

  const [person, auditHistory, kwRows, kmRows] = await Promise.all([
    queryOne('SELECT id, name, position, company, auditor_grade FROM personnel WHERE id = $1', [personnelId]),
    query<Record<string, unknown>>(
      'SELECT * FROM personnel_audit_history WHERE personnel_id = $1 ORDER BY audit_yearmonth DESC',
      [personnelId]
    ),
    // 키워드 (sort_order 순 = 우선순위 순)
    query<{ id: number; keyword: string; sort_order: number }>(
      'SELECT id, keyword, sort_order FROM keywords WHERE project_id = $1 ORDER BY sort_order ASC',
      [projectId]
    ),
    // 키워드 변환 룰
    query<{ original_keyword: string; mapped_keyword: string }>(
      'SELECT original_keyword, mapped_keyword FROM keyword_mappings WHERE project_id = $1',
      [projectId]
    ),
  ])

  if (!person) return c.json({ ok: false, error: 'person not found' }, 404)

  // 변환 맵: original → mapped
  const mappingMap = new Map<string, string>()
  for (const km of kmRows) {
    mappingMap.set(km.original_keyword, km.mapped_keyword)
  }

  // 각 감리이력에 대해 키워드 매칭
  const rawRows = auditHistory.map(h => {
    const projectNameNorm = String(h.project_name ?? '').replace(/\s+/g, '')
    const sectorNorm      = String(h.sector      ?? '').replace(/\s+/g, '')
    const domainNorm      = String(h.domain      ?? '').replace(/\s+/g, '')
    const clientOrgNorm   = String(h.client_org  ?? '').replace(/\s+/g, '')
    const combined = projectNameNorm + sectorNorm + domainNorm + clientOrgNorm

    // 매칭된 원본 키워드 목록 (sort_order 순)
    const matched: string[] = []
    for (const kw of kwRows) {
      const kwNorm = kw.keyword.replace(/\s+/g, '')
      if (combined.includes(kwNorm)) {
        matched.push(kw.keyword)
      }
    }

    // 변환된 키워드 목록
    const mapped = matched.map(kw => mappingMap.get(kw) ?? kw)

    return {
      ...h,
      matched_keywords: matched,
      mapped_keywords:  mapped,
      match_count:      matched.length,
      match_type:       'keyword' as 'keyword' | 'domain',
      top_sort_order: matched.length > 0
        ? (kwRows.find(k => k.keyword === matched[0])?.sort_order ?? 9999)
        : 9999,
    }
  })

  // project_name 기준 중복 제거 — 같은 사업명이면 첫 번째(최신) 행만 유지
  const seen = new Set<string>()
  const kwMatchedRows = rawRows.filter(r => {
    const key = String((r as Record<string, unknown>).project_name ?? '').trim()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // 정렬: 상위 키워드 sort_order 낮은 순 → 최신 연월 순 (매칭 없으면 최하위)
  kwMatchedRows.sort((a, b) => {
    const aTop = (a as Record<string, unknown>).top_sort_order as number
    const bTop = (b as Record<string, unknown>).top_sort_order as number
    if (aTop !== bTop) return aTop - bTop
    const aYm = String((a as Record<string, unknown>).audit_yearmonth ?? '')
    const bYm = String((b as Record<string, unknown>).audit_yearmonth ?? '')
    return bYm.localeCompare(aYm)
  })

  // ── 분야 매칭 보충 ──────────────────────────────────────────
  // 키워드 매칭 건수가 20건 미만이면 domain 컬럼으로 매칭해 30건까지 보충
  const kwMatchedCount = kwMatchedRows.filter(r => (r as Record<string, unknown>).match_count as number > 0).length
  let domainRows: typeof kwMatchedRows = []

  if (kwMatchedCount < 20) {
    const need = 30 - kwMatchedCount
    // kwMatchedRows에 이미 포함된 project_name 전체 (매칭 여부 무관, 중복제거된 전체 목록)
    const seenInKwRows = new Set(
      kwMatchedRows.map(r => String((r as Record<string, unknown>).project_name ?? '').trim())
    )

    // auditHistory 원본에서 kwMatchedRows에 없는 행 중 domain이 있는 것만 추출
    // (rawRows가 아닌 auditHistory를 쓰므로 seen Set 충돌 없음)
    const domainSeenNames = new Set<string>()
    const domainCandidates = auditHistory
      .filter(h => {
        const name = String(h.project_name ?? '').trim()
        if (seenInKwRows.has(name)) return false        // kwMatchedRows에 이미 있는 사업명
        if (domainSeenNames.has(name)) return false     // 분야 보충 내 중복 제거
        const domain = String(h.domain ?? '').trim()
        if (domain.length === 0) return false           // domain이 없는 행 제외
        domainSeenNames.add(name)
        return true
      })
      .sort((a, b) => {
        // 최신 연월 순 정렬
        const aYm = String(a.audit_yearmonth ?? '')
        const bYm = String(b.audit_yearmonth ?? '')
        return bYm.localeCompare(aYm)
      })
      .slice(0, need)

    domainRows = domainCandidates.map(h => ({
      ...h,
      matched_keywords: [],
      mapped_keywords:  [],
      match_count:      0,
      match_type:       'domain' as 'keyword' | 'domain',
      top_sort_order:   99999,
    }))
  }

  // 전체 rows: 키워드 매칭 + 분야 매칭 보충
  const rows = [...kwMatchedRows, ...domainRows]

  return c.json({
    ok: true,
    person,
    keywords: kwRows,
    mappingMap: Object.fromEntries(mappingMap),
    rows,
    kw_matched_count: kwMatchedCount,
    domain_rows_count: domainRows.length,
  })
})

/**
 * POST /api/personnel/fix-links
 * proposal_members.personnel_id 가 NULL인 행을 person_name 기준으로 일괄 업데이트
 */
app.post('/fix-links', async (c) => {
  // NULL인 건수 조회
  const nullRows = await query<{ id: number; person_name: string }>(
    `SELECT id, person_name FROM proposal_members WHERE personnel_id IS NULL`,
    []
  )
  let updated = 0
  let skipped = 0

  for (const row of nullRows) {
    const matched = await query<{ id: number }>(
      `SELECT id FROM personnel WHERE TRIM(name) = TRIM($1) LIMIT 1`,
      [row.person_name]
    )
    if (matched.length > 0) {
      await query(
        `UPDATE proposal_members SET personnel_id = $1 WHERE id = $2`,
        [matched[0].id, row.id]
      )
      updated++
    } else {
      skipped++
    }
  }

  return c.json({
    ok: true,
    total: nullRows.length,
    updated,
    skipped,
    message: `${updated}건 연결, ${skipped}건 미매칭(인력DB에 없음)`,
  })
})

export default app
