/**
 * 인력 프로파일 HTML 파서
 * 파일: 프로파일(성명).html
 *
 * 파싱 대상 테이블 (HTML 내 순서 기준):
 *   #4  → personnel (기본정보)
 *   #5  → personnel (education_hours)
 *   #7  → personnel_audit_history (감리실적)
 *   #9  → personnel_it_career (IT경력)
 *   #10 → personnel_certifications (자격증)
 *
 * ※ 테이블 인덱스는 HTML 버전마다 달라질 수 있으므로
 *    헤더 텍스트로 동적 탐색하는 방식을 병행 사용.
 */

import { parseHtmlTables, extractNumber } from './html-table-parser.js'

// 이메일 형식 검증 (xxx@xxx.xxx 패턴)
function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
}

/**
 * 특정 헤더 키워드를 포함하는 테이블 인덱스를 동적 탐색
 * headers: 첫 행에 포함돼야 할 키워드 배열 (모두 포함 시 매칭)
 */
function findTableByHeaders(tables: { rows: string[][] }[], headers: string[]): { rows: string[][] } | null {
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

// ─── 기간 파싱: "2015년10월～2017년3월" → { start, end } ─────
function parsePeriod(raw: string): { start: string; end: string } {
  const sep = raw.includes('～') ? '～' : raw.includes('~') ? '~' : '-'
  const parts = raw.split(sep).map(s => s.trim())

  const toYYYYMM = (s: string) => {
    // "2015년10월" → "2015.10"
    const m1 = s.match(/(\d{4})[년.\/\-](\d{1,2})/)
    if (m1) return `${m1[1]}.${m1[2].padStart(2, '0')}`
    // "2015.10" 그대로
    const m2 = s.match(/(\d{4})\.(\d{1,2})/)
    if (m2) return `${m2[1]}.${m2[2].padStart(2, '0')}`
    return s
  }

  return {
    start: toYYYYMM(parts[0] ?? ''),
    end: toYYYYMM(parts[1] ?? ''),
  }
}

// ─── 메인 파서 ───────────────────────────────────────────────
export function parsePersonnelHtml(html: string): ParsedPersonnel {
  const tables = parseHtmlTables(html)

  // ── 1. personnel 기본정보 ──────────────────────────────────
  // 테이블 인덱스 3을 기본으로 하되, "성명"을 포함하는 테이블을 동적 탐색
  const t4raw = tables[3] ?? findTableByHeaders(tables, ['성명'])
               ?? tables.find(t => t.rows.some(r => r.some(c => c.includes('감리원증') || c.includes('감리원증'))))
  const t4 = t4raw?.rows ?? []

  const personnel: PersonnelData = {
    name: '', position: '', is_fulltime: 1, company: '',
    email: '', phone: '', birthdate: '',
    auditor_cert_no: '', auditor_grade: '', tech_grade: '',
    school: '', major: '', degree: '',
    career_summary: '', career_qualif: '', career_project: '', career_expert: '',
    education_name: '', education_hours: 0, education_org: '',
  }

  for (let i = 0; i < t4.length; i++) {
    const row = t4[i]
    // 각 셀을 trim하여 저장
    const cells = row.map(c => c?.trim() ?? '')

    // ── 성명 헤더 행 → 다음 행에 "성명 (직위, 상근여부)" 값
    if (cells[0].includes('성명')) {
      const nextRow = (t4[i + 1] ?? []).map(c => c?.trim() ?? '')
      const raw = nextRow[0] ?? ''   // ex) "강신배 (수석, 상근)"
      const mName = raw.match(/^([^\(（\s]+)/)
      if (mName) personnel.name = mName[1]
      const mPos = raw.match(/[（(]([^,）)]+)/)
      if (mPos) personnel.position = mPos[1].trim()
      personnel.is_fulltime = raw.includes('상근') ? 1 : 0
      // 소속회사: 같은 행의 다른 셀에서 탐색
      for (let ci = 1; ci < nextRow.length; ci++) {
        if (nextRow[ci] && !nextRow[ci].match(/^[\d.]+$/) && nextRow[ci].length > 1) {
          personnel.company = nextRow[ci]; break
        }
      }
    }

    // ── 감리원증번호 / 감리원 등급 / 기술 등급 ──────────────
    // 패턴A: label0=라벨, val1=값 (한 행에 라벨-값 쌍)
    // 패턴B: label0=라벨, val1=값, label2=라벨, val3=값 (두 쌍이 같은 행)
    for (let ci = 0; ci < cells.length - 1; ci++) {
      const lbl = cells[ci]
      const val = cells[ci + 1]
      if (lbl.includes('감리원증') || lbl.includes('감리원 번호') || lbl.includes('자격번호')) {
        if (val && !['감리원 등급','기술 등급','감리 경력','감리원 등급'].includes(val)) {
          personnel.auditor_cert_no = val
        }
      }
      if (lbl.includes('감리원 등급') || lbl.includes('감리등급')) {
        if (val && !['기술 등급','감리원증','감리 경력'].includes(val)) {
          personnel.auditor_grade = val
        }
      }
      if (lbl.includes('기술 등급') || lbl.includes('기술등급')) {
        if (val && !['감리원 등급','감리원증','감리 경력'].includes(val)) {
          personnel.tech_grade = val
        }
      }
    }

    // ── 이메일 / 연락처 / 생년월일 ──────────────────────────
    // 원본 HTML 구조: label="이메일" val=email | label="연락처" val=phone | label="생년월일" val=birthdate
    // 같은 행에 여러 라벨-값 쌍이 있을 수 있음
    for (let ci = 0; ci < cells.length - 1; ci++) {
      const lbl = cells[ci]
      const val = cells[ci + 1]
      if (lbl === '이메일' || lbl.includes('이메일')) {
        if (isValidEmail(val)) personnel.email = val
        // 이메일 다음 셀들에서 연락처/생년월일 추가 탐색
        for (let ci2 = ci + 2; ci2 < cells.length - 1; ci2++) {
          const lbl2 = cells[ci2]
          const val2 = cells[ci2 + 1]
          if (lbl2.includes('연락처') || lbl2.includes('핸드폰') || lbl2.includes('전화')) {
            if (val2 && !isValidEmail(val2)) personnel.phone = val2
          }
          if (lbl2.includes('생년월일') || lbl2.includes('생년')) {
            if (val2) personnel.birthdate = val2
          }
        }
      }
      if ((lbl.includes('연락처') || lbl.includes('핸드폰') || lbl.includes('전화번호')) && !personnel.phone) {
        if (val && !isValidEmail(val) && !val.includes('등급') && !val.includes('경력')) {
          personnel.phone = val
        }
      }
      if ((lbl.includes('생년월일') || lbl.includes('생년')) && !personnel.birthdate) {
        if (val && !val.includes('등급') && !val.includes('경력')) {
          personnel.birthdate = val
        }
      }
    }

    // ── 학력 ─────────────────────────────────────────────────
    if (cells[0].includes('최종학교')) {
      personnel.school = cells[1] ?? ''
      for (let ci = 2; ci < cells.length - 1; ci++) {
        if (cells[ci].includes('전공')) personnel.major  = cells[ci + 1] ?? ''
        if (cells[ci].includes('학위') || cells[ci].includes('졸업')) personnel.degree = cells[ci + 1] ?? ''
      }
      if (!personnel.major  && cells[2]) personnel.major  = cells[2]
      if (!personnel.degree && cells[3]) personnel.degree = cells[3]
      if (!personnel.degree && cells[4]) personnel.degree = cells[4]
    }

    // ── 경력 요약 ─────────────────────────────────────────────
    if (cells[0].includes('주요 경력') && !cells[0].includes('자격')) {
      personnel.career_summary = cells[1] ?? ''
    }
    if (cells[0].includes('주요 경력 및 자격')) personnel.career_qualif  = cells[1] ?? ''
    if (cells[0].includes('시스템 개발'))        personnel.career_project = cells[1] ?? ''
    if (cells[0].includes('주요 이력'))           personnel.career_expert  = cells[1] ?? ''
  }

  // ── 이메일 전체 재스캔 (보조) ──
  if (!personnel.email) {
    for (const row of t4) {
      for (const cell of row) {
        if (isValidEmail(cell ?? '')) {
          personnel.email = cell.trim(); break
        }
      }
      if (personnel.email) break
    }
  }

  // ── 2. 교육정보 ───────────────────────────────────────────
  // "교육명" 헤더를 포함하는 테이블을 동적 탐색
  const t5raw = findTableByHeaders(tables, ['교육']) ?? tables[4]
  const t5 = t5raw?.rows ?? []
  if (t5.length >= 2) {
    const dataRow = t5[1]
    personnel.education_name  = (dataRow[0] ?? '').trim()
    personnel.education_hours = extractNumber(dataRow[1] ?? '') ?? 0
    personnel.education_org   = (dataRow[2] ?? '').trim()
  }

  // ── 3. 감리실적 ───────────────────────────────────────────
  // 헤더: 연월 | 사업명 | 주관기관 | 공공/민간 | 담당분야 | 역할 | 참여단계 | 참여율
  const t7raw = findTableByHeaders(tables, ['사업명', '참여율'])
             ?? findTableByHeaders(tables, ['감리', '사업명'])
             ?? tables[6]
  const t7 = t7raw?.rows ?? []
  const audit_history: PersonnelAuditHistory[] = []
  for (let i = 1; i < t7.length; i++) {
    const r = t7[i].map(c => c?.trim() ?? '')
    if (!r[0] || !r[1]) continue
    // 연월 검증: "YYYY.MM" 또는 "YYYY년MM월" 형식
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

  // ── 4. IT 경력 ────────────────────────────────────────────
  // 헤더 패턴: 기간(년) | 프로젝트명 | 주관기관 | 담당분야 | 역할 | 소속회사 | 비고
  //   또는:   연도     | 프로젝트명 | 기간(년) | 주관기관 | 담당분야 | 역할 | 소속회사 | 비고
  //
  // 동적 탐색: "IT 경력" 섹션 또는 "기간" + "프로젝트명" 포함 테이블
  const t9raw = findTableByHeaders(tables, ['프로젝트명', '소속'])
             ?? findTableByHeaders(tables, ['사업명', '소속'])
             ?? findTableByHeaders(tables, ['기간', '역할', '비고'])
             ?? tables[8]
  const t9 = t9raw?.rows ?? []
  const it_career: PersonnelItCareer[] = []

  if (t9.length > 0) {
    // 헤더 행으로 컬럼 인덱스 동적 파악
    const header = (t9[0] ?? []).map(c => c?.trim() ?? '')
    let colPeriod    = -1  // "기간" 컬럼 (period_start/end 파싱 대상)
    let colProject   = -1  // "프로젝트명" 또는 "사업명"
    let colClient    = -1  // "주관기관" 또는 "발주기관"
    let colDomain    = -1  // "담당분야"
    let colRole      = -1  // "역할"
    let colCompany   = -1  // "소속회사" 또는 "수행사"
    let colRemarks   = -1  // "비고"

    for (let ci = 0; ci < header.length; ci++) {
      const h = header[ci]
      if (colPeriod  < 0 && (h.includes('기간') || h.includes('연도') || h.match(/^\d{4}/))) colPeriod  = ci
      if (colProject < 0 && (h.includes('프로젝트') || h.includes('사업명')))               colProject = ci
      if (colClient  < 0 && (h.includes('주관') || h.includes('발주') || h.includes('기관'))) colClient = ci
      if (colDomain  < 0 && (h.includes('분야') || h.includes('담당')))                     colDomain  = ci
      if (colRole    < 0 && h.includes('역할'))                                              colRole    = ci
      if (colCompany < 0 && (h.includes('소속') || h.includes('수행사') || h.includes('회사'))) colCompany = ci
      if (colRemarks < 0 && h.includes('비고'))                                             colRemarks = ci
    }

    // 헤더 탐색 실패 시 원본 HTML 구조 기반 기본값 적용
    // 확인된 구조: 기간(년) | 프로젝트명 | 주관기관 | 담당분야 | 역할 | 소속회사 | 비고
    if (colPeriod  < 0) colPeriod  = 0
    if (colProject < 0) colProject = 1
    if (colClient  < 0) colClient  = 2
    if (colDomain  < 0) colDomain  = 3
    if (colRole    < 0) colRole    = 4
    if (colCompany < 0) colCompany = 5
    if (colRemarks < 0) colRemarks = 6

    for (let i = 1; i < t9.length; i++) {
      const r = t9[i].map(c => c?.trim() ?? '')
      const periodRaw = r[colPeriod] ?? ''
      if (!periodRaw || !r[colProject]) continue

      // 기간 셀이 숫자 연도가 아닌 경우 건너뜀 (헤더 반복 등)
      if (!/\d{4}/.test(periodRaw)) continue

      const period = parsePeriod(periodRaw)
      it_career.push({
        period_start: period.start,
        period_end:   period.end,
        project_name: r[colProject] ?? '',
        client_org:   r[colClient]  ?? '',
        domain:       r[colDomain]  ?? '',
        role:         r[colRole]    ?? '',
        company:      r[colCompany] ?? '',
        remarks:      r[colRemarks] ?? '',
      })
    }
  }

  // ── 5. 자격증 ────────────────────────────────────────────
  // 헤더: 자격증명 | 발급처 | 국가공인 여부 | 관련 분야
  const t10raw = findTableByHeaders(tables, ['자격증', '발급'])
              ?? findTableByHeaders(tables, ['자격', '국가공인'])
              ?? tables[9]
  const t10 = t10raw?.rows ?? []
  const certifications: PersonnelCertification[] = []
  for (let i = 1; i < t10.length; i++) {
    const r = t10[i].map(c => c?.trim() ?? '')
    if (!r[0]) continue
    // "정보시스템 수석감리원 (2006)" → 이름 + 연도
    const nameRaw = r[0]
    const mYear = nameRaw.match(/\((\d{4})\)/)
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
