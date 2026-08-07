/**
 * 인력 프로파일 HTML 파서
 * 파일: 프로파일(성명).html
 *
 * 실제 확인된 HTML 테이블 구조 (강신배 기준):
 *   index 0~2 : 헤더/메뉴 등 무시
 *   index 3   : 기본정보
 *     row0: [성명 (직위)] [감리] [IT 경력] [프로젝트 경력] [보유 자격] [회사]  ← 헤더
 *     row1: [강신배 (수석, 상근)] [105회...] [9회...] [6회] [4개] [ATV]        ← 값
 *     row2: [감리원증] [감리원 등급] [기술 등급] [감리 경력] [감리 시작일]      ← 라벨행
 *     row3: [서울 제134호] [수석감리원] [기술사] [-] [0]                        ← 값행
 *     row4: [이메일] [연락처] [생년월일]                                         ← 라벨행
 *     row5: [sbaekang@activo.kr] [010-8769-9410] [640621]                       ← 값행
 *     row6: [최종학교] [전공분야] [학위]
 *     row7: [건국대학교 대학원 박사과정] [] [박사과정]
 *   index 4   : 교육정보
 *   index 8   : 감리실적  (헤더: 연월|사업명|주관기관|공공민간|담당분야|역할|참여단계|참여율)
 *   index 10  : IT 경력   (헤더: 연도|프로젝트명|주관기관|담당분야|역할|소속회사|비고)
 *   index 11  : 자격증    (헤더: 자격증명|발급처|국가공인여부|관련분야)
 */

import { parseHtmlTables, extractNumber } from './html-table-parser.js'

// 이메일 형식 검증
function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
}

// 헤더 키워드로 테이블 동적 탐색 (모든 키워드가 첫 행에 포함돼야 매칭)
function findTableByHeaders(
  tables: { rows: string[][] }[],
  headers: string[]
): { rows: string[][] } | null {
  for (const t of tables) {
    const firstRow = (t.rows[0] ?? []).join(' ')
    if (headers.every(h => firstRow.includes(h))) return t
  }
  return null
}

// ─── 반환 타입 ────────────────────────────────────────────────
export interface PersonnelData {
  name: string
  position: string
  is_fulltime: number
  company: string
  email: string
  phone: string
  birthdate: string
  auditor_cert_no: string
  auditor_grade: string
  tech_grade: string
  school: string
  major: string
  degree: string
  career_summary: string
  career_qualif: string
  career_project: string
  career_expert: string
  education_name: string
  education_hours: number
  education_org: string
}

export interface PersonnelCertification {
  cert_name: string
  cert_year: string
  issuer: string
  is_national: number
  related_field: string
}

export interface PersonnelAuditHistory {
  audit_yearmonth: string
  project_name: string
  client_org: string
  sector: string
  domain: string
  role: string
  phase: string
  participation_rate: number
}

export interface PersonnelItCareer {
  period_start: string
  period_end: string
  project_name: string
  client_org: string
  domain: string
  role: string
  company: string
  remarks: string
}

export interface ParsedPersonnel {
  personnel: PersonnelData
  certifications: PersonnelCertification[]
  audit_history: PersonnelAuditHistory[]
  it_career: PersonnelItCareer[]
}

// ─── 기간 파싱: "2015년10월～2017년3월" or "2015.10 ~ 2017.03" → { start, end } ──
function parsePeriod(raw: string): { start: string; end: string } {
  // 구분자: ～ | ~ | - (단, 연도 내부 - 는 제외)
  const sep = raw.includes('～') ? '～' : raw.includes('~') ? '~' : ' - '
  const parts = raw.split(sep).map(s => s.trim())

  const toYYYYMM = (s: string): string => {
    const m1 = s.match(/(\d{4})[년.\/\-](\d{1,2})/)
    if (m1) return `${m1[1]}.${m1[2].padStart(2, '0')}`
    const m2 = s.match(/(\d{4})\.(\d{1,2})/)
    if (m2) return `${m2[1]}.${m2[2].padStart(2, '0')}`
    return s
  }

  return {
    start: toYYYYMM(parts[0] ?? ''),
    end:   toYYYYMM(parts[1] ?? ''),
  }
}

