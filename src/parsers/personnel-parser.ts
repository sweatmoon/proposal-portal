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
 */

import { parseHtmlTables, extractNumber } from './html-table-parser.js'

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

  // ── 1. personnel 기본정보 (테이블 인덱스 3, 1-indexed #4) ──
  const t4 = tables[3]?.rows ?? []
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
    const label0 = (row[0] ?? '').trim()
    const val1   = (row[1] ?? '').trim()
    const label2 = (row[2] ?? '').trim()
    const val3   = (row[3] ?? '').trim()

    // "성명 (직위)" 헤더 → 다음 행이 값
    if (label0.includes('성명')) {
      const nextRow = t4[i + 1] ?? []
      const raw = (nextRow[0] ?? '').trim() // "강신배 (수석, 상근)"
      const mName = raw.match(/^([^\(（\s]+)/)
      if (mName) personnel.name = mName[1]
      const mPos = raw.match(/[（(]([^,）)]+)/)
      if (mPos) personnel.position = mPos[1].trim()
      personnel.is_fulltime = raw.includes('상근') ? 1 : 0
      personnel.company = (nextRow[5] ?? '').trim()
    }

    if (label0.includes('감리원증'))   personnel.auditor_cert_no = val1
    if (label0.includes('감리원 등급')) personnel.auditor_grade   = val1
    if (label0.includes('기술 등급'))  personnel.tech_grade       = val1
    if (label2.includes('감리원 등급')) personnel.auditor_grade   = val3
    if (label2.includes('기술 등급'))  personnel.tech_grade       = val3

    // 이메일 행 탐지: label이 이메일이거나 값에 "@" 포함
    if (label0.includes('이메일')) {
      personnel.email = val1
      personnel.phone = (row[2] ?? '').trim()
      personnel.birthdate = (row[4] ?? '').trim()
    }
    // "강신배" 값행 → email 열이 col[0]에 이메일 직접 있는 경우
    if (!personnel.email && val1.includes('@')) personnel.email = val1

    if (label0.includes('최종학교')) {
      personnel.school = val1
      personnel.major  = (row[2] ?? '').trim()
      personnel.degree = (row[4] ?? '').trim()
      if (!personnel.degree) personnel.degree = (row[3] ?? '').trim()
    }

    if (label0.includes('주요 경력') && !label0.includes('자격')) {
      personnel.career_summary = val1
    }
    if (label0.includes('주요 경력 및 자격')) personnel.career_qualif   = val1
    if (label0.includes('시스템 개발'))       personnel.career_project  = val1
    if (label0.includes('주요 이력'))          personnel.career_expert   = val1
  }

  // 이메일/연락처 재스캔 (행 구조가 다를 때 대비)
  for (const row of t4) {
    for (const cell of row) {
      if (!personnel.email && cell.includes('@') && cell.includes('.')) {
        personnel.email = cell.trim()
      }
    }
    if (row[0]?.includes('이메일')) {
      personnel.email = (row[1] ?? '').trim()
      personnel.phone = (row[2] ?? '').trim() || (row[3] ?? '').trim()
    }
  }

  // ── 2. 교육정보 (테이블 #5, index 4) ──
  const t5 = tables[4]?.rows ?? []
  if (t5.length >= 2) {
    personnel.education_name  = (t5[1][0] ?? '').trim()
    personnel.education_hours = extractNumber(t5[1][1] ?? '') ?? 0
    personnel.education_org   = (t5[1][2] ?? '').trim()
  }

  // ── 3. 감리실적 (테이블 #7, index 6) ──
  // 헤더행: 연월 | 사업명 | 주관 기관 | 공공/민간 | 담당 분야 | 역할 | 참여 단계 | 참여율
  const t7 = tables[6]?.rows ?? []
  const audit_history: PersonnelAuditHistory[] = []
  for (let i = 1; i < t7.length; i++) {
    const r = t7[i]
    if (!r[0] || !r[1]) continue
    // 연월 검증: "YYYY.MM" 또는 "YYYY년MM월" 형식
    const ymOk = /\d{4}[.\s년]/.test(r[0])
    if (!ymOk) continue
    audit_history.push({
      audit_yearmonth:   r[0].trim(),
      project_name:      r[1].trim(),
      client_org:        (r[2] ?? '').trim(),
      sector:            (r[3] ?? '').trim(),
      domain:            (r[4] ?? '').trim(),
      role:              (r[5] ?? '').trim(),
      phase:             (r[6] ?? '').trim(),
      participation_rate: extractNumber(r[7] ?? '') ?? 100,
    })
  }

  // ── 4. IT 경력 (테이블 #9, index 8) ──
  // 헤더: 연도 | 프로젝트명 | 주관 기관 | 담당 분야 | 역할 | 소속 회사 | 비고
  const t9 = tables[8]?.rows ?? []
  const it_career: PersonnelItCareer[] = []
  for (let i = 1; i < t9.length; i++) {
    const r = t9[i]
    if (!r[0] || !r[1]) continue
    const period = parsePeriod(r[0])
    it_career.push({
      period_start: period.start,
      period_end:   period.end,
      project_name: r[1].trim(),
      client_org:   (r[2] ?? '').trim(),
      domain:       (r[3] ?? '').trim(),
      role:         (r[4] ?? '').trim(),
      company:      (r[5] ?? '').trim(),
      remarks:      (r[6] ?? '').trim(),
    })
  }

  // ── 5. 자격증 (테이블 #10, index 9) ──
  // 헤더: 자격증 명 | 발급처 | 국가공인 여부 | 관련 분야
  const t10 = tables[9]?.rows ?? []
  const certifications: PersonnelCertification[] = []
  for (let i = 1; i < t10.length; i++) {
    const r = t10[i]
    if (!r[0]) continue
    // "정보시스템 수석감리원 (2006)" → 이름 + 연도
    const nameRaw = r[0].trim()
    const mYear = nameRaw.match(/\((\d{4})\)/)
    const certName = nameRaw.replace(/\s*\(\d{4}\)/, '').trim()
    certifications.push({
      cert_name:     certName,
      cert_year:     mYear ? mYear[1] : '',
      issuer:        (r[1] ?? '').trim(),
      is_national:   (r[2] ?? '').includes('국가공인') ? 1 : 0,
      related_field: (r[3] ?? '').trim(),
    })
  }

  return { personnel, certifications, audit_history, it_career }
}
