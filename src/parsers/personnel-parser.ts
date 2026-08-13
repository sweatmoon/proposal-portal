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
    tables.find(t => t.rows.some(r => r.join(' ').includes('감리원증'))) ??
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

  // ── rowspan 오프셋 감지 헬퍼 ─────────────────────────────────
  // HTML에서 첫 번째 열이 rowspan으로 인력 이름이 반복 삽입되는 경우,
  // cells[0]이 항상 이름이 되어 실제 라벨이 cells[1]부터 시작함
  // → 행 전체에서 라벨 키워드를 찾아 실제 시작 오프셋을 반환
  function findOffset(cells: string[], ...keywords: string[]): number {
    for (let ci = 0; ci < cells.length; ci++) {
      if (keywords.some(kw => cells[ci].includes(kw))) return ci
    }
    return 0
  }

  // 실제 HTML 구조: 라벨 행 다음에 값 행이 오는 패턴
  // rowspan 있는 경우: row N = [이름(rowspan), 감리원증, 감리원 등급, ...]
  //                   row N+1 = [이름(rowspan), 정감협 제4755호, 감리원, ...]
  // rowspan 없는 경우: row N = [감리원증, 감리원 등급, ...]
  //                   row N+1 = [정감협 제4755호, 감리원, ...]

  for (let i = 0; i < t4.length; i++) {
    const cells = (t4[i] ?? []).map(c => (c ?? '').trim())
    const rowText = cells.join(' ')

    // ── 성명/직위/회사 ─────────────────────────────────────
    if (rowText.includes('성명') && rowText.includes('직위')) {
      // 다음 행이 값 행
      const vRow = (t4[i + 1] ?? []).map(c => (c ?? '').trim())
      // 성명 헤더 오프셋 찾기
      const off = findOffset(cells, '성명')
      const raw = vRow[off] ?? ''   // "강신배 (수석, 상근)" 또는 "김현호 (과장, 상근)"
      const mName = raw.match(/^([^\(（\s]+)/)
      if (mName) personnel.name = mName[1]
      const mPos  = raw.match(/[（(]([^,）)]+)/)
      if (mPos) personnel.position = mPos[1].trim()
      personnel.is_fulltime = raw.includes('상근') ? 1 : 0
      // 회사: 마지막 셀 (index off+5 기준)
      personnel.company = vRow[off + 5] ?? vRow[vRow.length - 1] ?? ''
    }

    // ── 감리원증 / 감리원 등급 / 기술 등급 라벨 행 감지 ───
    if (rowText.includes('감리원증') || rowText.includes('감리원 번호')) {
      const off = findOffset(cells, '감리원증', '감리원 번호')
      const vRow = (t4[i + 1] ?? []).map(c => (c ?? '').trim())
      // off부터 라벨-값 대응
      for (let ci = off; ci < cells.length; ci++) {
        const lbl = cells[ci]
        const val = (vRow[ci] ?? '').trim()
        if (!val || val === '-') continue
        if (lbl.includes('감리원증') || lbl.includes('감리원 번호')) personnel.auditor_cert_no = val
        if (lbl.includes('감리원 등급') || lbl === '감리등급')         personnel.auditor_grade   = val
        if (lbl.includes('기술 등급')   || lbl === '기술등급')          personnel.tech_grade      = val
        // 감리 경력/시작일: HTML 값을 직접 저장 (audit_history 없을 때 fallback용)
        // upload-personnel.ts의 동적 계산이 우선이므로 여기서는 보조 저장하지 않음
      }
    }

    // ── 이메일 / 연락처 / 생년월일 라벨 행 감지 ──────────
    if (rowText.includes('이메일')) {
      const off = findOffset(cells, '이메일')
      const vRow = (t4[i + 1] ?? []).map(c => (c ?? '').trim())
      for (let ci = off; ci < cells.length; ci++) {
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
    if (rowText.includes('최종학교')) {
      const off = findOffset(cells, '최종학교')
      const vRow = (t4[i + 1] ?? []).map(c => (c ?? '').trim())
      personnel.school = vRow[off] ?? ''
      for (let ci = off + 1; ci < cells.length; ci++) {
        const lbl = cells[ci]
        const val = vRow[ci] ?? ''
        if (lbl.includes('전공')) personnel.major  = val
        if (lbl.includes('학위') || lbl.includes('졸업')) personnel.degree = val
      }
      if (!personnel.major  && vRow[off + 1]) personnel.major  = vRow[off + 1]
      if (!personnel.degree && vRow[off + 2]) personnel.degree = vRow[off + 2]
    }

    // ── 경력 관련 필드 (라벨 | 값 이 같은 행에 있는 구조) ───
    // rowspan 있는 경우: cells[0]=이름, cells[1]=라벨, cells[2]=값
    // rowspan 없는 경우: cells[0]=라벨, cells[1]=값
    const lblIdx  = findOffset(cells, '주요 경력', '주요경력')
    const lblCell = cells[lblIdx] ?? ''
    const valCell = (cells[lblIdx + 1] ?? '').trim()

    if (lblCell.includes('주요 경력') && !lblCell.includes('자격') && !lblCell.includes('및')) {
      if (valCell) personnel.career_summary = valCell
    }
    if (lblCell.includes('주요 경력 및 자격') || lblCell.includes('주요경력및자격')) {
      if (valCell) personnel.career_qualif = valCell
    }

    const lblIdx2  = findOffset(cells, '시스템 개발', '프로젝트 실무')
    const lblCell2 = cells[lblIdx2] ?? ''
    const valCell2 = (cells[lblIdx2 + 1] ?? '').trim()
    if (lblCell2.includes('시스템 개발') || lblCell2.includes('프로젝트 실무')) {
      if (valCell2) personnel.career_project = valCell2
    }

    const lblIdx3  = findOffset(cells, '주요 이력', '전문가용')
    const lblCell3 = cells[lblIdx3] ?? ''
    const valCell3 = (cells[lblIdx3 + 1] ?? '').trim()
    if (lblCell3.includes('주요 이력') || lblCell3.includes('전문가용')) {
      if (valCell3) personnel.career_expert = valCell3
    }
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

  // ── 4. IT 경력 ─────────────────────────────────────────────
  // 포맷 A (강신배 등): 연도|프로젝트명|주관기관|담당분야|역할|소속회사|비고
  // 포맷 B (강혁 등):   기간(년)|경력|담당 업무|유사 경력의 근거
  //
  // 탐색 우선순위:
  //   1) 포맷 A 헤더 탐색
  //   2) 포맷 B 헤더 탐색 ('기간' + '경력' 또는 '담당 업무')
  //   3) fallback: tables[10]
  // 데이터 행이 2행 이상인 테이블만 유효로 판단 (헤더만 있는 테이블 제외)
  const hasData = (t: { rows: string[][] } | null | undefined) =>
    t != null && t.rows.length >= 2

  const itTableA =
    [
      findTableByHeaders(tables, ['프로젝트명', '소속 회사']),
      findTableByHeaders(tables, ['프로젝트명', '소속']),
      findTableByHeaders(tables, ['연도', '프로젝트명', '비고']),
    ].find(hasData) ?? null

  const itTableB =
    [
      findTableByHeaders(tables, ['기간', '경력', '담당']),
      findTableByHeaders(tables, ['기간(년)', '경력']),
      findTableByHeaders(tables, ['기간', '담당 업무']),
    ].find(hasData) ?? null

  // A형 우선, 없으면 B형, 없으면 fallback
  const itTable = (hasData(itTableA) ? itTableA : null)
               ?? (hasData(itTableB) ? itTableB : null)
               ?? (hasData(tables[10]) ? tables[10] : null)
               ?? itTableA ?? itTableB ?? tables[10]
  const t9 = itTable?.rows ?? []
  const it_career: PersonnelItCareer[] = []

  if (t9.length > 0) {
    // 헤더에서 컬럼 인덱스 파악
    const hdr = (t9[0] ?? []).map(c => (c ?? '').trim())
    let cPeriod = 0, cProject = 1, cClient = 2, cDomain = 3, cRole = 4, cCompany = 5, cRemarks = 6

    for (let ci = 0; ci < hdr.length; ci++) {
      const h = hdr[ci]
      if (h.includes('연도') || h.includes('기간'))                                            cPeriod  = ci
      // '경력'이 포함되더라도 '근거'도 포함이면 remarks로 처리 (예: "유사 경력의 근거")
      if ((h.includes('프로젝트') || h.includes('사업명') ||
           (h.includes('경력') && !h.includes('근거') && !h.includes('기간'))))               cProject = ci
      if (h.includes('주관') || h.includes('발주') ||
          (h.includes('기관') && !h.includes('교육')))                                         cClient  = ci
      if (h.includes('담당 업무') || h.includes('담당분야') ||
          (h.includes('분야') && !h.includes('유사')))                                         cDomain  = ci
      if (h === '역할' || (h.includes('역할') && !h.includes('분야')))                        cRole    = ci
      if (h.includes('소속') || h.includes('수행사') ||
          (h.includes('회사') && !h.includes('기관')))                                         cCompany = ci
      if (h.includes('비고') || h.includes('근거'))                                            cRemarks = ci
    }

    // 포맷 B 판별: '기관' 컬럼이 없는 경우 → 클라이언트 없는 포맷
    const isFmtB = hdr.some(h => h.includes('기간') && (h.includes('년') || h === '기간'))
                   && !hdr.some(h => h.includes('주관') || h.includes('기관'))

    for (let i = 1; i < t9.length; i++) {
      const r = (t9[i] ?? []).map(c => (c ?? '').trim())
      const periodRaw  = r[cPeriod]  ?? ''
      const projectRaw = r[cProject] ?? ''
      if (!periodRaw || !projectRaw) continue
      if (!/\d{4}/.test(periodRaw)) continue

      const period = parsePeriod(periodRaw)
      it_career.push({
        period_start: period.start,
        period_end:   period.end,
        project_name: projectRaw,
        client_org:   isFmtB ? '' : (r[cClient]  ?? ''),
        domain:       r[cDomain]  ?? '',
        role:         isFmtB ? '' : (r[cRole]    ?? ''),
        company:      isFmtB ? '' : (r[cCompany] ?? ''),
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
