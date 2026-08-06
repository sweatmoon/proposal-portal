/**
 * 사업 제안작업표 HTML 파서
 * 파일: [사업명] 사업 감리 용역.html
 *
 * 파싱 대상 테이블 (HTML 내 순서 기준):
 *   #4  → audit_projects (사업 기본정보)
 *   #5  → proposal_files (제안 관련 파일)
 *   #6  → keywords + keyword_mappings (대상 사업 키워드)
 *   #7  → audit_phases + audit_phase_assignments (감리 일정)
 *   #8  → proposal_members (제안 인력)
 *   #9  → proposal_attachments_toc + proposal_template (제안서 생성)
 */

import { parseHtmlTables, extractNumber, normalizeDate } from './html-table-parser'

// ─── 반환 타입 ────────────────────────────────────────────────
export interface AuditProjectData {
  project_name: string
  bid_notice_no: string
  client_org: string
  registered_yearmonth: string
  target_project_name: string
  target_client_org: string
  target_period_start: string
  target_period_end: string
  bid_amount: number | null
  bid_amount_excl_vat: number | null
  bid_rate: number | null
  base_budget: number | null
  bid_deadline: string
  bid_open_dt: string
  eval_dt: string
  required_md: number | null
  proposed_md: number | null
  optimal_md: number | null
  md_unit_price_incl: number | null
  md_unit_price_excl: number | null
  base_unit_price: number | null
  proposal_allowance: number | null
  proposal_allowance_rate: number | null
  required_phases: number | null
  required_audit_days: number | null
  eval_method: string
  proposal_status: string
  writer: string
  director: string
  supporters: string
  references_cc: string
  special_notes: string
  remarks: string
  proposal_template: string
}

export interface KeywordData {
  keyword: string
  sort_order: number
}

export interface KeywordMappingData {
  original_keyword: string
  mapped_keyword: string
}

export interface AuditPhaseData {
  phase_name: string
  phase_days: number
  phase_start_date: string
  phase_end_date: string
  phase_order: number
  total_auditor_cnt: number
  pre_survey_md: number
  audit_md: number
  action_confirm_md: number
  proposed_md: number
}

export interface PhaseAssignmentData {
  phase_name: string   // 단계 매칭용
  person_name: string
  member_type: string
  pre_survey_md: number
  audit_md: number
  action_confirm_md: number
}

export interface ProposalMemberData {
  person_name: string
  member_group: string
  member_type: string
  domain: string
  regular_md: number
  additional_md: number
  acceptance_md: number
  is_fulltime: number
  auditor_grade: string
  auditor_cert_no: string
  phone: string
  education_hours: number
}

export interface ProposalFileData {
  file_category: string
  file_name: string
  file_size_kb: number | null
  uploaded_at: string
  file_type: string
}

export interface AttachmentTocData {
  item_order: number
  item_name: string
}

export interface ParsedProject {
  project: AuditProjectData
  keywords: KeywordData[]
  keyword_mappings: KeywordMappingData[]
  phases: AuditPhaseData[]
  phase_assignments: PhaseAssignmentData[]
  proposal_members: ProposalMemberData[]
  proposal_files: ProposalFileData[]
  attachments_toc: AttachmentTocData[]
}

// ─── 헬퍼 ────────────────────────────────────────────────────

/** "YYYY.MM.DD (요일)" → "YYYY-MM-DD" */
function parseJpDate(raw: string): string {
  const m = raw.match(/(\d{4})[.\/](\d{1,2})[.\/](\d{1,2})/)
  if (!m) return raw
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
}

/** "2026/08/04 10:00:00" → 그대로 반환, "YYYY.MM.DD" → 정규화 */
function parseDatetime(raw: string): string {
  const m1 = raw.match(/(\d{4})[\/](\d{2})[\/](\d{2})\s+(\d{2}:\d{2}:\d{2})/)
  if (m1) return `${m1[1]}-${m1[2]}-${m1[3]} ${m1[4]}`
  return parseJpDate(raw)
}