// ─── 메인 파서 ───────────────────────────────────────────────
export function parsePersonnelHtml(html: string): ParsedPersonnel {
  const tables = parseHtmlTables(html)

  // ── 1. 기본정보 테이블 탐색 ──────────────────────────────
  // "성명 (직위)" 헤더를 포함하는 테이블 (index 3)
  const basicTable =
    tables[3] ??
    findTableByHeaders(tables, ['성명']) ??
    tables.find(t => t.rows.some(r => r[0]?.includes('감리원증'))) ??
    null
  const t4 = basicTable?.rows ?? []

  const personnel: PersonnelData = {
    name: '', position: '', is_fulltime: 1, company: '',
    email: '', phone: '', birthdate: '',
    auditor_cert_no: '', auditor_grade: '', tech_grade: '',
    school: '', major: '', degree: '',
    career_summary: '', career_qualif: '', career_project: '', career_expert: '',
    education_name: '', education_hours: 0, education_org: '',
  }

  // 실제 HTML 구조: 라벨 행 다음에 값 행이 오는 패턴
  // row N   = 라벨들: [감리원증] [감리원 등급] [기술 등급] [감리 경력] [감리 시작일]
  // row N+1 = 값들:  [서울 제134호] [수석감리원] [기술사] [-] [0]
  //
  // 따라서 "라벨 행"을 먼저 감지하고, 다음 행에서 인덱스 대응 값을 읽는다

  for (let i = 0; i < t4.length; i++) {
    const cells = (t4[i] ?? []).map(c => (c ?? '').trim())

    // ── 성명/직위/회사 ─────────────────────────────────────
    if (cells[0].includes('성명')) {
      // 다음 행이 값 행
      const vRow = (t4[i + 1] ?? []).map(c => (c ?? '').trim())
      const raw = vRow[0] ?? ''   // "강신배 (수석, 상근)"
      const mName = raw.match(/^([^\(（\s]+)/)
      if (mName) personnel.name = mName[1]
      const mPos  = raw.match(/[（(]([^,）)]+)/)
      if (mPos) personnel.position = mPos[1].trim()
      personnel.is_fulltime = raw.includes('상근') ? 1 : 0
      // 회사: 마지막 셀 (index 5 기준, 없으면 마지막 비어있지 않은 셀)
      personnel.company = vRow[5] ?? vRow[vRow.length - 1] ?? ''
    }

    // ── 감리원증 / 감리원 등급 / 기술 등급 라벨 행 감지 ───
    // 패턴: cells = [감리원증, 감리원 등급, 기술 등급, 감리 경력, 감리 시작일]
    if (cells[0].includes('감리원증') || cells[0].includes('감리원 번호')) {
      // 다음 행이 값 행
      const vRow = (t4[i + 1] ?? []).map(c => (c ?? '').trim())
      // cells[0]=감리원증  → vRow[0]=자격번호
      // cells[1]=감리원 등급 → vRow[1]=등급값
      // cells[2]=기술 등급  → vRow[2]=기술등급값
      // cells[3]=감리 경력  → vRow[3]=경력값 (무시 - 동적 계산)
      // cells[4]=감리 시작일 → vRow[4]=시작일 (무시 - 동적 계산)
      for (let ci = 0; ci < cells.length; ci++) {
        const lbl = cells[ci]
        const val = (vRow[ci] ?? '').trim()
        if (!val || val === '-') continue
        if (lbl.includes('감리원증') || lbl.includes('감리원 번호')) personnel.auditor_cert_no = val
        if (lbl.includes('감리원 등급') || lbl === '감리등급')         personnel.auditor_grade   = val
        if (lbl.includes('기술 등급')   || lbl === '기술등급')          personnel.tech_grade      = val
      }
    }

    // ── 이메일 / 연락처 / 생년월일 라벨 행 감지 ──────────
    // 패턴: cells = [이메일, 연락처, 생년월일, ...]
    if (cells[0] === '이메일' || cells[0].includes('이메일')) {
      // 다음 행이 값 행
      const vRow = (t4[i + 1] ?? []).map(c => (c ?? '').trim())
      for (let ci = 0; ci < cells.length; ci++) {
        const lbl = cells[ci]
        const val = vRow[ci] ?? ''
        if (!val || val === '-') continue
        if (lbl.includes('이메일')) {
          if (isValidEmail(val)) personnel.email = val
        } else if (lbl.includes('연락처') || lbl.includes('핸드폰') || lbl.includes('전화')) {
          personnel.phone = val
        } else if (lbl.includes('생년월일') || lbl.includes('생년')) {
          personnel.birthdate = val
        }
      }
    }

    // ── 최종학교 라벨 행 감지 ────────────────────────────
    if (cells[0].includes('최종학교')) {
      const vRow = (t4[i + 1] ?? []).map(c => (c ?? '').trim())
      personnel.school = vRow[0] ?? ''
      // 전공/학위는 라벨 행에서 인덱스 파악 후 값 행에서 읽기
      for (let ci = 1; ci < cells.length; ci++) {
        const lbl = cells[ci]
        const val = vRow[ci] ?? ''
        if (lbl.includes('전공')) personnel.major  = val
        if (lbl.includes('학위') || lbl.includes('졸업')) personnel.degree = val
      }
      // 라벨 없이 순서만 있는 경우
      if (!personnel.major  && vRow[1]) personnel.major  = vRow[1]
      if (!personnel.degree && vRow[2]) personnel.degree = vRow[2]
    }

    // ── 경력 요약 (라벨-값이 같은 행 또는 다음 행) ────────
    if (cells[0].includes('주요 경력') && !cells[0].includes('자격')) {
      personnel.career_summary = cells[1] || (t4[i + 1]?.[0] ?? '')
    }
    if (cells[0].includes('주요 경력 및 자격')) personnel.career_qualif  = cells[1] || ''
    if (cells[0].includes('시스템 개발'))        personnel.career_project = cells[1] || ''
    if (cells[0].includes('주요 이력'))           personnel.career_expert  = cells[1] || ''
  }

  // ── 이메일 전체 재스캔 (보조) ──────────────────────────
  if (!personnel.email) {
    outer: for (const row of t4) {
      for (const cell of row) {
        if (isValidEmail(cell ?? '')) {
          personnel.email = cell.trim()
          break outer
        }
      }
    }
  }

  // ── 2. 교육정보 (index 4, 헤더: 교육명|교육이수시간|교육기관) ──
  const eduTable =
    findTableByHeaders(tables, ['교육명']) ??
    findTableByHeaders(tables, ['교육', '시간']) ??
    tables[4]
  const t5 = eduTable?.rows ?? []
  if (t5.length >= 2) {
    const dr = (t5[1] ?? []).map(c => (c ?? '').trim())
    personnel.education_name  = dr[0] ?? ''
    personnel.education_hours = extractNumber(dr[1] ?? '') ?? 0
    personnel.education_org   = dr[2] ?? ''
  }

  // ── 3. 감리실적 (헤더: 연월|사업명|주관기관|공공/민간|담당분야|역할|참여단계|참여율) ──
  const auditTable =
    findTableByHeaders(tables, ['사업명', '참여율']) ??
    findTableByHeaders(tables, ['사업명', '참여 단계']) ??
    tables[8]
  const t7 = auditTable?.rows ?? []
  const audit_history: PersonnelAuditHistory[] = []
  for (let i = 1; i < t7.length; i++) {
    const r = (t7[i] ?? []).map(c => (c ?? '').trim())
    if (!r[0] || !r[1]) continue
    if (!/\d{4}[.\s년]/.test(r[0])) continue
    audit_history.push({
      audit_yearmonth:    r[0],
      project_name:       r[1],
      client_org:         r[2] ?? '',
      sector:             r[3] ?? '',
      domain:             r[4] ?? '',
      role:               r[5] ?? '',
      phase:              r[6] ?? '',
      participation_rate: extractNumber(r[7] ?? '') ?? 100,
    })
  }

  // ── 4. IT 경력 (헤더: 연도|프로젝트명|주관기관|담당분야|역할|소속회사|비고) ──
  // 실제 확인: index 10
  const itTable =
    findTableByHeaders(tables, ['프로젝트명', '소속 회사']) ??
    findTableByHeaders(tables, ['프로젝트명', '소속']) ??
    findTableByHeaders(tables, ['연도', '프로젝트명', '비고']) ??
    tables[10]
  const t9 = itTable?.rows ?? []
  const it_career: PersonnelItCareer[] = []

  if (t9.length > 0) {
    // 헤더에서 컬럼 인덱스 파악
    const hdr = (t9[0] ?? []).map(c => (c ?? '').trim())
    let cPeriod = 0, cProject = 1, cClient = 2, cDomain = 3, cRole = 4, cCompany = 5, cRemarks = 6

    for (let ci = 0; ci < hdr.length; ci++) {
      const h = hdr[ci]
      if (h.includes('연도') || h.includes('기간'))                               cPeriod  = ci
      if (h.includes('프로젝트') || h.includes('경력') || h.includes('사업명'))  cProject = ci
      if (h.includes('주관') || h.includes('발주') || h.includes('기관'))         cClient  = ci
      if (h.includes('분야') || h.includes('담당'))                               cDomain  = ci
      if (h.includes('역할'))                                                      cRole    = ci
      if (h.includes('소속') || h.includes('회사') || h.includes('수행사'))       cCompany = ci
      if (h.includes('비고') || h.includes('근거'))                               cRemarks = ci
    }

    for (let i = 1; i < t9.length; i++) {
      const r = (t9[i] ?? []).map(c => (c ?? '').trim())
      const periodRaw = r[cPeriod] ?? ''
      const projectRaw = r[cProject] ?? ''
      if (!periodRaw || !projectRaw) continue
      if (!/\d{4}/.test(periodRaw)) continue

      const period = parsePeriod(periodRaw)
      it_career.push({
        period_start: period.start,
        period_end:   period.end,
        project_name: projectRaw,
        client_org:   r[cClient]  ?? '',
        domain:       r[cDomain]  ?? '',
        role:         r[cRole]    ?? '',
        company:      r[cCompany] ?? '',
        remarks:      r[cRemarks] ?? '',
      })
    }
  }

  // ── 5. 자격증 (헤더: 자격증명|발급처|국가공인여부|관련분야) ──
  // 실제 확인: index 11
  const certTable =
    findTableByHeaders(tables, ['자격증 명', '발급처']) ??
    findTableByHeaders(tables, ['자격증', '국가공인']) ??
    tables[11]
  const t10 = certTable?.rows ?? []
  const certifications: PersonnelCertification[] = []
  for (let i = 1; i < t10.length; i++) {
    const r = (t10[i] ?? []).map(c => (c ?? '').trim())
    if (!r[0]) continue
    const nameRaw = r[0]
    const mYear   = nameRaw.match(/\((\d{4})\)/)
    const certName = nameRaw.replace(/\s*\(\d{4}\)/, '').trim()
    certifications.push({
      cert_name:     certName,
      cert_year:     mYear ? mYear[1] : '',
      issuer:        r[1] ?? '',
      is_national:   (r[2] ?? '').includes('국가공인') ? 1 : 0,
      related_field: r[3] ?? '',
    })
  }

  return { personnel, certifications, audit_history, it_career }
}
