/**
 * HTML 테이블 파서 유틸리티
 * Cloudflare Workers 환경 (DOMParser 없음) → 직접 정규식 파싱
 */

export interface ParsedTable {
  rows: string[][]
}

/**
 * HTML 문자열에서 최상위 테이블들을 파싱하여 2차원 배열로 반환
 * nested table은 무시 (depth 추적)
 */
export function parseHtmlTables(html: string): ParsedTable[] {
  const tables: ParsedTable[] = []

  // 태그를 순회하는 상태머신
  let depth = 0
  let curRows: string[][] = []
  let curRow: string[] | null = null
  let curCell: string | null = null
  let inCell = false

  // <태그> 추출용 정규식 (속성 포함)
  const tagRe = /<(\/?)(\w+)[^>]*?(?:\s*\/)?>|([^<]+)/gi

  // HTML 엔티티 디코딩
  const decodeEntities = (s: string) =>
    s
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))

  let match: RegExpExecArray | null
  while ((match = tagRe.exec(html)) !== null) {
    const [full, closing, tagName, text] = match

    if (text !== undefined) {
      // 텍스트 노드
      if (inCell && curCell !== null) {
        const t = decodeEntities(text).trim()
        if (t) curCell += (curCell ? ' ' : '') + t
      }
      continue
    }

    const tag = tagName.toLowerCase()
    const isClose = closing === '/'

    if (tag === 'table') {
      if (!isClose) {
        depth++
        if (depth === 1) {
          curRows = []
        }
      } else {
        if (depth === 1) {
          tables.push({ rows: curRows })
          curRows = []
        }
        depth--
      }
    } else if (tag === 'tr' && depth === 1) {
      if (!isClose) {
        curRow = []
      } else {
        if (curRow) curRows.push(curRow)
        curRow = null
      }
    } else if ((tag === 'td' || tag === 'th') && depth === 1) {
      if (!isClose) {
        curCell = ''
        inCell = true
      } else {
        if (curRow !== null && curCell !== null) {
          curRow.push(curCell.trim())
        }
        curCell = null
        inCell = false
      }
    } else if ((tag === 'br' || tag === 'p') && inCell) {
      // br/p → 공백으로 대체
      if (curCell !== null) curCell += '\n'
    }
  }

  return tables
}

/** 숫자만 추출 (쉼표, 원, MD 등 제거) */
export function extractNumber(s: string): number | null {
  const m = s.replace(/,/g, '').match(/[\d.]+/)
  return m ? parseFloat(m[0]) : null
}

/** "YYYY.MM.DD" or "YYYY/MM/DD" → "YYYY-MM-DD" 정규화 */
export function normalizeDate(s: string): string {
  return s.replace(/(\d{4})[./](\d{1,2})[./](\d{1,2})/, (_, y, m, d) =>
    `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`)
}