// ─── 메인 파서 ───────────────────────────────────────────────
export function parseProjectHtml(html: string): ParsedProject {
  const tables = parseHtmlTables(html)

  // ── 1. audit_projects (테이블 #4, index 3) ──
  const t4 = tables[3]?.rows ?? []
  const proj: AuditProjectData = {
    project_name: '', bid_notice_no: '', client_org: '', registered_yearmonth: '',
    target_project_name: '', target_client_org: '',
    target_period_start: '', target_period_end: '',
    bid_amount: null, bid_amount_excl_vat: null, bid_rate: null, base_budget: null,
    bid_deadline: '', bid_open_dt: '', eval_dt: '',
    required_md: null, proposed_md: null, optimal_md: null,
    md_unit_price_incl: null, md_unit_price_excl: null,
    base_unit_price: null, proposal_allowance: null, proposal_allowance_rate: null,
    required_phases: null, required_audit_days: null,
    eval_method: '', proposal_status: '',
    writer: '', director: '', supporters: '', references_cc: '',
    special_notes: '', remarks: '', proposal_template: '',
  }

  for (const row of t4) {
    const c = row.map(s => s.trim())

    // 사업명
    if (c[0] === '사업명' && c[1]) {
      // "사업명 - 발주처 등록년월" 분리
      const raw = c[1]
      // "- 대구보건대학산학협력단 등록년월" 제거
      proj.project_name = raw.split(' - ')[0].trim()
      const mYM = raw.match(/(\d{4})[.\/](\d{1,2})/)
      if (mYM) proj.registered_yearmonth = `${mYM[1]}.${mYM[2].padStart(2, '0')}`
      // 발주처 추출: "사업명 - 발주처" 구조
      const parts = raw.split(' - ')
      if (parts.length >= 2) proj.client_org = parts[1].replace(/등록년월.*/, '').trim()
    }

    if (c[0] === '입찰공고번호' && c[1]) {
      proj.bid_notice_no = c[1].replace(/\[.*?\]/g, '').trim()
    }
    if ((c[0] === '입찰 마감 일시' || c[2] === '입찰 마감 일시') && (c[1] || c[3])) {
      proj.bid_deadline = parseDatetime(c[2] === '입찰 마감 일시' ? c[3] : c[1])
    }
    if (c[2] === '입찰 마감 일시') proj.bid_deadline = parseDatetime(c[3])
    if (c[0] === '입찰 개시 일시' || c[2] === '입찰 개시 일시') {
      proj.bid_open_dt = parseDatetime(c[0] === '입찰 개시 일시' ? c[1] : c[3])
    }
    if (c[0] === '평가 일시' && c[1]) proj.eval_dt = parseDatetime(c[1])

    // 사업 금액
    if (c[0] === '사업 금액' && c[1]) {
      proj.base_budget = extractNumber(c[1])
    }
    if (c[0] === '배정 예산' || c[2] === '배정 예산') {
      const v = c[0] === '배정 예산' ? c[1] : c[3]
      proj.base_budget = extractNumber(v)
    }

    // 입찰 금액: "(투찰률: 80.00%) 160,000,000원 (VAT 제외시 145,454,545원)"
    if (c[0] === '입찰 금액' && c[1]) {
      const rateM = c[1].match(/투찰률?[:：]\s*([\d.]+)/)
      if (rateM) proj.bid_rate = parseFloat(rateM[1])
      const amtM = c[1].match(/([\d,]+)원/)
      if (amtM) proj.bid_amount = extractNumber(amtM[0])
      const exclM = c[1].match(/VAT\s*제외시?\s*([\d,]+)/)
      if (exclM) proj.bid_amount_excl_vat = extractNumber(exclM[1])
    }

    // 제안 투입 공수: "278 MD ..."
    if (c[0].includes('제안 투입 공수') && c[1]) {
      proj.proposed_md = extractNumber(c[1])
    }
    if (c[0].includes('요구 투입 공수') && c[1]) {
      proj.required_md = extractNumber(c[1])
    }
    // 적정 공수 찾기 (여러 셀에 퍼져 있음)
    for (const cell of c) {
      const mOpt = cell.match(/적정\s*공수[:：]?\s*(\d+)\s*MD/)
      if (mOpt) proj.optimal_md = parseInt(mOpt[1])
    }

    // 1MD 단가
    if (c[0].includes('1MD 단가') && c[1]) {
      if (c[1].includes('VAT 제외')) proj.md_unit_price_excl = extractNumber(c[1])
      else if (c[1].includes('VAT 포함')) proj.md_unit_price_incl = extractNumber(c[1])
    }
    if (c[2] && c[2].includes('1MD 단가') && c[3]) {
      if (c[3].includes('VAT 포함')) proj.md_unit_price_incl = extractNumber(c[3])
    }

    // 기준 단가
    for (const cell of c) {
      const mBase = cell.match(/기준\s*단가\s*([\d,]+)/)
      if (mBase) proj.base_unit_price = extractNumber(mBase[1])
    }

    // 제안 수당
    if (c[0].includes('제안 수당') && c[1]) {
      const rateM = c[1].match(/([\d.]+)%/)
      if (rateM) proj.proposal_allowance_rate = parseFloat(rateM[1])
      const amtM = c[1].match(/([\d,]+)/)
      if (amtM) proj.proposal_allowance = extractNumber(amtM[0])
    }

    // 요구 단계 / 감리 일정
    if (c[0] === '요구 단계' && c[1]) proj.required_phases = extractNumber(c[1])
    if (c[0] === '요구 감리 일수' && c[1]) proj.required_audit_days = extractNumber(c[1])

    // 평가 방식 / 제안 상태
    if (c[0] === '제안 평가 방식' && c[1]) proj.eval_method = c[1]
    if (c[2] === '제안 작업 상태') proj.proposal_status = c[3] ?? ''
    if (c[0] === '제안 작업 상태' && c[1]) proj.proposal_status = c[1]

    // 제안 관련자: "작성자: A 총괄: B 지원: C 참조: D"
    if (c[0] === '제안 관련자' && c[1]) {
      const raw = c[1]
      const writerM  = raw.match(/작성자[:：]\s*(\S+)/)
      const dirM     = raw.match(/총괄[:：]\s*(\S+)/)
      const suppM    = raw.match(/지원[:：]\s*([^\s총괄제안]+)/)
      const refM     = raw.match(/참조[:：]\s*(.+)/)
      if (writerM) proj.writer     = writerM[1]
      if (dirM)    proj.director   = dirM[1]
      if (suppM)   proj.supporters = suppM[1].trim()
      if (refM)    proj.references_cc = refM[1].trim()
    }

    if (c[0] === '특이 사항' && c[1]) proj.special_notes = c[1]
    if (c[0] === '비고' && c[1])      proj.remarks        = c[1]
  }

  // ── 2. proposal_files (테이블 #5, index 4) ──
  const t5 = tables[4]?.rows ?? []
  const proposal_files: ProposalFileData[] = []

  // 파일 구분 카테고리 매핑용
  const fileCatMap: Record<string, string> = {}
  for (const row of t5) {
    if (row[0]?.includes('파일 구분')) {
      // "11. 감리 사업 공고서 12. ..." 형식 파싱
      const catRaw = row[0]
      const catMatches = catRaw.matchAll(/(\d+)\.\s+([^\d]+?)(?=\s+\d+\.|$)/g)
      for (const m of catMatches) {
        fileCatMap[m[1]] = m[2].trim()
      }
    }
  }

  for (let i = 1; i < t5.length; i++) {
    const row = t5[i]
    if (!row[0] || !row[1]) continue
    const fileType = row[0].trim()
    const rawCell  = row[1]

    // "[2026.07.29(수) 12:23] 파일명.hwp (158 KB)" 반복 패턴
    const fileRe = /\[(\d{4}\.\d{2}\.\d{2})\([^)]+\)\s*(\d{2}:\d{2})\]\s*([^\[]+?)(?=\s*\[|\s*$)/g
    let fm: RegExpExecArray | null
    while ((fm = fileRe.exec(rawCell)) !== null) {
      const date   = fm[1]
      const time   = fm[2]
      const fPart  = fm[3].trim()

      // "파일명.ext (size KB)" 분리
      const sizeM   = fPart.match(/\(([\d.]+)\s*KB\)/)
      const fileSize = sizeM ? parseFloat(sizeM[1]) : null
      const fileName = fPart.replace(/\s*\([\d.]+\s*(?:KB|MB)\).*/, '').trim()

      // 카테고리 번호 추출 (ex: "11." → "11")
      const catNumM = fileName.match(/^(\d+)\./)
      const category = catNumM ? (fileCatMap[catNumM[1]] ?? catNumM[1]) : ''

      proposal_files.push({
        file_category: category,
        file_name:     fileName,
        file_size_kb:  fileSize,
        uploaded_at:   `${date} ${time}`,
        file_type:     fileType,
      })
    }

    // 파일이 없으면 셀 전체를 단일 파일로
    if (!rawCell.includes('[') && rawCell.length > 0) {
      proposal_files.push({
        file_category: '',
        file_name:     rawCell.trim(),
        file_size_kb:  null,
        uploaded_at:   '',
        file_type:     fileType,
      })
    }
  }

  // ── 3. keywords + keyword_mappings (테이블 #6, index 5) ──
  const t6 = tables[5]?.rows ?? []
  const keywords: KeywordData[] = []
  const keyword_mappings: KeywordMappingData[] = []

  for (const row of t6) {
    const label = (row[0] ?? '').trim()
    const val   = (row[1] ?? '').trim()

    if (label.includes('주요 키워드') || (label.includes('키워드') && !label.includes('변환'))) {
      // 쉼표 분리, 노이즈 제거 (네비게이션 텍스트 같은 것)
      const rawKws = val.split(',').map(s => s.trim()).filter(Boolean)
      let order = 0
      for (const kw of rawKws) {
        // 최대 32개, 짧은 키워드만 (네비게이션 텍스트 제거: 10자 이상이면서 공백+한글 많은 것)
        const clean = kw.split(/\s{2,}/)[0].trim()  // 이중공백 이후 제거
        if (!clean || clean.length > 50) continue
        keywords.push({ keyword: clean, sort_order: order++ })
        if (order >= 40) break
      }
    }

    if (label.includes('변환')) {
      // "A->B" 또는 "A→B" 형식
      const lines = val.split('\n').map(s => s.trim()).filter(Boolean)
      for (const line of lines) {
        const arrow = line.includes('->') ? '->' : line.includes('→') ? '→' : null
        if (!arrow) continue
        const parts = line.split(arrow)
        const orig   = parts[0].trim()
        const mapped = parts[1]?.trim() ?? ''
        if (!orig || !mapped) continue

        // 원본에 쉼표가 있으면 여러 기관 → 각각 매핑
        const origList = orig.split(',').map(s => s.trim()).filter(Boolean)
        for (const o of origList) {
          keyword_mappings.push({ original_keyword: o, mapped_keyword: mapped })
        }
      }
    }

    // 대상 사업 정보
    if (label.includes('대상 사업명') && val) {
      proj.target_project_name = val
    }
    if (label.includes('대상 사업 기간') && val) {
      const periodM = val.match(/(\d{4}\.\d{2})-?~?(\d{4}\.\d{2})/)
      if (periodM) {
        proj.target_period_start = periodM[1]
        proj.target_period_end   = periodM[2]
      }
    }
  }

  // ── 4. audit_phases + phase_assignments (테이블 #7, index 6) ──
  const t7 = tables[6]?.rows ?? []
  const phases: AuditPhaseData[] = []
  const phase_assignments: PhaseAssignmentData[] = []
  let phaseOrder = 0

  // 헤더 행 찾기 (단계 구분 | 현장 감리 | ...)
  let dataStartRow = 0
  for (let i = 0; i < t7.length; i++) {
    if (t7[i][0]?.includes('단계 구분') || t7[i][0]?.includes('▶')) {
      dataStartRow = i + 1
      break
    }
  }
  // 헤더가 2행인 경우 (1행=제목, 2행=컬럼명)
  if (dataStartRow <= 1) dataStartRow = 2

  for (let i = dataStartRow; i < t7.length; i++) {
    const row = t7[i]
    if (!row[0] || row.length < 5) continue

    // "요구정의 (5일)" 형식
    const phaseRaw = row[0].trim()
    const mPhase = phaseRaw.match(/^(.+?)\s*\((\d+)일\)/)
    if (!mPhase) continue

    const phaseName = mPhase[1].trim()
    const phaseDays = parseInt(mPhase[2])

    // 날짜 파싱: "2026.08.24 (월) - 2026.08.28 (금)"
    const dateRaw  = (row[1] ?? '').trim()
    const dateParts = dateRaw.match(/(\d{4}\.\d{2}\.\d{2})/g) ?? []

    const headcount     = extractNumber(row[3] ?? '') ?? 0
    const preMd         = extractNumber(row[4] ?? '') ?? 0
    const auditMd       = extractNumber(row[5] ?? '') ?? 0
    const actionMd      = extractNumber(row[6] ?? '') ?? 0
    const proposeMd     = extractNumber(row[7] ?? '') ?? 0

    phases.push({
      phase_name:        phaseName,
      phase_days:        phaseDays,
      phase_start_date:  dateParts[0] ? parseJpDate(dateParts[0]) : '',
      phase_end_date:    dateParts[1] ? parseJpDate(dateParts[1]) : '',
      phase_order:       phaseOrder++,
      total_auditor_cnt: headcount,
      pre_survey_md:     preMd,
      audit_md:          auditMd,
      action_confirm_md: actionMd,
      proposed_md:       proposeMd,
    })

    // 투입 인력 파싱: "성명:pre:audit:action, 성명2:..." (col[8])
    const assignRaw = (row[8] ?? '').trim()
    // 개행+콤마 정리
    const assignList = assignRaw.split(/,\s*\n?\s*/).map(s => s.trim()).filter(Boolean)
    for (const item of assignList) {
      // "차판용:1:5:1" 형식
      const parts = item.split(':')
      if (parts.length < 2) continue
      const personName = parts[0].trim()
      if (!personName || personName.length > 10) continue
      phase_assignments.push({
        phase_name:        phaseName,
        person_name:       personName,
        member_type:       row[2]?.trim() ?? '감리원',
        pre_survey_md:     parseInt(parts[1] ?? '0') || 0,
        audit_md:          parseInt(parts[2] ?? '0') || 0,
        action_confirm_md: parseInt(parts[3] ?? '0') || 0,
      })
    }
  }

  // ── 5. proposal_members (테이블 #8, index 7) ──
  const t8 = tables[7]?.rows ?? []
  const proposal_members: ProposalMemberData[] = []

  // 헤더: 구분 | 담당 분야 | 성명 | 정기 | 추가 | 검수지원 | 소계 | 상근 | 감리원 등급 | 감리원증 | 연락처 | 교육 시간
  let memberStart = 0
  for (let i = 0; i < t8.length; i++) {
    if (t8[i][0]?.includes('구분') || t8[i][0]?.includes('▶')) {
      memberStart = i + 1
      break
    }
  }
  if (memberStart <= 1) memberStart = 2

  let currentGroup = ''
  let currentType  = '감리원'

  for (let i = memberStart; i < t8.length; i++) {
    const row = t8[i]
    const c = row.map(s => (s ?? '').trim())

    // 그룹 헤더: "단계 감리팀 (6 명)"
    if (c[0].includes('감리팀') || c[0].includes('전문가') || c[0].includes('테스터')) {
      const mType = c[0].match(/(감리팀|전문가|테스터)/)
      if (mType) {
        currentGroup = c[0]
        currentType  = mType[1] === '감리팀' ? '감리원' : mType[1]
      }
    }

    // 소계 행 스킵
    if (c[0] === '소계' || c[1] === '소계' || c[2] === '소계') continue
    // 총계 행 스킵
    if (c[0].includes('총계') || c[0].includes('합계')) continue

    // 이름 컬럼 위치 결정 (c[2] or c[1])
    // 구조: 구분 | 담당분야 | 성명 | 정기 | 추가 | 검수 | 소계 | 상근 | 등급 | 감리원증 | 연락처 | 교육
    // 또는:      | 담당분야 | 성명 | ... (구분 없는 행)
    let nameIdx = 2
    let domainIdx = 1
    let startMdIdx = 3

    // 이름 패턴 탐지 (한글 2-4자 + " (K)" 가능)
    const nameRe = /^[가-힣]{2,5}(\s*\([A-Z]\))?$/
    if (!nameRe.test(c[nameIdx]) && nameRe.test(c[1])) {
      nameIdx = 1; domainIdx = 0; startMdIdx = 2
    }

    const rawName = c[nameIdx]
    if (!rawName || !nameRe.test(rawName)) continue

    const personName = rawName.replace(/\s*\([A-Z]\)/, '').trim()

    proposal_members.push({
      person_name:    personName,
      member_group:   currentGroup,
      member_type:    currentType,
      domain:         c[domainIdx] ?? '',
      regular_md:     extractNumber(c[startMdIdx] ?? '') ?? 0,
      additional_md:  extractNumber(c[startMdIdx + 1] ?? '') ?? 0,
      acceptance_md:  extractNumber(c[startMdIdx + 2] ?? '') ?? 0,
      is_fulltime:    (c[startMdIdx + 4] ?? '').includes('상근') ? 1 : 0,
      auditor_grade:  c[startMdIdx + 5] ?? '',
      auditor_cert_no: c[startMdIdx + 6] ?? '',
      phone:          c[startMdIdx + 7] ?? '',
      education_hours: extractNumber(c[startMdIdx + 8] ?? '') ?? 0,
    })
  }

  // ── 6. proposal_attachments_toc + template (테이블 #9, index 8) ──
  const t9 = tables[8]?.rows ?? []
  const attachments_toc: AttachmentTocData[] = []

  for (const row of t9) {
    const label = (row[0] ?? '').trim()
    const val   = (row[1] ?? '').trim()

    if (label.includes('템플릿')) {
      proj.proposal_template = val
    }
    if (label.includes('첨부 목차')) {
      // "1. 제목1 2. 제목2 ..." 파싱
      const parts = val.split(/\s+(\d+)\.\s+/)
      // parts[0]=앞텍스트, parts[1]=번호, parts[2]=제목, ...
      for (let j = 1; j < parts.length - 1; j += 2) {
        const num   = parseInt(parts[j])
        const title = (parts[j + 1] ?? '').trim()
        if (title) attachments_toc.push({ item_order: num, item_name: title })
      }
    }
  }

  return {
    project:          proj,
    keywords,
    keyword_mappings,
    phases,
    phase_assignments,
    proposal_members,
    proposal_files,
    attachments_toc,
  }
}
