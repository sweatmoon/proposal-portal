/* ============================================================
   proposal-detail.js  — /proposals/:id 전용 클라이언트 스크립트
   parsedData, activeHL, correctionMode, gradeOverrides 는
   인라인 <script>에서 먼저 선언됨
   ============================================================ */

// ── 인력 모음 표 복사 ────────────────────────────────────────
function copyPersonnelTable() {
  const { portalOrder, personFieldMap } = parsedData
  const groups = [
    { role: '감리원',   names: portalOrder.filter(p => p.group === '감리원팀').map(p => p.name) },
    { role: '핵심기술', names: portalOrder.filter(p => p.group === '전문가' && !p.expertSubGroup.includes('필수') && !p.expertSubGroup.includes('보안')).map(p => p.name) },
    { role: '필수기술', names: portalOrder.filter(p => p.expertSubGroup.includes('필수')).map(p => p.name) },
    { role: '보안진단', names: portalOrder.filter(p => p.expertSubGroup.includes('보안')).map(p => p.name) },
    { role: '테스터',   names: portalOrder.filter(p => p.group === '테스터').map(p => p.name) },
  ]
  const wrap = document.getElementById('personnel-table-wrap')
  if (!wrap) return
  let rows = ''
  groups.forEach(g => {
    g.names.forEach(name => {
      const field = personFieldMap[name] || ''
      rows += '<tr><td style="border:1px solid #ccc;padding:5px 8px">' + g.role + '</td><td style="border:1px solid #ccc;padding:5px 8px">' + field + '</td><td style="border:1px solid #ccc;padding:5px 8px">' + spaceOutName(name) + '</td></tr>'
    })
  })
  wrap.innerHTML = '<table id="personnel-summary-table" style="border-collapse:collapse;width:100%;font-size:13px;font-family:\'Malgun Gothic\',sans-serif"><thead><tr><th style="border:1px solid #ccc;padding:5px 8px;background:#1a2e4a;color:#fff">역할</th><th style="border:1px solid #ccc;padding:5px 8px;background:#1a2e4a;color:#fff">분야</th><th style="border:1px solid #ccc;padding:5px 8px;background:#1a2e4a;color:#fff">이름</th></tr></thead><tbody>' + rows + '</tbody></table>'
  document.getElementById('personnelTableModal').style.display = 'flex'
}
function closePersonnelTableModal() {
  document.getElementById('personnelTableModal').style.display = 'none'
}
function spaceOutName(name) { return (name || '').split('').join(' ') }
async function copyPersonnelSummaryTable() {
  const table = document.getElementById('personnel-summary-table')
  if (!table) { alert('표를 먼저 열어주세요.'); return }
  const html = table.outerHTML
  const text = Array.from(table.rows).map(tr => Array.from(tr.cells).map(td => td.textContent.trim()).join('\t')).join('\n')
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([text], { type: 'text/plain' }), 'text/html': new Blob([html], { type: 'text/html' }) })])
      alert('✅ 표가 클립보드에 복사되었습니다.')
      return
    }
  } catch (e) {}
  try {
    if (navigator.clipboard) { await navigator.clipboard.writeText(text); alert('✅ 복사되었습니다.'); return }
  } catch (e) {}
  const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.top = '-9999px'
  document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta)
  alert('✅ 복사되었습니다.')
}

// ── 하이라이트 / 강조 제어 ─────────────────────────────────
function highlightByName(name, field) {
  document.querySelectorAll('.person-chip').forEach(c => { c.style.background = ''; c.style.borderColor = 'transparent' })
  document.querySelectorAll('.pool-person').forEach(c => c.style.background = '')
  document.querySelectorAll('.person-chip[data-name="' + CSS.escape(name) + '"]').forEach(c => {
    c.style.background = '#fff9c4'; c.style.borderColor = '#f9a825'
  })
  document.querySelectorAll('.pool-person[data-name="' + CSS.escape(name) + '"]').forEach(c => {
    c.style.background = '#fff9c4'
  })
  if (field) {
    document.querySelectorAll('.person-chip[data-field="' + CSS.escape(field) + '"]').forEach(c => {
      if (c.dataset.name !== name) { c.style.background = '#e8f5e9'; c.style.borderColor = '#43a047' }
    })
  }
}

function clearHighlights() {
  document.querySelectorAll('.person-chip').forEach(c => { c.style.background = ''; c.style.borderColor = 'transparent' })
  document.querySelectorAll('.pool-person').forEach(c => c.style.background = '')
  document.querySelectorAll('.mds-num').forEach(n => { n.style.background = ''; n.style.color = ''; n.style.borderRadius = ''; n.style.padding = '' })
  activeHL = null; correctionMode = null
}

function highlightCorrections(type) {
  if (correctionMode === type) { clearHighlights(); return }
  clearHighlights(); correctionMode = type
  const colorMap = { pre: '#1565c0', audit: '#6a1b9a', post: '#c62828' }
  document.querySelectorAll('.mds-num[data-k="' + type + '"]').forEach(n => {
    if ((parseInt(n.textContent) || 0) > 0) {
      n.style.background = colorMap[type]; n.style.color = '#fff'
      n.style.borderRadius = '3px'; n.style.padding = '0 4px'
    }
  })
}

// chip 클릭 → 하이라이트
document.addEventListener('click', function (e) {
  const chip = e.target.closest('.person-chip')
  if (chip) {
    e.stopPropagation()
    const name = chip.dataset.name, field = chip.dataset.field
    if (activeHL && activeHL.name === name) { clearHighlights(); return }
    activeHL = { name, field }; highlightByName(name, field); return
  }
  const pool = e.target.closest('.pool-person')
  if (pool) {
    e.stopPropagation()
    const name = pool.dataset.name, field = pool.dataset.field
    if (activeHL && activeHL.name === name) { clearHighlights(); return }
    activeHL = { name, field }; highlightByName(name, field); return
  }
  if (!e.target.closest('#schedule-section') && !e.target.closest('[id$="Modal"]') && activeHL) { clearHighlights() }
})

// 전문가 셀 더블클릭 → breakdown 모달
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.people-cell[data-ci^="people-expert-"]').forEach(td => {
    td.style.cursor = 'zoom-in'
    td.addEventListener('dblclick', function (e) {
      if (e.target.closest('.person-chip')) return
      const si = parseInt(this.dataset.ci.split('-').pop())
      openExpertBreakdown(si)
    })
  })
})

function openExpertBreakdown(si) {
  const stage = parsedData.stages[si]
  if (!stage || !stage['전문가']) return
  const people = stage['전문가'].people
  document.getElementById('ebTitle').textContent = stage.stage + ' · 전문가 분류별 인력'
  document.getElementById('ebSub').textContent = '총 ' + people.length + '명'
  const classifyFn = nm => {
    const info = parsedData.personGradeMap[nm] || {}
    if (info.group === '테스터') return 'tester'
    const sub = info.expertSubGroup || ''
    if (sub.includes('보안')) return 'security'
    if (sub.includes('필수')) return 'required'
    return 'core'
  }
  const buckets = { core: [], required: [], security: [], tester: [] }
  people.forEach(p => buckets[classifyFn(p.name)].push(p))
  const groups = [{ key: 'core', label: '🟢 핵심기술' }, { key: 'required', label: '🟩 필수기술' }, { key: 'security', label: '🔴 보안진단' }, { key: 'tester', label: '🟣 테스터' }]
  document.getElementById('ebBody').innerHTML = groups.map(g => {
    const items = buckets[g.key].map(p => {
      return '<span class="person-chip" data-name="' + p.name + '" data-field="' + (p.field || '') + '" data-stage="' + si + '" data-pre="' + p.pre + '" data-audit="' + p.audit + '" data-post="' + p.post + '" style="display:inline-flex;flex-direction:column;gap:1px;border:1px solid #e0e0e0;border-radius:5px;padding:4px 9px;cursor:pointer;transition:all .15s"><span class="chip-name" style="font-weight:700;color:#1a2e4a;font-size:13px">' + p.name + '</span><span style="color:#2e7d32;font-size:11.5px">' + (p.field || (parsedData.personFieldMap[p.name] || '(분야 미상)')) + '</span><span style="color:#999;font-size:11px">' + p.pre + ':' + p.audit + ':' + p.post + '</span></span>'
    }).join('')
    return '<div style="margin-bottom:12px"><div style="font-size:13px;font-weight:700;margin-bottom:6px;display:flex;align-items:center;gap:6px">' + g.label + '<span style="font-weight:400;color:#888;font-size:12px">' + buckets[g.key].length + '명</span></div><div style="display:flex;flex-wrap:wrap;gap:6px">' + (buckets[g.key].length ? items : '<span style="color:#bbb;font-size:12px">없음</span>') + '</div></div>'
  }).join('')
  document.getElementById('expertBreakdownModal').style.display = 'flex'
}
function closeExpertBreakdown() { document.getElementById('expertBreakdownModal').style.display = 'none' }

// ── 자동화 PPT 모달 ─────────────────────────────────────────
function openAutoModal() {
  if (typeof PptxGenJS === 'undefined') {
    alert('PPT 라이브러리 로딩 중... 잠시 후 다시 시도해주세요.')
    return
  }
  document.getElementById('autoModal').style.display = 'flex'
  renderPhotoAssignRows()
}
function closeAutoModal() { document.getElementById('autoModal').style.display = 'none' }

// ── 사진장표 분류 체크리스트 ────────────────────────────────
const PHOTO_CATS = [
  { key: 'audit',    label: '👤 감리원',    grpFilter: p => p.group === '감리원팀' },
  { key: 'core',     label: '🟢 핵심기술',  grpFilter: p => p.group === '전문가' && !p.expertSubGroup.includes('필수') && !p.expertSubGroup.includes('보안') },
  { key: 'required', label: '🟩 필수기술',  grpFilter: p => p.expertSubGroup.includes('필수') },
  { key: 'security', label: '🔴 보안진단',  grpFilter: p => p.expertSubGroup.includes('보안') },
  { key: 'tester',   label: '🟣 테스터',    grpFilter: p => p.group === '테스터' },
]

// 인원수에 맞는 기본 장표 크기 추천 (인원 이상인 가장 작은 규격)
function suggestSheetSize(count) {
  for (const size of [2, 4, 6, 9]) if (count <= size) return size
  return 9
}

// 각 분류의 인원 목록을 parsedData.portalOrder에서 추출
function buildPhotoAssignCache() {
  const { portalOrder } = parsedData || {}
  if (!portalOrder) return null
  const cache = {}
  PHOTO_CATS.forEach(c => { cache[c.key] = portalOrder.filter(c.grpFilter) })
  return cache
}

// 사진장표 분류 체크리스트 HTML 렌더링
function renderPhotoAssignRows() {
  const wrap = document.getElementById('photo-assign-rows')
  if (!wrap) return
  if (!parsedData || !parsedData.portalOrder) {
    wrap.innerHTML = '<span style="color:#aaa;font-size:13px">인력 데이터가 없습니다.</span>'
    return
  }
  const cache = buildPhotoAssignCache()
  const activeCats = PHOTO_CATS.filter(c => (cache[c.key] || []).length > 0)
  if (!activeCats.length) {
    wrap.innerHTML = '<span style="color:#aaa;font-size:13px">인력 데이터가 없습니다.</span>'
    return
  }

  const rows = activeCats.map(c => {
    const count = cache[c.key].length
    // 감리원은 장표 크기 선택 없이 고정 안내
    if (c.key === 'audit') {
      return `<div class="photo-assign-row" data-cat="audit" style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:#f9fafb;border-radius:6px;flex-wrap:wrap">
        <span style="font-weight:700;font-size:13px;min-width:110px">${c.label} <span style="font-weight:400;color:#777">(${count}명)</span></span>
        <span style="font-size:12px;color:#888">2인장표로 기본 포함됩니다</span>
      </div>`
    }
    const otherCats = activeCats.filter(o => o.key !== c.key && o.key !== 'audit')
    const includeBoxes = [
      `<label style="display:flex;align-items:center;gap:3px;font-size:12px;cursor:pointer"><input type="checkbox" class="paw-solo" data-cat="${c.key}" checked onchange="onPawSoloChange('${c.key}')"> 단독</label>`,
      ...otherCats.map(o => `<label style="display:flex;align-items:center;gap:3px;font-size:12px;cursor:pointer"><input type="checkbox" class="paw-include" data-cat="${c.key}" data-target="${o.key}" onchange="onPawIncludeChange('${c.key}')"> ${o.label.replace(/^\S+\s/, '')}</label>`)
    ].join('')
    return `<div class="photo-assign-row" data-cat="${c.key}" style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:#f9fafb;border-radius:6px;flex-wrap:wrap">
      <span style="font-weight:700;font-size:13px;min-width:110px">${c.label} <span style="font-weight:400;color:#777">(${count}명)</span></span>
      <span style="font-size:12px;color:#555">장표
        <select class="paw-sheet" data-cat="${c.key}" style="margin:0 4px;padding:2px 4px;border-radius:4px;border:1px solid #ccc;font-size:12px">
          ${[2, 4, 6, 9].map(n => `<option value="${n}"${n === suggestSheetSize(count) ? ' selected' : ''}>${n}인</option>`).join('')}
        </select>
      </span>
      <span style="font-size:12px;color:#555">포함 <span style="display:inline-flex;gap:6px;flex-wrap:wrap">${includeBoxes}</span></span>
    </div>`
  }).join('')
  wrap.innerHTML = rows
}

// "단독" 체크 시 같은 행의 포함 체크박스 모두 해제
function onPawSoloChange(cat) {
  const row = document.querySelector(`.photo-assign-row[data-cat="${cat}"]`)
  const solo = row.querySelector('.paw-solo')
  if (solo.checked) row.querySelectorAll('.paw-include').forEach(cb => { cb.checked = false })
}
// 다른 분류 포함 체크 시 "단독" 자동 해제
function onPawIncludeChange(cat) {
  const row = document.querySelector(`.photo-assign-row[data-cat="${cat}"]`)
  const anyChecked = Array.from(row.querySelectorAll('.paw-include')).some(cb => cb.checked)
  if (anyChecked) row.querySelector('.paw-solo').checked = false
}

// 각 분류 행의 설정(장표 크기, 포함 대상) 읽기
function readPhotoAssignConfig() {
  const cfg = {}
  document.querySelectorAll('.photo-assign-row').forEach(row => {
    const cat = row.dataset.cat
    const sheetEl = row.querySelector('.paw-sheet')
    if (!sheetEl) return // 감리원 행 (고정, 장표 크기 없음)
    const sheet = parseInt(sheetEl.value, 10)
    const include = new Set()
    row.querySelectorAll('.paw-include:checked').forEach(cb => include.add(cb.dataset.target))
    cfg[cat] = { sheet, include }
  })
  return cfg
}

// 서로 "포함"으로 연결된 분류들을 하나의 그룹으로 묶음 (union-find)
function groupPhotoCategories(cfg) {
  const keys = Object.keys(cfg)
  const parent = {}; keys.forEach(k => { parent[k] = k })
  const find = k => (parent[k] === k ? k : (parent[k] = find(parent[k])))
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb }
  keys.forEach(k => { cfg[k].include.forEach(t => { if (cfg[t]) union(k, t) }) })
  const groups = {}
  PHOTO_CATS.forEach(({ key }) => {
    if (!cfg[key]) return
    const root = find(key)
    ;(groups[root] = groups[root] || []).push(key)
  })
  return Object.values(groups)
}

function showAutoAlert(msg, ok) {
  const el = document.getElementById('autoModalAlertBox')
  el.style.display = ''; el.textContent = msg
  el.style.background = ok ? '#e8f5e9' : '#ffebee'
  el.style.border = '1px solid ' + (ok ? '#43a047' : '#e53935')
  el.style.color = ok ? '#1b5e20' : '#b71c1c'
}

function setBtnState(btn, loading) {
  if (!btn) return
  if (loading) { btn._orig = btn.textContent; btn.disabled = true; btn.textContent = '⏳ 생성 중...' }
  else { btn.disabled = false; btn.textContent = btn._orig || btn.textContent }
}

function getExtraSet() {
  return new Set(Array.from(document.querySelectorAll('.st-extra-stage-cb:checked')).map(cb => cb.value))
}

// ── 공통 유틸 ───────────────────────────────────────────────
function xmlEscape(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;') }
function extractDates(t) { return ((t || '').match(/\d{4}\.\d{2}\.\d{2}/g) || []) }
function shiftDateStr(ds, delta) {
  const m = (ds || '').match(/(\d{4})\.(\d{2})\.(\d{2})/)
  if (!m) return ds || ''
  const d = new Date(+m[1], +m[2] - 1, +m[3]); d.setDate(d.getDate() + delta)
  return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0')
}
function fmtCertNo(text) {
  const raw = (text || '').trim()
  const m = raw.match(/^(\S+)\s+(제\s*\d+\s*호)$/)
  if (m) return m[1] + '<br>' + m[2].replace(/\s+/g, '')
  return raw
}
function getEffectiveGrade(name) {
  if (gradeOverrides[name]) return gradeOverrides[name]
  const info = parsedData.personGradeMap[name] || {}
  if (info.grade === '수석감리원') return '수석감리원'
  if (info.grade === '감리원') return '감리원'
  return '전문가'
}

// ── 세부감리일정 1 PPT ──────────────────────────────────────
function computeDetailSchedule1Rows() {
  const { stages } = parsedData
  return stages.map(s => {
    const ae = s['감리원'] || { pre: 0, audit: 0, post: 0, total: 0 }
    const dates = extractDates(s.date)
    const startD = dates[0] || '', endD = dates[1] || dates[0] || ''
    const isCompact = ['상주감리', '상시감리', '검수지원'].some(k => s.stage.includes(k))
    const preMD = ae.pre || 0, auditMD = ae.audit || 0, postMD = ae.post || 0
    const subtotalMD = ae.total || (preMD + auditMD + postMD)
    const subtotalDays = s.days || 0
    const compactLabel = s.stage.includes('검수') ? '검수지원' : '상주/상시 감리'
    const compactDate = startD && endD ? (startD + ' ~ ' + endD) : (s.date || '')
    return { stage: s.stage, startD, endD, days: s.days || 0, preMD, auditMD, postMD, subtotalMD, subtotalDays, isCompact, compactLabel, compactDate }
  })
}

async function downloadDetailSchedule1Pptx(btn, opts) {
  opts = opts || {}
  if (typeof PptxGenJS === 'undefined') { alert('PPT 라이브러리 로딩 중입니다. 잠시 후 다시 시도해주세요.'); return null }
  setBtnState(btn, true)
  try {
    const stageRows = computeDetailSchedule1Rows()
    if (!stageRows.length) { alert('일정 데이터가 없습니다.'); return null }
    const extraSet = getExtraSet()
    const pres = new PptxGenJS(); pres.layout = 'LAYOUT_WIDE'
    const FONT_BOLD = 'KoPub돋움체 Bold', FONT_MEDIUM = 'KoPub돋움체 Medium'
    const colW = [0.8472, 0.8472, 1.6944, 1.6944, 1.5403]
    const tableX = 3.2717, tableY = 0.7635
    const BORDER_COLOR = 'BFBFBF'
    const bd = { pt: 0.5, color: BORDER_COLOR }, bd0 = { pt: 0, color: 'FFFFFF', type: 'none' }
    const bMid = [bd, bd, bd, bd], bLeft = [bd, bd, bd, bd0], bRight = [bd, bd0, bd, bd]
    const baseOpt = e => Object.assign({ align: 'center', valign: 'middle', margin: [0, 0, 0, 0] }, e)
    const mdLabel = (d, m) => '(' + d + ')일 / (' + m + ')MD'
    const STAGE_FILL = 'F2F2F2', HILITE_FILL = 'F2F2F2'
    const STAGE_ROW_H = [0.1623, 0.1298, 0.1623, 0.1298, 0.1298, 0.1623, 0.1710]
    const HEADER_H = 0.1623, TOTAL_H = 0.3254
    const rows = [], rowH = []
    rows.push([
      { text: '단계', options: baseOpt({ fontFace: FONT_BOLD, fontSize: 9, color: '000000', fill: { color: 'D2F0FF' }, border: bLeft }) },
      { text: '수행 활동', options: baseOpt({ fontFace: FONT_BOLD, fontSize: 9, color: '000000', fill: { color: 'D2F0FF' }, border: bMid }) },
      { text: '수행 절차', options: baseOpt({ fontFace: FONT_BOLD, fontSize: 9, color: '000000', fill: { color: 'D2F0FF' }, border: bMid }) },
      { text: '세부 일정', options: baseOpt({ fontFace: FONT_BOLD, fontSize: 9, color: '000000', fill: { color: 'D2F0FF' }, border: bMid }) },
      { text: '소요 일수 및 공수', options: baseOpt({ fontFace: FONT_BOLD, fontSize: 9, color: '000000', fill: { color: 'D2F0FF' }, border: bRight }) },
    ]); rowH.push(HEADER_H)
    let grandTotal = 0
    stageRows.forEach(s => {
      grandTotal += s.subtotalMD
      if (s.isCompact) {
        rows.push([
          { text: s.stage, options: baseOpt({ fontFace: FONT_BOLD, fontSize: 9, color: '000000', rowspan: 2, fill: { color: STAGE_FILL }, border: bLeft }) },
          { text: '감리시행', options: baseOpt({ fontFace: FONT_MEDIUM, fontSize: 9, color: '000000', border: bMid }) },
          { text: s.compactLabel, options: baseOpt({ fontFace: FONT_BOLD, fontSize: 9, color: '000000', fill: { color: HILITE_FILL }, border: bMid }) },
          { text: s.compactDate, options: baseOpt({ fontFace: FONT_BOLD, fontSize: 9, color: '000000', fill: { color: HILITE_FILL }, border: bMid }) },
          { text: mdLabel(s.subtotalDays, s.subtotalMD), options: baseOpt({ fontFace: FONT_BOLD, fontSize: 9, color: '000000', border: bRight }) },
        ]); rowH.push(STAGE_ROW_H[0])
        rows.push([
          { text: '소계', options: baseOpt({ fontFace: FONT_BOLD, fontSize: 10, color: '000000', colspan: 3, fill: { color: STAGE_FILL }, border: bMid }) },
          { text: mdLabel(s.subtotalDays, s.subtotalMD), options: baseOpt({ fontFace: FONT_BOLD, fontSize: 9, color: '000000', fill: { color: STAGE_FILL }, border: bRight }) },
        ]); rowH.push(STAGE_ROW_H[6])
        return
      }
      const showPre = s.preMD > 0, showPost = s.postMD > 0
      let pushed = false
      if (showPre) {
        const preEnd = s.startD ? shiftDateStr(s.startD, -1) : ''
        const preDate = s.startD ? ('~ ' + preEnd) : '예비조사'
        rows.push([
          { text: s.stage, options: baseOpt({ fontFace: FONT_BOLD, fontSize: 9, color: '000000', rowspan: (showPre ? 1 : 0) + 3 + (showPost ? 1 : 0) + 1, fill: { color: STAGE_FILL }, border: bLeft }) },
          { text: '사전 검토', options: baseOpt({ fontFace: FONT_MEDIUM, fontSize: 9, color: '000000', border: bMid }) },
          { text: '예비조사', options: baseOpt({ fontFace: FONT_MEDIUM, fontSize: 9, color: '000000', border: bMid }) },
          { text: preDate, options: baseOpt({ fontFace: FONT_MEDIUM, fontSize: 9, color: '000000', border: bMid }) },
          { text: mdLabel(1, s.preMD), options: baseOpt({ fontFace: FONT_BOLD, fontSize: 9, color: '000000', border: bRight }) },
        ]); rowH.push(STAGE_ROW_H[1]); pushed = true
      }
      const auditDate = s.startD && s.endD ? (s.startD + ' ~ ' + s.endD) : (s.compactDate || '')
      rows.push([
        !pushed ? { text: s.stage, options: baseOpt({ fontFace: FONT_BOLD, fontSize: 9, color: '000000', rowspan: 3 + (showPost ? 1 : 0) + 1, fill: { color: STAGE_FILL }, border: bLeft }) } : null,
        { text: '감리시행', options: baseOpt({ fontFace: FONT_MEDIUM, fontSize: 9, color: '000000', border: bMid }) },
        { text: '현장감리', options: baseOpt({ fontFace: FONT_BOLD, fontSize: 9, color: '000000', fill: { color: HILITE_FILL }, border: bMid }) },
        { text: auditDate, options: baseOpt({ fontFace: FONT_BOLD, fontSize: 9, color: '000000', fill: { color: HILITE_FILL }, border: bMid }) },
        { text: mdLabel(s.days, s.auditMD), options: baseOpt({ fontFace: FONT_BOLD, fontSize: 9, color: '000000', border: bRight }) },
      ].filter(Boolean)); rowH.push(STAGE_ROW_H[2]); pushed = true
      rows.push([
        { text: '결과 검토', options: baseOpt({ fontFace: FONT_MEDIUM, fontSize: 9, color: '000000', border: bMid }) },
        { text: '감리결과보고서 작성', options: baseOpt({ fontFace: FONT_MEDIUM, fontSize: 9, color: '000000', border: bMid }) },
        { text: '', options: baseOpt({ fontFace: FONT_MEDIUM, fontSize: 9, color: '000000', border: bMid }) },
        { text: '', options: baseOpt({ fontFace: FONT_MEDIUM, fontSize: 9, color: '000000', border: bRight }) },
      ]); rowH.push(STAGE_ROW_H[3])
      rows.push([
        { text: '후속 조치', options: baseOpt({ fontFace: FONT_MEDIUM, fontSize: 9, color: '000000', border: bMid }) },
        { text: '시정조치 확인', options: baseOpt({ fontFace: FONT_MEDIUM, fontSize: 9, color: '000000', border: bMid }) },
        { text: '', options: baseOpt({ fontFace: FONT_MEDIUM, fontSize: 9, color: '000000', border: bMid }) },
        { text: '', options: baseOpt({ fontFace: FONT_MEDIUM, fontSize: 9, color: '000000', border: bRight }) },
      ]); rowH.push(STAGE_ROW_H[4])
      if (showPost) {
        const postDate = s.endD ? (shiftDateStr(s.endD, 14) + ' ~') : ''
        rows.push([
          { text: '조치확인', options: baseOpt({ fontFace: FONT_MEDIUM, fontSize: 9, color: '000000', border: bMid }) },
          { text: '조치확인', options: baseOpt({ fontFace: FONT_BOLD, fontSize: 9, color: '000000', fill: { color: HILITE_FILL }, border: bMid }) },
          { text: postDate, options: baseOpt({ fontFace: FONT_BOLD, fontSize: 9, color: '000000', fill: { color: HILITE_FILL }, border: bMid }) },
          { text: mdLabel(1, s.postMD), options: baseOpt({ fontFace: FONT_BOLD, fontSize: 9, color: '000000', border: bRight }) },
        ]); rowH.push(STAGE_ROW_H[5])
      }
      rows.push([
        { text: '소계', options: baseOpt({ fontFace: FONT_BOLD, fontSize: 10, color: '000000', colspan: 4, fill: { color: STAGE_FILL }, border: bMid }) },
        { text: grandTotal + ' MD', options: baseOpt({ fontFace: FONT_BOLD, fontSize: 10, color: '000000', fill: { color: STAGE_FILL }, border: bRight }) },
      ]); rowH.push(STAGE_ROW_H[6])
    })
    rows.push([
      { text: '합계', options: baseOpt({ fontFace: FONT_BOLD, fontSize: 10, color: '000000', colspan: 4, fill: { color: 'D2F0FF' }, border: bLeft }) },
      { text: grandTotal + ' MD', options: baseOpt({ fontFace: FONT_BOLD, fontSize: 10, color: '000000', fill: { color: 'D2F0FF' }, border: bRight }) },
    ]); rowH.push(TOTAL_H)
    const sld = pres.addSlide()
    sld.addTable(rows, { x: tableX, y: tableY, w: colW.reduce((a, b) => a + b, 0), colW, rowH })
    if (opts.returnZip) {
      const ab = await pres.write({ outputType: 'arraybuffer' })
      const z = new JSZip(); await z.loadAsync(ab); return { zip: z }
    }
    await pres.writeFile({ fileName: '세부감리일정1_' + (parsedData.projectTitle || '').slice(0, 10) + '.pptx' })
    showAutoAlert('✅ 세부 감리 일정 (1) 생성 완료', true)
    return null
  } catch (e) { showAutoAlert('❌ 생성 실패: ' + e.message, false); return null }
  finally { setBtnState(btn, false) }
}

// ── 표장표 PPT ──────────────────────────────────────────────
function computeAssignRows() {
  const { stages, personGradeMap, personFieldMap, portalOrder } = parsedData
  return (portalOrder || []).map(({ name }) => {
    const info = personGradeMap[name] || {}
    const field = personFieldMap[name] || ''
    const stageNames = []
    let isAudit = false
    stages.forEach(s => {
      const inA = s['감리원'] && s['감리원'].people.some(p => p.name === name && (p.pre + p.audit + p.post) > 0)
      const inE = s['전문가'] && s['전문가'].people.some(p => p.name === name && (p.pre + p.audit + p.post) > 0)
      if (inA) isAudit = true
      if ((inA || inE) && !stageNames.includes(s.stage)) stageNames.push(s.stage)
    })
    const stageLabel = stageNames.join(' / ')
    const residency = info.residency || ''
    const affil = residency ? '제안사 / ' + residency : '제안사'
    const certNo = (info.certNo || '').trim()
    const certDisplay = (!certNo || certNo === '-') ? '전문가' : fmtCertNo(certNo)
    const grade = getEffectiveGrade(name)
    return { name, field, stageLabel, affil, certDisplay, grade, isAudit, heritageLines: isAudit ? 10 : 3 }
  })
}

async function downloadAssignPptx(btn, opts) {
  opts = opts || {}
  if (typeof PptxGenJS === 'undefined') { alert('PPT 라이브러리 로딩 중입니다.'); return null }
  setBtnState(btn, true)
  try {
    let rows = computeAssignRows()
    if (!rows.length) { alert('인력 데이터가 없습니다.'); return null }

    // groupFilter: 'AUDITOR' → 감리원만, 'EXPERT' → 전문가(핵심+필수+보안+테스터)만
    if (opts.groupFilter === 'AUDITOR') {
      rows = rows.filter(r => r.isAudit)
    } else if (opts.groupFilter === 'EXPERT') {
      rows = rows.filter(r => !r.isAudit)
    }
    const pres = new PptxGenJS(); pres.layout = 'LAYOUT_WIDE'
    const FONT_BOLD = 'KoPub돋움체 Bold', FONT_MEDIUM = 'KoPub돋움체 Medium'
    const bd = { pt: 0.5, color: '969696' }, bd0 = { type: 'none' }
    const bMid = [bd, bd, bd, bd], bLeft = [bd, bd, bd, bd0], bRight = [bd, bd0, bd, bd]
    const base = e => Object.assign({ align: 'center', valign: 'middle', margin: [0.05, 0.05, 0.05, 0.05] }, e)
    const headFill = { color: '1A2E4A' }
    const sld = pres.addSlide()
    const tRows = [[
      { text: '성명', options: base({ fontFace: FONT_BOLD, fontSize: 10, color: 'FFFFFF', fill: headFill, border: bLeft }) },
      { text: '구분', options: base({ fontFace: FONT_BOLD, fontSize: 10, color: 'FFFFFF', fill: headFill, border: bMid }) },
      { text: '담당 분야', options: base({ fontFace: FONT_BOLD, fontSize: 10, color: 'FFFFFF', fill: headFill, border: bMid }) },
      { text: '감리 단계', options: base({ fontFace: FONT_BOLD, fontSize: 10, color: 'FFFFFF', fill: headFill, border: bMid }) },
      { text: '소속 및 상근여부', options: base({ fontFace: FONT_BOLD, fontSize: 10, color: 'FFFFFF', fill: headFill, border: bMid }) },
      { text: '감리원증', options: base({ fontFace: FONT_BOLD, fontSize: 10, color: 'FFFFFF', fill: headFill, border: bMid }) },
      { text: '현장감리 투입율', options: base({ fontFace: FONT_BOLD, fontSize: 10, color: 'FFFFFF', fill: headFill, border: bRight }) },
    ]]
    rows.forEach(r => {
      tRows.push([
        { text: r.name, options: base({ fontFace: FONT_MEDIUM, fontSize: 10, color: '222222', border: bLeft }) },
        { text: r.grade, options: base({ fontFace: FONT_MEDIUM, fontSize: 10, color: '222222', border: bMid }) },
        { text: r.field, options: base({ fontFace: FONT_MEDIUM, fontSize: 10, color: '222222', align: 'l', border: bMid }) },
        { text: r.stageLabel, options: base({ fontFace: FONT_MEDIUM, fontSize: 10, color: '222222', border: bMid }) },
        { text: r.affil, options: base({ fontFace: FONT_MEDIUM, fontSize: 10, color: '222222', border: bMid }) },
        { text: r.certDisplay, options: base({ fontFace: FONT_MEDIUM, fontSize: 10, color: '222222', border: bMid }) },
        { text: '100%', options: base({ fontFace: FONT_BOLD, fontSize: 10, color: '222222', border: bRight }) },
      ])
    })
    const rowH = new Array(tRows.length).fill(0.28); rowH[0] = 0.2
    const colW = [0.8, 0.8, 2.2, 1.2, 1.2, 0.9, 0.9]
    sld.addTable(tRows, { x: 0.4, y: 0.5, w: colW.reduce((a, b) => a + b, 0), colW, rowH })
    if (opts.returnZip) {
      const ab = await pres.write({ outputType: 'arraybuffer' })
      const z = new JSZip(); await z.loadAsync(ab); return { zip: z }
    }
    await pres.writeFile({ fileName: '표장표_' + (parsedData.projectTitle || '').slice(0, 10) + '.pptx' })
    showAutoAlert('✅ 표장표 생성 완료', true)
    return null
  } catch (e) { showAutoAlert('❌ 생성 실패: ' + e.message, false); return null }
  finally { setBtnState(btn, false) }
}

// ── 사진장표 PPT (템플릿 기반) ─────────────────────────────────
// 원본 PPTX 템플릿(photo-template.b64.js)을 JSZip으로 열고 DOMParser로
// 슬라이드 XML을 파싱해 placeholder만 실제 값으로 치환한다.
// 폰트·색상·레이아웃 등 서식이 100% 원본 그대로 보존된다.

// 장표 레이아웃 메타 (원본 PPT의 슬라이드 파일명 + 카드 배치 매핑)
const PHOTO_LAYOUT_META = {
  2: { file: 'ppt/slides/slide1.xml', rows: 1, cols: 2, orderIndexToSlot: [1, 2] },
  4: { file: 'ppt/slides/slide2.xml', rows: 2, cols: 2, orderIndexToSlot: [1, 2, 3, 4] },
  6: { file: 'ppt/slides/slide3.xml', rows: 2, cols: 3, orderIndexToSlot: [1, 4, 5, 6, 2, 3] },
  9: { file: 'ppt/slides/slide4.xml', rows: 3, cols: 3, orderIndexToSlot: [1, 2, 3, 6, 9, 4, 5, 7, 8] },
}

// 열 우선 슬롯 채움 순서 (왼쪽 열부터 위→아래로 채운 뒤 다음 열)
function computeFillOrder(rows, cols) {
  const order = []
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) order.push(r * cols + c + 1)
  return order
}

// 신규 슬라이드용 관계 XML (slideLayout6.xml 참조 고정)
const PHOTO_SLIDE_RELS_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout6.xml"/>'
  + '</Relationships>'

// PHOTO_CATS 라벨 → 슬라이드 제목 매핑 (하위 호환용, 현재 buildPhotoPptxFromTemplate에선 미사용)
const PHOTO_CAT_TITLES = {
  audit:    '감리원',
  core:     '핵심기술 전문가',
  required: '필수기술 전문가',
  security: '보안진단 전문가',
  tester:   '테스터',
}

// ── buildPhotoPptxFromTemplate ──────────────────────────────────
// ── buildPhotoPptxFromTemplate (A안) ────────────────────────────
// pages = [{
//   sheetSize: 2|4|6|9,
//   slotPeople: { slotNum: { name, field, grade, profile:{...} } }
// }]
// templateZips = { 2: JSZip, 4: JSZip, 6: JSZip, 9: JSZip }
//   — DB에서 로드한 PERSON_2/4/6/9 각각의 ZIP 객체
//   — 각 ZIP의 첫 번째 슬라이드(slide1.xml)를 템플릿으로 사용
// → 최종 합본 JSZip 반환
async function buildPhotoPptxFromTemplate(pages, templateZips) {
  if (typeof JSZip === 'undefined') throw new Error('JSZip을 찾을 수 없습니다.')
  if (!templateZips) throw new Error('templateZips가 없습니다. PERSON_2/4/6/9 템플릿을 업로드하세요.')

  // 각 size별 ZIP에서 첫 번째 슬라이드 XML 미리 읽기
  // ZIP 안 슬라이드 목록을 presentation.xml.rels에서 순서대로 파악
  async function getFirstSlideXml(tplZip) {
    const presRels = await tplZip.file('ppt/_rels/presentation.xml.rels').async('string')
    const matches = [...presRels.matchAll(/Target="slides\/(slide\d+\.xml)"/g)]
    if (!matches.length) throw new Error('슬라이드를 찾을 수 없습니다.')
    // presentation.xml에서 sldIdLst 순서로 첫 번째 슬라이드 결정
    const presXml = await tplZip.file('ppt/presentation.xml').async('string')
    const idOrder = [...presXml.matchAll(/r:id="(rId\d+)"/g)].map(m => m[1])
    const relMap = {}
    for (const m of [...presRels.matchAll(/Id="(rId\d+)"[^>]*Target="slides\/(slide\d+\.xml)"/g)]) {
      relMap[m[1]] = m[2]
    }
    const firstFile = idOrder.map(rid => relMap[rid]).find(f => f) || matches[0][1]
    return {
      xml:  await tplZip.file(`ppt/slides/${firstFile}`).async('string'),
      file: firstFile,
    }
  }

  // size → { xml, tplZip } 맵 (없는 사이즈는 PERSON_2 fallback)
  const templateData = {}
  for (const size of [2, 4, 6, 9]) {
    const tplZip = templateZips[size] || templateZips[2]
    if (!tplZip) throw new Error('PERSON_2 템플릿이 업로드되지 않았습니다.')
    const { xml, file } = await getFirstSlideXml(tplZip)
    templateData[size] = { xml, file, zip: tplZip }
  }

  // ── 합본용 베이스 ZIP: PERSON_2 ZIP을 기반으로 사용 ──────────
  // (마스터/테마/레이아웃은 PERSON_2 것을 그대로 유지)
  const baseZip = templateZips[2]
  let presXml     = await baseZip.file('ppt/presentation.xml').async('string')
  let presRelsXml = await baseZip.file('ppt/_rels/presentation.xml.rels').async('string')
  let ctXml       = await baseZip.file('[Content_Types].xml').async('string')

  // 기존 슬라이드 모두 제거 (마스터/레이아웃은 유지)
  presXml     = presXml.replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/, '<p:sldIdLst></p:sldIdLst>')
  presRelsXml = presRelsXml.replace(/<Relationship\b[^/]*Type="[^"]*\/slide"[^/]*\/>/g, '')
  ctXml       = ctXml.replace(/<Override[^>]*presentationml\.slide\+xml[^>]*\/>/g, '')

  let maxRid   = 0; presRelsXml.replace(/Id="rId(\d+)"/g, (_, n) => { maxRid   = Math.max(maxRid,   +n); return _ })
  let maxSldId = 255; presXml.replace(/<p:sldId id="(\d+)"/g, (_, n) => { maxSldId = Math.max(maxSldId, +n); return _ })

  let newRels = '', newIds = '', newCt = ''

  const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main'
  const P_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main'

  // ── slideLayout 참조 보존: 원본 슬라이드의 .rels에서 꺼냄 ──
  async function getSlideLayoutRel(tplZip, slideFile) {
    const relsPath = `ppt/slides/_rels/${slideFile}.rels`
    const relsFile = tplZip.file(relsPath)
    if (relsFile) return await relsFile.async('string')
    // 없으면 기본 fallback
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout6.xml"/>'
      + '</Relationships>'
  }

  function shapeXfrm(sp) {
    const spPr = sp.getElementsByTagNameNS(P_NS, 'spPr')[0]
    if (!spPr) return null
    const xfrm = spPr.getElementsByTagNameNS(A_NS, 'xfrm')[0]
    if (!xfrm) return null
    const off = xfrm.getElementsByTagNameNS(A_NS, 'off')[0]
    const ext = xfrm.getElementsByTagNameNS(A_NS, 'ext')[0]
    if (!off || !ext) return null
    return { x: +off.getAttribute('x'), y: +off.getAttribute('y'), w: +ext.getAttribute('cx'), h: +ext.getAttribute('cy') }
  }

  // ── 런(run) 분산 placeholder 치환 엔진 ──────────────────────────
  // PPTX XML에서 [분야], [이름] 등이 여러 <a:r> 런에 분산될 수 있음
  // 예: <a:r>[</a:r><a:r>이름</a:r><a:r>]</a:r>
  //     <a:r>[ </a:r><a:r>감리이력</a:r><a:r>1 ]</a:r>
  //     <a:r>[IT</a:r><a:r>경력기간</a:r><a:r>]</a:r>
  // 접근: 단락(<a:p>) 내 모든 런의 텍스트를 이어붙여 [xxx] 찾고,
  //       해당 범위 런들을 첫 번째 런에 value로 합치고 나머지 런 제거

  // 단락 내 런 배열의 연결 텍스트에서 label 위치 찾기
  function findLabelInRuns(runs, label) {
    // runs: Array of {el, text} — <a:r> 요소와 텍스트
    const concat = runs.map(r => r.text).join('')
    let idx = -1
    while (true) {
      idx = concat.indexOf(label, idx + 1)
      if (idx === -1) break
      // label이 끝난 뒤가 다음 placeholder 시작이거나 공백이어야 노이즈 제거
      const after = concat[idx + label.length]
      if (after === undefined || after === ' ' || after === '[' || after === '\n') {
        return { concat, startIdx: idx, endIdx: idx + label.length }
      }
      // label이 더 긴 placeholder의 부분인 경우 skip (예: [이름] vs [이름없음])
    }
    // 마지막 시도: 정확히 끝
    idx = concat.lastIndexOf(label)
    if (idx !== -1 && concat.slice(idx) === label) {
      return { concat, startIdx: idx, endIdx: idx + label.length }
    }
    return null
  }

  // 단락의 런들에서 label을 찾아 value로 치환 (분산 런 포함)
  // 반환값: 치환 성공한 횟수
  function replaceLabelInParagraph(pEl, label, value) {
    const runs = Array.from(pEl.getElementsByTagNameNS(A_NS, 'r'))
    if (!runs.length) return 0
    const runData = runs.map(r => {
      const tEl = r.getElementsByTagNameNS(A_NS, 't')[0]
      return { el: r, tEl, text: tEl ? tEl.textContent : '' }
    })
    const concat = runData.map(r => r.text).join('')
    // 모든 occurrence 치환 (같은 단락에 같은 placeholder 여러 개 가능)
    let count = 0
    let searchFrom = 0
    while (true) {
      const pos = concat.indexOf(label, searchFrom)
      if (pos === -1) break
      searchFrom = pos + label.length

      // label이 걸쳐있는 런 범위 찾기
      let charAccum = 0
      let startRunIdx = -1, endRunIdx = -1
      let startCharInRun = 0, endCharInRun = 0
      for (let ri = 0; ri < runData.length; ri++) {
        const rLen = runData[ri].text.length
        if (startRunIdx === -1 && charAccum + rLen > pos) {
          startRunIdx = ri
          startCharInRun = pos - charAccum
        }
        if (endRunIdx === -1 && charAccum + rLen >= pos + label.length) {
          endRunIdx = ri
          endCharInRun = (pos + label.length) - charAccum
          break
        }
        charAccum += rLen
      }
      if (startRunIdx === -1 || endRunIdx === -1) break

      // startRun의 텍스트에서 label 이전 부분만 남기고 value 설정
      const startRun = runData[startRunIdx]
      const before = startRun.text.slice(0, startCharInRun)
      const afterEnd = runData[endRunIdx].text.slice(endCharInRun)

      if (startRunIdx === endRunIdx) {
        // 같은 런 안에 있는 경우
        if (startRun.tEl) startRun.tEl.textContent = before + value + afterEnd
      } else {
        // 여러 런에 걸친 경우: startRun에 value, 중간 런들 제거, endRun에 after
        if (startRun.tEl) startRun.tEl.textContent = before + value
        for (let ri = startRunIdx + 1; ri < endRunIdx; ri++) {
          if (runData[ri].el.parentNode) runData[ri].el.parentNode.removeChild(runData[ri].el)
        }
        if (endRunIdx > startRunIdx && runData[endRunIdx].tEl) {
          runData[endRunIdx].tEl.textContent = afterEnd
          if (!afterEnd && runData[endRunIdx].el.parentNode) {
            runData[endRunIdx].el.parentNode.removeChild(runData[endRunIdx].el)
          }
        }
      }
      count++
      // runData 갱신 (제거된 런 반영)
      break  // 단락당 1회 치환 (카드 분리는 단락 단위로 처리됨)
    }
    return count
  }

  // xmlDoc 전체에서 label을 모두 찾아 value로 치환 (공백 정규화 매칭)
  function replaceAllLabels(xmlDoc, label, value) {
    const paras = Array.from(xmlDoc.getElementsByTagNameNS(A_NS, 'p'))
    let count = 0
    paras.forEach(p => { count += replaceLabelInParagraphNorm(p, label, value) })
    return count
  }

  // 슬라이드에서 label이 몇 번 등장하는지 카운트
  function countLabel(xmlDoc, label) {
    const paras = Array.from(xmlDoc.getElementsByTagNameNS(A_NS, 'p'))
    let count = 0
    paras.forEach(p => {
      const concat = Array.from(p.getElementsByTagNameNS(A_NS, 'r'))
        .map(r => { const t = r.getElementsByTagNameNS(A_NS, 't')[0]; return t ? t.textContent : '' })
        .join('')
      let idx = -1
      while ((idx = concat.indexOf(label, idx + 1)) !== -1) count++
    })
    return count
  }

  // N번째(0-indexed) occurrence의 단락 반환
  function getParagraphOfOccurrence(xmlDoc, label, occIdx) {
    const paras = Array.from(xmlDoc.getElementsByTagNameNS(A_NS, 'p'))
    let found = 0
    for (const p of paras) {
      const concat = Array.from(p.getElementsByTagNameNS(A_NS, 'r'))
        .map(r => { const t = r.getElementsByTagNameNS(A_NS, 't')[0]; return t ? t.textContent : '' })
        .join('')
      if (concat.includes(label)) {
        if (found === occIdx) return p
        found++
      }
    }
    return null
  }

  // [이름] 단락 기준으로 카드 슬롯 인덱스 반환 (슬라이드 내 등장 순서, 공백 정규화 매칭)
  function getNameParaOccurrences(xmlDoc) {
    const paras = Array.from(xmlDoc.getElementsByTagNameNS(A_NS, 'p'))
    const result = []
    paras.forEach((p, pi) => {
      const concat = Array.from(p.getElementsByTagNameNS(A_NS, 'r'))
        .map(r => { const t = r.getElementsByTagNameNS(A_NS, 't')[0]; return t ? t.textContent : '' })
        .join('').replace(/\s+/g, '')
      if (concat.includes('[이름]')) result.push({ para: p, paraIdx: pi })
    })
    return result
  }

  // 공백 정규화 치환 엔진: 런 concat을 공백 제거 후 label(공백 제거)을 탐색,
  // 실제로는 원본 런에서 해당 범위를 찾아 value로 치환
  // 예: "[ 감리이력1 ]" → normLabel("[감리이력1]")으로 위치를 찾되,
  //     실제 런 범위를 공백 포함 원본 기준으로 계산하여 제거
  function replaceLabelInParagraphNorm(pEl, label, value) {
    const runs = Array.from(pEl.getElementsByTagNameNS(A_NS, 'r'))
    if (!runs.length) return 0
    const runData = runs.map(r => {
      const tEl = r.getElementsByTagNameNS(A_NS, 't')[0]
      return { el: r, tEl, text: tEl ? tEl.textContent : '' }
    })

    // 원본 concat과 공백제거 concat을 모두 계산
    const origConcat = runData.map(r => r.text).join('')
    const normConcat = origConcat.replace(/\s+/g, '')
    const normLabelStr = label.replace(/\s+/g, '')

    // 정규화 concat에서 label 위치 탐색
    const normPos = normConcat.indexOf(normLabelStr)
    if (normPos === -1) return 0

    // 정규화 위치 → 원본 concat 위치로 역매핑
    // normConcat[i]는 origConcat에서 공백 제거 후의 i번째 문자
    // origPos: normConcat의 normPos번째 비공백 문자가 origConcat의 몇 번째인지
    let normIdx = 0, origStart = -1, origEnd = -1
    for (let oi = 0; oi < origConcat.length; oi++) {
      if (!/\s/.test(origConcat[oi])) {
        if (normIdx === normPos) origStart = oi
        if (normIdx === normPos + normLabelStr.length - 1) { origEnd = oi + 1; break }
        normIdx++
      }
    }
    // origEnd가 끝 공백까지 포함하도록 확장 ("]" 뒤 공백 포함)
    if (origEnd === -1) return 0

    // 원본 concat 위치 → 런 인덱스 매핑
    let charAccum = 0
    let startRunIdx = -1, endRunIdx = -1
    let startCharInRun = 0, endCharInRun = 0
    for (let ri = 0; ri < runData.length; ri++) {
      const rLen = runData[ri].text.length
      if (startRunIdx === -1 && charAccum + rLen > origStart) {
        startRunIdx = ri
        startCharInRun = origStart - charAccum
      }
      if (endRunIdx === -1 && charAccum + rLen >= origEnd) {
        endRunIdx = ri
        endCharInRun = origEnd - charAccum
        break
      }
      charAccum += rLen
    }
    if (startRunIdx === -1 || endRunIdx === -1) return 0

    const startRun = runData[startRunIdx]
    const before = startRun.text.slice(0, startCharInRun)
    const afterEnd = runData[endRunIdx].text.slice(endCharInRun)

    if (startRunIdx === endRunIdx) {
      if (startRun.tEl) startRun.tEl.textContent = before + value + afterEnd
    } else {
      if (startRun.tEl) startRun.tEl.textContent = before + value
      for (let ri = startRunIdx + 1; ri < endRunIdx; ri++) {
        if (runData[ri].el.parentNode) runData[ri].el.parentNode.removeChild(runData[ri].el)
      }
      if (runData[endRunIdx].tEl) {
        runData[endRunIdx].tEl.textContent = afterEnd
        if (!afterEnd && runData[endRunIdx].el.parentNode) {
          runData[endRunIdx].el.parentNode.removeChild(runData[endRunIdx].el)
        }
      }
    }
    return 1
  }

  // ── 슬라이드 생성 루프 ──────────────────────────────────────────
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]
    const size = page.sheetSize
    const { xml: tplXml, file: tplFile, zip: tplZip } = templateData[size]
    const meta = PHOTO_LAYOUT_META[size]
    const fname = `photoSlide${i + 1}.xml`

    const xmlDoc = new DOMParser().parseFromString(tplXml, 'application/xml')
    const spTree = xmlDoc.getElementsByTagNameNS(P_NS, 'spTree')[0]
    const shapeEls = Array.from(spTree.childNodes).filter(n => n.nodeType === 1 && (n.localName === 'sp' || n.localName === 'cxnSp'))

    // ── 카드 배경 도형 자동 탐지: N개 정확히 반복되는 도형 중 면적 최대인 것 ──
    const N = meta.rows * meta.cols
    const xfrmOf = new Map()
    const sizeGroups = {}
    shapeEls.forEach(sp => {
      const xf = shapeXfrm(sp)
      if (!xf) return
      xfrmOf.set(sp, xf)
      const key = xf.w + 'x' + xf.h;
      (sizeGroups[key] = sizeGroups[key] || []).push(xf)
    })
    const cardCandidates = Object.entries(sizeGroups).filter(([, arr]) => arr.length === N)
    cardCandidates.sort((a, b) => (b[1][0].w * b[1][0].h) - (a[1][0].w * a[1][0].h))
    const cardBoxes = cardCandidates.length ? cardCandidates[0][1] : []

    const MARGIN_X = 60000, MARGIN_TOP = 400000, MARGIN_BOTTOM = 60000
    function findCardIndex(pt) {
      for (let ci = 0; ci < cardBoxes.length; ci++) {
        const b = cardBoxes[ci]
        if (pt.x >= b.x - MARGIN_X && pt.x <= b.x + b.w + MARGIN_X &&
            pt.y >= b.y - MARGIN_TOP && pt.y <= b.y + b.h + MARGIN_BOTTOM) return ci
      }
      return -1
    }
    const cardShapes = cardBoxes.map(() => [])
    shapeEls.forEach(sp => {
      const xf = xfrmOf.get(sp)
      if (!xf) return
      const idx = findCardIndex({ x: xf.x + xf.w / 2, y: xf.y + xf.h / 2 })
      if (idx >= 0) cardShapes[idx].push(sp)
    })

    // ── [이름] 단락 기준으로 슬롯 순서 결정 (런 분산 처리) ──
    const nameParaOccurrences = getNameParaOccurrences(xmlDoc)

    // ── 미배정 슬롯 카드 삭제 ──
    // [이름] 단락이 속한 <a:p>의 조상 <p:sp>를 찾아 cardIndex 판별
    const cardsToRemove = new Set()
    nameParaOccurrences.forEach(({ para }, idx) => {
      const slot = meta.orderIndexToSlot[idx]
      if (page.slotPeople[slot]) return
      // para(<a:p>) 조상에서 <p:sp> 찾기
      let sp = para
      while (sp && !(sp.nodeType === 1 && sp.localName === 'sp')) sp = sp.parentNode
      const xf = sp && xfrmOf.get(sp)
      if (xf) {
        const ci = findCardIndex({ x: xf.x + xf.w / 2, y: xf.y + xf.h / 2 })
        if (ci >= 0) cardsToRemove.add(ci)
      }
    })
    cardsToRemove.forEach(ci => cardShapes[ci].forEach(sp => { if (sp.parentNode) sp.parentNode.removeChild(sp) }))

    // ── 슬라이드 전체 [제목] 치환 (groupFilter별 목차명으로 치환) ──
    replaceAllLabels(xmlDoc, '[제목]', page.slideTitle || '')

    // ── 카드별 placeholder 치환 (런 분산 처리 엔진 사용) ──
    // ⚠️ 중요: 치환 전에 모든 단락 참조를 미리 수집해야 함
    //          치환 후 xmlDoc을 재스캔하면 이미 치환된 단락이 사라져 idx가 밀림
    // ⚠️ 템플릿에서 [ 감리이력1 ] 처럼 괄호 안에 공백이 있을 수 있으므로
    //    정규화(공백 제거)된 concat 텍스트로 매핑 label을 탐색함
    const ALL_LABELS = [
      '[분야]', '[이름]', '[감리원등급]', '[자격구분]', '[자격요약]',
      '[감리횟수]', '[자격수]', '[감리경력]', '[IT경력기간]', '[IT경력]',
    ]
    for (let ri = 1; ri <= 10; ri++) ALL_LABELS.push('[감리이력' + ri + ']')

    // 단락 concat에서 공백 제거 후 label(공백 제거)과 매칭
    // 실제 치환 시엔 원본 concat에서 실제 텍스트를 정확히 찾아 대체
    function normLabel(s) { return s.replace(/\s+/g, '') }
    function paraMatchesLabel(pEl, label) {
      const concat = Array.from(pEl.getElementsByTagNameNS(A_NS, 'r'))
        .map(r => { const t = r.getElementsByTagNameNS(A_NS, 't')[0]; return t ? t.textContent : '' })
        .join('')
      return concat.replace(/\s+/g, '').includes(normLabel(label))
    }

    // 치환 전에 라벨별 단락 목록 미리 수집 (0-indexed occurrence 순서, 공백 무관 매칭)
    const preFetchedParas = {}
    ALL_LABELS.forEach(label => {
      const paras = Array.from(xmlDoc.getElementsByTagNameNS(A_NS, 'p'))
      const list = []
      paras.forEach(p => { if (paraMatchesLabel(p, label)) list.push(p) })
      preFetchedParas[label] = list
    })

    nameParaOccurrences.forEach((_nameOcc, idx) => {
      const slot = meta.orderIndexToSlot[idx]
      const p = page.slotPeople[slot]
      if (!p) return
      const pr = p.profile || {}

      // 직접 매핑 필드: 미리 수집된 idx번째 단락에 치환
      const directMap = {
        '[분야]':       p.field || '',
        '[이름]':       p.name  || '',
        '[감리원등급]':  p.grade || '',
        '[자격구분]':   pr.자격구분   || '',
        '[자격요약]':   pr.자격요약   || '',
        '[감리횟수]':   pr.감리횟수   != null ? String(pr.감리횟수)   : '',
        '[자격수]':     pr.자격수     != null ? String(pr.자격수)     : '',
        '[감리경력]':   pr.감리경력   || '',
        '[IT경력기간]': pr.IT경력기간 || '',
        '[IT경력]':     pr.IT경력     || '',
      }
      Object.entries(directMap).forEach(([label, value]) => {
        const paraList = preFetchedParas[label]
        const para = paraList && paraList[idx]
        if (para) replaceLabelInParagraphNorm(para, label, value)
      })

      // [감리이력1]~[감리이력10] 치환
      const 실적List = pr.실적 || []
      for (let ri = 1; ri <= 10; ri++) {
        const label = '[감리이력' + ri + ']'
        const value = 실적List[ri - 1] || ''
        const paraList = preFetchedParas[label]
        const para = paraList && paraList[idx]
        if (para) replaceLabelInParagraphNorm(para, label, value)
      }
    })

    // ── 슬라이드 XML 저장 ──
    const slideRelsXml = await getSlideLayoutRel(tplZip, tplFile)
    baseZip.file(`ppt/slides/${fname}`, new XMLSerializer().serializeToString(xmlDoc))
    baseZip.file(`ppt/slides/_rels/${fname}.rels`, slideRelsXml)

    const rid = `rId${++maxRid}`
    const sldId = ++maxSldId
    newRels += `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/${fname}"/>`
    newIds  += `<p:sldId id="${sldId}" r:id="${rid}"/>`
    newCt   += `<Override PartName="/ppt/slides/${fname}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
  }

  presRelsXml = presRelsXml.replace('</Relationships>', newRels + '</Relationships>')
  presXml     = presXml.replace('</p:sldIdLst>',        newIds  + '</p:sldIdLst>')
  ctXml       = ctXml.replace('</Types>',               newCt   + '</Types>')
  baseZip.file('ppt/presentation.xml',          presXml)
  baseZip.file('ppt/_rels/presentation.xml.rels', presRelsXml)
  baseZip.file('[Content_Types].xml',            ctXml)
  return baseZip
}

// ── downloadPhotoAssignPptx ─────────────────────────────────────
// 체크리스트 설정을 읽어 pages 배열을 구성한 뒤 buildPhotoPptxFromTemplate 호출
// opts.groupFilter:
//   'AUDITOR'      → 감리원(audit)만                     (AUDITOR_PROFILE, 3.1)
//   'CORE_EXPERT'  → 핵심기술(core)만                    (CORE_EXPERT_PROFILE, 3.2)
//   'EXPERT'       → 필수기술·보안·테스터(required+security+tester)만  (EXPERT_PROFILE, 3.3)
//   undefined      → 전체 (기존 동작 그대로)
async function downloadPhotoAssignPptx(btn, opts) {
  opts = opts || {}
  if (typeof JSZip === 'undefined') { alert('JSZip 라이브러리 로딩 중입니다. 잠시 후 다시 시도해주세요.'); return null }
  setBtnState(btn, true)
  try {
    const cache = buildPhotoAssignCache()
    if (!cache) { showAutoAlert('❌ 인력 데이터가 없습니다.', false); return null }

    // ── groupFilter에 따라 처리할 카테고리 키 결정 ──
    const gf = opts.groupFilter
    let targetAuditPeople = []
    let targetCatKeys     = []   // 전문가 계열 처리 대상 key 목록
    let slideTitle        = ''   // [제목] placeholder 치환값

    if (!gf || gf === 'ALL') {
      // 기존 동작: 감리원 + 전문가 전체
      targetAuditPeople = cache.audit || []
      targetCatKeys = ['core', 'required', 'security', 'tester']
      slideTitle = '전문 역량'
    } else if (gf === 'AUDITOR') {
      // 3.1 단계 감리원의 전문 역량
      targetAuditPeople = cache.audit || []
      targetCatKeys = []
      slideTitle = '3.1 단계 감리원의 전문 역량'
    } else if (gf === 'CORE_EXPERT') {
      // 3.2 핵심기술 점검팀의 전문 역량
      targetAuditPeople = []
      targetCatKeys = ['core']
      slideTitle = '3.2 핵심기술 점검팀의 전문 역량'
    } else if (gf === 'EXPERT') {
      // 3.3 필수기술·보안·테스트팀 전문 역량
      targetAuditPeople = []
      targetCatKeys = ['required', 'security', 'tester']
      slideTitle = '3.3 필수기술·보안·테스트팀 전문 역량'
    }

    // 체크리스트 설정 읽기 (모달 미열림 시 기본값 fallback)
    let cfg = {}
    try { cfg = readPhotoAssignConfig() } catch (e) { cfg = {} }
    if (!Object.keys(cfg).length) {
      PHOTO_CATS.forEach(c => {
        if (c.key === 'audit') return
        const cnt = (cache[c.key] || []).length
        if (cnt > 0) cfg[c.key] = { sheet: suggestSheetSize(cnt), include: new Set() }
      })
    }

    // pages 배열 구성: { sheetSize, slotPeople: { slotNum: {name, field, grade, personnelId} } }
    const pages = []
    const pidMap = parsedData.personnelIdMap || {}

    // 감리원: 2인 장표 고정
    const auditPeople = targetAuditPeople.map(p => ({
      name: p.name,
      field: (parsedData.personFieldMap || {})[p.name] || '감리원',
      grade: getEffectiveGrade(p.name),
      personnelId: pidMap[p.name] || 0,
    }))
    if (auditPeople.length) {
      const sheetSize = 2
      const meta = PHOTO_LAYOUT_META[sheetSize]
      const fillOrder = computeFillOrder(meta.rows, meta.cols)
      for (let start = 0; start < auditPeople.length; start += sheetSize) {
        const pagePeople = auditPeople.slice(start, start + sheetSize)
        const slotPeople = {}
        pagePeople.forEach((p, i) => { slotPeople[fillOrder[i]] = p })
        pages.push({ sheetSize, slotPeople, slideTitle })
      }
    }

    // 전문가/테스터: union-find 그룹화 (targetCatKeys에 있는 것만)
    const filteredCfg = {}
    targetCatKeys.forEach(k => { if (cfg[k]) filteredCfg[k] = cfg[k] })

    const catGroups = groupPhotoCategories(filteredCfg)
    for (const catKeys of catGroups) {
      const firstCat = PHOTO_CATS.find(c => catKeys.includes(c.key))
      const sheetSize = (cfg[firstCat.key] || {}).sheet || suggestSheetSize(1)
      const meta = PHOTO_LAYOUT_META[sheetSize]
      const fillOrder = computeFillOrder(meta.rows, meta.cols)

      const people = []
      catKeys.forEach(catKey => {
        const catLabel = PHOTO_CATS.find(c => c.key === catKey).label.replace(/^\S+\s/, '')
        ;(cache[catKey] || []).forEach(p => {
          people.push({
            name: p.name,
            field: (parsedData.personFieldMap || {})[p.name] || catLabel,
            grade: getEffectiveGrade(p.name),
            personnelId: pidMap[p.name] || 0,
          })
        })
      })
      if (!people.length) continue

      for (let start = 0; start < people.length; start += sheetSize) {
        const pagePeople = people.slice(start, start + sheetSize)
        const slotPeople = {}
        pagePeople.forEach((p, i) => { slotPeople[fillOrder[i]] = p })
        pages.push({ sheetSize, slotPeople, slideTitle })
      }
    }

    if (!pages.length) { showAutoAlert('❌ 생성할 인력이 없습니다.', false); return null }

    // ── photo-profile API 호출: 등장하는 모든 인원의 profile 로드 ──
    const proposalId = parsedData.proposalId || 0
    const allPeople = []
    pages.forEach(pg => Object.values(pg.slotPeople).forEach(p => { if (!allPeople.find(x => x.personnelId === p.personnelId)) allPeople.push(p) }))
    const profileMap = {}
    await Promise.all(
      allPeople
        .filter(p => p.personnelId)
        .map(async p => {
          try {
            const res = await fetch(`/api/personnel/${p.personnelId}/photo-profile?projectId=${proposalId}`)
            if (res.ok) {
              const json = await res.json()
              if (json.ok) profileMap[p.personnelId] = json.data
            }
          } catch (e) { console.warn('photo-profile 로드 실패:', p.name, e) }
        })
    )
    // slotPeople에 profile 주입
    pages.forEach(pg => {
      Object.values(pg.slotPeople).forEach(p => {
        p.profile = profileMap[p.personnelId] || {}
      })
    })

    // ── templateZips 로드: AUDITOR_PROFILE(2인 고정) 또는 전체 4종 ──
    // PptMenuRegistry에서 AUDITOR_PROFILE(또는 *_PROFILE) 메뉴의 templates 꺼내기
    let templateZips = null
    try {
      const registry = await PptMenuRegistry.load()
      // 사용할 메뉴 코드: groupFilter 별로 다를 수 있으나 템플릿은 공통으로 AUDITOR_PROFILE 메뉴에서 로드
      const profileMenuCode = gf === 'CORE_EXPERT' ? 'CORE_EXPERT_PROFILE'
                            : gf === 'EXPERT'       ? 'EXPERT_PROFILE'
                            : 'AUDITOR_PROFILE'
      const menu = registry.byCode[profileMenuCode]
      const tpls = menu && Array.isArray(menu.templates) ? menu.templates : []
      // variant_code에서 PERSON_2/4/6/9 구분 (DB 컬럼명: variant_code)
      const VARIANT_RE = /PERSON[_-]?(\d+)/i
      const b64Map = {}
      tpls.forEach(t => {
        if (!t.pptx_b64_key) return
        const vn = t.variant_code || t.variant_name || t.template_name || ''
        const m = vn.match(VARIANT_RE)
        if (m) b64Map[Number(m[1])] = t.pptx_b64_key
      })
      // b64 → JSZip 변환
      const sizes = [2, 4, 6, 9]
      // PERSON_2가 없으면 에러, 나머지는 없으면 PERSON_2로 fallback
      if (!b64Map[2]) {
        showAutoAlert('❌ PERSON_2 템플릿을 업로드해주세요.', false)
        return null
      }
      // 없는 사이즈는 PERSON_2 b64로 fallback
      sizes.forEach(s => { if (!b64Map[s]) b64Map[s] = b64Map[2] })
      templateZips = {}
      await Promise.all(sizes.map(async s => {
        const b64 = b64Map[s]
        const bin = atob(b64)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        templateZips[s] = await JSZip.loadAsync(bytes)
      }))
    } catch (e) {
      console.error('templateZips 로드 실패:', e)
      showAutoAlert('❌ 사진장표 템플릿 로드 실패: ' + e.message, false)
      return null
    }

    const zip = await buildPhotoPptxFromTemplate(pages, templateZips)
    if (opts.returnZip) return { zip }

    const today = new Date().toISOString().slice(0, 10)
    const blob = await zip.generateAsync({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `사진장표_${today}.pptx`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    showAutoAlert('✅ 사진장표 생성 완료', true)
    return null
  } catch (e) {
    console.error(e)
    showAutoAlert('❌ 생성 실패: ' + e.message, false)
    if (opts.returnZip) throw e
    return null
  }
  finally { setBtnState(btn, false) }
}

// ── 요약표 PPT ──────────────────────────────────────────────
async function downloadSummaryTablePptx(btn, opts) {
  opts = opts || {}
  if (typeof PptxGenJS === 'undefined') { alert('PPT 라이브러리 로딩 중입니다.'); return null }
  setBtnState(btn, true)
  try {
    const extraSet = getExtraSet()
    const { stages } = parsedData
    const extraStages = stages.filter(s => extraSet.has(s.stage))
    const baselineStages = stages.filter(s => !extraSet.has(s.stage))
    const baselineMD = baselineStages.reduce((s, st) => s + (st['감리원'] ? st['감리원'].total : 0), 0)
    const extraMD = extraStages.reduce((s, st) => s + (st['감리원'] ? st['감리원'].total : 0), 0)
    let expertMD = 0, testerMD = 0
    stages.forEach(s => (s['전문가'] ? s['전문가'].people : []).forEach(p => {
      const md = p.pre + p.audit + p.post
      const grp = (parsedData.personGradeMap[p.name] || {}).group || ''
      if (grp === '테스터') testerMD += md; else expertMD += md
    }))
    const totalMD = baselineMD + extraMD + expertMD + testerMD
    const baselineNames = baselineStages.map(s => s.stage)
    const baselineDaysSum = baselineStages.reduce((s, st) => s + (st.days || 0), 0)
    const extraNames = extraStages.map(s => s.stage)
    const pres = new PptxGenJS(); pres.layout = 'LAYOUT_WIDE'
    const FONT_BOLD = 'KoPub돋움체 Bold', FONT_MEDIUM = 'KoPub돋움체 Medium'
    const bd = { pt: 0.5, color: 'BFBFBF' }, bd0 = { type: 'none' }
    const bMid = [bd, bd, bd, bd], bLeft = [bd, bd, bd, bd0], bRight = [bd, bd0, bd, bd]
    const colW = [1.2, 2.3, 0.8, 5.3]
    const base = e => Object.assign({ fontFace: FONT_MEDIUM, fontSize: 10, color: '222222', valign: 'middle', margin: [0.04, 0.04, 0.04, 0.1] }, e)
    const headOpt = { fontFace: FONT_BOLD, fontSize: 11, color: '222222', bold: true, fill: { color: 'D2F0FF' }, align: 'center', valign: 'middle', margin: [0.04, 0.04, 0.04, 0.04] }
    const fulfillOpt = { fontFace: FONT_BOLD, fontSize: 12, color: 'FFFFFF', bold: true, fill: { color: '1482CD' }, align: 'center', valign: 'middle' }
    const mdText = '감리원: ' + baselineMD + (extraMD > 0 ? ' + 추가 ' + extraMD : '') + ' MD\n전문가: ' + expertMD + ' MD\n테스터: ' + testerMD + ' MD\n합계: ' + totalMD + ' MD'
    const methodText = baselineNames.length + '단계 감리 (현장감리 ' + baselineDaysSum + '일)' + (extraNames.length > 0 ? ' + 추가 단계: ' + extraNames.join(', ') : '')
    const tRows = [
      [{ text: '요청 구분', options: Object.assign({}, headOpt, { border: bLeft }) }, { text: '제안요청 내용 (RFP)', options: Object.assign({}, headOpt, { border: bMid }) }, { text: '충족 여부', options: Object.assign({}, headOpt, { border: bMid }) }, { text: '제안 내역', options: Object.assign({}, headOpt, { border: bRight }) }],
      [{ text: '감리 방법 및 일수', options: base({ bold: true, align: 'center', fill: { color: 'F2F2F2' }, border: bLeft }) }, { text: baselineNames.length + '단계 감리 실시\n최소 감리 일수: ' + baselineDaysSum + '일', options: base({ align: 'l', border: bMid }) }, { text: '충족', options: Object.assign({}, fulfillOpt, { border: bMid }) }, { text: methodText, options: base({ align: 'l', border: bRight }) }],
      [{ text: '투입 공수', options: base({ bold: true, align: 'center', fill: { color: 'F2F2F2' }, border: bLeft }) }, { text: '요청 공수 이상 투입', options: base({ align: 'l', border: bMid }) }, { text: '충족', options: Object.assign({}, fulfillOpt, { border: bMid }) }, { text: mdText, options: base({ align: 'l', border: bRight }) }],
      [{ text: '감리 인력', options: base({ bold: true, align: 'center', fill: { color: 'F2F2F2' }, border: bLeft }) }, { text: '요건에 맞는 감리원 구성', options: base({ align: 'l', border: bMid }) }, { text: '충족', options: Object.assign({}, fulfillOpt, { border: bMid }) }, { text: computeAssignRows().map(r => r.grade + ' ' + r.name + ' (' + (r.field || '분야미상') + ')').join('\n'), options: base({ align: 'l', border: bRight }) }],
    ]
    const rowH = [0.22, 0.8, 0.8, Math.max(0.8, computeAssignRows().length * 0.22)]
    const sld = pres.addSlide()
    sld.addTable(tRows, { x: 1.8, y: 1.4, w: colW.reduce((a, b) => a + b, 0), colW, rowH })
    if (opts.returnZip) {
      const ab = await pres.write({ outputType: 'arraybuffer' })
      const z = new JSZip(); await z.loadAsync(ab); return { zip: z }
    }
    await pres.writeFile({ fileName: '요약표_' + (parsedData.projectTitle || '').slice(0, 10) + '.pptx' })
    showAutoAlert('✅ 요약표 생성 완료', true)
    return null
  } catch (e) { showAutoAlert('❌ 생성 실패: ' + e.message, false); return null }
  finally { setBtnState(btn, false) }
}

// ── 전체 합본 PPT ───────────────────────────────────────────
// ppt-engine.js의 generateProposalPpt()를 우선 사용하고,
// 메뉴 DB가 없거나 실패 시 레거시 고정 순서 방식으로 fallback
async function downloadAllPptx(btn) {
  if (typeof PptxGenJS === 'undefined' || typeof JSZip === 'undefined') { alert('PPT 라이브러리 로딩 중입니다. 잠시 후 다시 시도해주세요.'); return }
  setBtnState(btn, true)
  showAutoAlert('⏳ 생성 중... 완료될 때까지 잠시 기다려주세요.', false)
  try {
    // ── 메뉴 기반 Composer 시도 ─────────────────────────────────
    let usedMenuComposer = false
    if (typeof generateProposalPpt === 'function') {
      try {
        const vm = typeof buildProjectViewModel === 'function' ? buildProjectViewModel(parsedData) : null
        const finalZip = await generateProposalPpt(vm)
        const blob = await finalZip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', compression: 'DEFLATE', compressionOptions: { level: 6 } })
        const d = new Date()
        const dateStr = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0')
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = '자동화PPT_' + (parsedData.projectTitle || '').slice(0, 10) + '_' + dateStr + '.pptx'; a.click()
        setTimeout(() => URL.revokeObjectURL(url), 2000)
        showAutoAlert('✅ 자동화 PPT 생성 완료!', true)
        usedMenuComposer = true
      } catch (menuErr) {
        console.warn('[downloadAllPptx] 메뉴 Composer 실패 → 레거시 방식으로 fallback:', menuErr.message)
      }
    }
    if (usedMenuComposer) return

    // ── 레거시 고정 순서 방식 (fallback) ────────────────────────
    const parts = await Promise.all([
      downloadDetailSchedule1Pptx(null, { returnZip: true }),
      downloadAssignPptx(null, { returnZip: true }),
      downloadPhotoAssignPptx(null, { returnZip: true }),
      downloadSummaryTablePptx(null, { returnZip: true }),
    ])
    const usable = parts.filter(p => p && p.zip)
    if (!usable.length) { showAutoAlert('❌ 생성할 슬라이드가 없습니다.', false); return }
    const baseZip = usable[0].zip
    let presXml = await baseZip.file('ppt/presentation.xml').async('string')
    let presRelsXml = await baseZip.file('ppt/_rels/presentation.xml.rels').async('string')
    let ctXml = await baseZip.file('[Content_Types].xml').async('string')
    let maxRid = 0; presRelsXml.replace(/Id="rId(\d+)"/g, (_, n) => { maxRid = Math.max(maxRid, +n); return _ })
    let maxSldId = 255; presXml.replace(/<p:sldId id="(\d+)"/g, (_, n) => { maxSldId = Math.max(maxSldId, +n); return _ })
    let newRels = '', newIds = '', newCt = '', sc = 0
    for (let i = 1; i < usable.length; i++) {
      const srcZip = usable[i].zip
      const srcRelsXml = await srcZip.file('ppt/_rels/presentation.xml.rels').async('string')
      const relMap = {}
      srcRelsXml.replace(/<Relationship\b[^>]*\/>/g, tag => {
        const id = tag.match(/\bId="([^"]+)"/)?.[1]
        const tgt = tag.match(/\bTarget="([^"]+)"/)?.[1]
        const type = tag.match(/\bType="([^"]+)"/)?.[1] || ''
        if (id && tgt && type.includes('slide') && !type.includes('slideLayout') && !type.includes('slideMaster')) relMap[id] = tgt
        return tag
      })
      for (const [, tgt] of Object.entries(relMap)) {
        const xml = await srcZip.file('ppt/' + tgt).async('string').catch(() => null)
        if (!xml) continue
        const relsPath = 'ppt/' + tgt.replace(/([^/]+)$/, '_rels/$1.rels')
        const rels = await srcZip.file(relsPath).async('string').catch(() => null)
        const newName = 'slideM' + (++sc) + '.xml'
        baseZip.file('ppt/slides/' + newName, xml)
        if (rels) baseZip.file('ppt/slides/_rels/' + newName + '.rels', rels)
        const rid = 'rId' + (++maxRid); const sldId = ++maxSldId
        newRels += '<Relationship Id="' + rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/' + newName + '"/>'
        newIds += '<p:sldId id="' + sldId + '" r:id="' + rid + '"/>'
        newCt += '<Override PartName="/ppt/slides/' + newName + '" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'
      }
    }
    presRelsXml = presRelsXml.replace('</Relationships>', newRels + '</Relationships>')
    presXml = presXml.replace('</p:sldIdLst>', newIds + '</p:sldIdLst>')
    ctXml = ctXml.replace('</Types>', newCt + '</Types>')
    baseZip.file('ppt/presentation.xml', presXml)
    baseZip.file('ppt/_rels/presentation.xml.rels', presRelsXml)
    baseZip.file('[Content_Types].xml', ctXml)
    const blob = await baseZip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', compression: 'DEFLATE', compressionOptions: { level: 6 } })
    const url = URL.createObjectURL(blob)
    const d = new Date()
    const dateStr = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0')
    const a = document.createElement('a'); a.href = url; a.download = '자동화PPT_' + (parsedData.projectTitle || '').slice(0, 10) + '_' + dateStr + '.pptx'; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
    showAutoAlert('✅ 자동화 PPT 생성 완료!', true)
  } catch (e) { showAutoAlert('❌ 생성 실패: ' + e.message, false); console.error(e) }
  finally { setBtnState(btn, false) }
}

// ── 인원 상세 모달 ──────────────────────────────────────────
async function openPersonModal(personnelId) {
  document.getElementById('personModal').classList.remove('hidden')
  document.getElementById('personModalBody').innerHTML =
    '<div class="flex justify-center py-8"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div></div>'
  try {
    const res = await fetch('/api/personnel/' + personnelId)
    const json = await res.json()
    if (!json.ok) throw new Error(json.error)
    const { person, certs, auditHistory } = json.data
    const certRows = certs.map(c =>
      '<tr class="border-t border-slate-100 text-xs"><td class="px-3 py-1.5 text-slate-600">' + (c.cert_name || '-') + '</td><td class="px-3 py-1.5 text-center text-slate-500">' + (c.cert_no || '-') + '</td><td class="px-3 py-1.5 text-center text-slate-500">' + (c.cert_year || '-') + '</td></tr>'
    ).join('')
    const auditRows = auditHistory.slice(0, 10).map(h =>
      '<tr class="border-t border-slate-100 text-xs"><td class="px-3 py-1.5 text-slate-500">' + (h.audit_yearmonth || '-') + '</td><td class="px-3 py-1.5 text-slate-700">' + (h.project_name || '-') + '</td><td class="px-3 py-1.5 text-slate-500">' + (h.domain || '-') + '</td><td class="px-3 py-1.5 text-slate-500">' + (h.role || '-') + '</td></tr>'
    ).join('')
    document.getElementById('personModalTitle').textContent = person.name + ' — 인원 정보'
    let html = '<div class="grid grid-cols-2 gap-3 mb-5 text-sm">'
    html += '<div class="bg-slate-50 rounded-xl p-3"><span class="text-slate-400 text-xs block mb-0.5">직위</span><span class="font-medium">' + (person.position || '-') + '</span></div>'
    html += '<div class="bg-slate-50 rounded-xl p-3"><span class="text-slate-400 text-xs block mb-0.5">소속</span><span class="font-medium">' + (person.company || '-') + '</span></div>'
    html += '<div class="bg-slate-50 rounded-xl p-3"><span class="text-slate-400 text-xs block mb-0.5">감리등급</span><span class="font-medium">' + (person.auditor_grade || '-') + '</span></div>'
    html += '<div class="bg-slate-50 rounded-xl p-3"><span class="text-slate-400 text-xs block mb-0.5">자격번호</span><span class="font-medium">' + (person.auditor_cert_no || '-') + '</span></div>'
    html += '</div>'
    if (certs.length > 0) {
      html += '<div class="mb-4"><h4 class="font-semibold text-slate-700 text-sm mb-2"><i class="fas fa-certificate mr-1 text-amber-500"></i>자격증 (' + certs.length + '건)</h4>'
      html += '<table class="w-full text-xs rounded-xl overflow-hidden border border-slate-200"><thead><tr class="bg-slate-50 text-slate-500"><th class="px-3 py-1.5 text-left">자격명</th><th class="px-3 py-1.5 text-center">자격번호</th><th class="px-3 py-1.5 text-center">취득연도</th></tr></thead><tbody>' + certRows + '</tbody></table></div>'
    }
    if (auditHistory.length > 0) {
      html += '<div><h4 class="font-semibold text-slate-700 text-sm mb-2"><i class="fas fa-history mr-1 text-indigo-500"></i>감리실적 (최근 10건 / 전체 ' + auditHistory.length + '건)</h4>'
      html += '<table class="w-full text-xs rounded-xl overflow-hidden border border-slate-200"><thead><tr class="bg-slate-50 text-slate-500"><th class="px-3 py-1.5 text-left">연월</th><th class="px-3 py-1.5 text-left">사업명</th><th class="px-3 py-1.5 text-left">분야</th><th class="px-3 py-1.5 text-left">역할</th></tr></thead><tbody>' + auditRows + '</tbody></table>'
      if (auditHistory.length > 10) html += '<p class="text-xs text-slate-400 mt-1 text-right">... 외 ' + (auditHistory.length - 10) + '건</p>'
      html += '</div>'
    } else {
      html += '<p class="text-slate-400 text-sm text-center py-4">감리실적 없음</p>'
    }
    document.getElementById('personModalBody').innerHTML = html
  } catch (e) {
    document.getElementById('personModalBody').innerHTML =
      '<p class="text-red-500 text-sm text-center py-4">불러오기 실패: ' + e.message + '</p>'
  }
}
function closePersonModal() { document.getElementById('personModal').classList.add('hidden') }

// ── K 감리이력 키워드 매칭 모달 ─────────────────────────────
async function openKModal(personnelId, projectId, personName) {
  document.getElementById('kModal').classList.remove('hidden')
  document.getElementById('kModalTitle').textContent = personName + ' — 감리이력 키워드 매칭'
  document.getElementById('kModalBody').innerHTML =
    '<div class="flex justify-center py-8"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500"></div></div>'
  try {
    const res = await fetch('/api/personnel/' + personnelId + '/audit-match?projectId=' + projectId)
    const json = await res.json()
    if (!json.ok) throw new Error(json.error)
    const { keywords, rows, mappingMap, kw_matched_count, domain_rows_count } = json
    const kwTags = keywords.map((k, i) => {
      const cls = i < 3 ? 'bg-teal-50 border-teal-300 text-teal-700 font-semibold' : 'bg-slate-50 border-slate-200 text-slate-500'
      const kwText = mappingMap[k.keyword]
        ? '<span class="line-through text-slate-300">' + k.keyword + '</span><span class="ml-1">' + mappingMap[k.keyword] + '</span>'
        : k.keyword
      return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ' + cls + '"><span class="text-slate-400">' + (i + 1) + '.</span>' + kwText + '</span>'
    }).join(' ')
    const tableRows = rows.map(h => {
      const isKeyword = h.match_type === 'keyword'
      const isDomain  = h.match_type === 'domain'
      const isNone    = !isKeyword && !isDomain
      const matchBadges = isDomain
        ? '<span class="inline-block px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-xs font-medium mr-0.5">' + (h.domain || '-') + '</span>'
        : isKeyword ? h.mapped_keywords.map(mk => '<span class="inline-block px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded text-xs font-medium mr-0.5">' + mk + '</span>').join('') : ''
      const origBadges = isKeyword ? h.matched_keywords.map(ok => mappingMap[ok] ? '<span class="text-slate-400 text-xs line-through mr-0.5">' + ok + '</span>' : '').join('') : ''
      const matchClass = isNone ? 'opacity-40' : isDomain ? 'opacity-70' : h.match_count >= 3 ? 'bg-teal-50' : h.match_count >= 1 ? 'bg-indigo-50/40' : ''
      const matchBadge = isKeyword
        ? '<span class="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-teal-600 text-white">' + h.match_count + '</span>'
        : isDomain
          ? '<span class="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-slate-300 text-white" title="분야 매칭">분야</span>'
          : '<span class="text-slate-200">-</span>'
      return '<tr class="border-t border-slate-100 text-xs ' + matchClass + '"><td class="px-3 py-2 text-slate-700 max-w-xs">' + (h.project_name || '-') + '</td><td class="px-3 py-2 text-slate-500">' + (h.client_org || '-') + '</td><td class="px-3 py-2 text-slate-500">' + (h.domain || '-') + '</td><td class="px-3 py-2 text-center">' + matchBadge + '</td><td class="px-3 py-2">' + (matchBadges || '<span class="text-slate-300 text-xs">-</span>') + origBadges + '</td></tr>'
    }).join('')
    const matchedCount = kw_matched_count != null ? kw_matched_count : rows.filter(r => r.match_count > 0).length
    const domainCount  = domain_rows_count != null ? domain_rows_count : 0
    // 요약 필드: 키워드 매칭(match_count>0) 우선, 부족하면 분야 보충 행으로 채워 최대 20건
    const kwLines = rows.filter(r => r.match_count > 0).map(r => {
      const kwLabel = r.mapped_keywords.length > 0 ? r.mapped_keywords[0] : r.matched_keywords[0]
      return '[ ' + kwLabel + ' ] ' + (r.client_org || '') + ', ' + (r.project_name || '')
    })
    const domainLines = rows.filter(r => r.match_type === 'domain').map(r => {
      return '[ ' + (r.domain || '분야') + ' ] ' + (r.client_org || '') + ', ' + (r.project_name || '')
    })
    const copyLines = [...kwLines, ...domainLines].slice(0, 20).join('\n')
    const summaryCount = Math.min(kwLines.length + domainLines.length, 20)

    let countText = '<span class="text-sm text-slate-600">전체 감리실적 <strong>' + rows.length + '</strong>건</span>'
      + '<span class="text-sm text-teal-700 font-semibold">키워드 매칭 <strong>' + matchedCount + '</strong>건</span>'
    if (domainCount > 0) {
      countText += '<span class="text-sm text-slate-500">분야 보충 <strong>' + domainCount + '</strong>건</span>'
    }
    countText += '<span class="text-xs text-slate-400">(상위 키워드 순 → 최근 수행일자 순 정렬)</span>'
    let html = '<div class="mb-4"><p class="text-xs text-slate-500 mb-2 font-medium">이 제안의 키워드 (' + keywords.length + '개) — 앞 순서가 상위 키워드</p><div class="flex flex-wrap gap-1.5">' + kwTags + '</div></div>'
    html += '<div class="mb-3 flex items-center gap-3">' + countText + '</div>'
    if (summaryCount > 0) {
      html += '<div class="mb-4"><div class="flex items-center justify-between mb-1.5"><span class="text-xs font-semibold text-slate-600">매칭 감리이력 요약 <span class="text-slate-400 font-normal">(' + summaryCount + '건)</span></span><button onclick="copyKText()" class="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs rounded-lg transition"><i class="fas fa-copy"></i> 복사</button></div>'
      html += '<textarea id="kCopyText" readonly class="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-teal-300" rows="' + Math.min(summaryCount, 10) + '">' + copyLines + '</textarea></div>'
    }
    html += '<div class="overflow-x-auto rounded-xl border border-slate-200"><table class="w-full text-xs"><thead><tr class="bg-slate-50 text-slate-500 text-xs"><th class="px-3 py-2 text-left">사업명</th><th class="px-3 py-2 text-left">발주처</th><th class="px-3 py-2 text-left">분야</th><th class="px-3 py-2 text-center">매칭</th><th class="px-3 py-2 text-left">주요 키워드 (변환) / 분야</th></tr></thead><tbody>' + tableRows + '</tbody></table></div>'
    if (domainCount > 0) {
      html += '<p class="text-xs text-slate-400 mt-2">* <span class="inline-block px-1.5 py-0.5 rounded bg-slate-300 text-white text-xs font-bold">분야</span> 배지: 분야 매칭 이력 &nbsp;|&nbsp; 흐린 행: 키워드·분야 모두 미매칭 이력</p>'
    }
    document.getElementById('kModalBody').innerHTML = html
  } catch (e) {
    document.getElementById('kModalBody').innerHTML =
      '<p class="text-red-500 text-sm text-center py-4">불러오기 실패: ' + e.message + '</p>'
  }
}
function closeKModal() { document.getElementById('kModal').classList.add('hidden') }

function copyKText() {
  const ta = document.getElementById('kCopyText')
  if (!ta) return
  navigator.clipboard.writeText(ta.value).then(() => {
    const btn = document.querySelector('#kModal button[onclick="copyKText()"]')
    if (btn) {
      const orig = btn.innerHTML
      btn.innerHTML = '<i class="fas fa-check"></i> 복사됨'
      btn.classList.replace('bg-teal-600', 'bg-green-600')
      btn.classList.replace('hover:bg-teal-700', 'hover:bg-green-700')
      setTimeout(() => {
        btn.innerHTML = orig
        btn.classList.replace('bg-green-600', 'bg-teal-600')
        btn.classList.replace('hover:bg-green-700', 'hover:bg-teal-700')
      }, 2000)
    }
  }).catch(() => { ta.select(); document.execCommand('copy') })
}

// ── ESC 키로 모달 닫기 ──────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closePersonModal(); closeKModal()
    closeAutoModal(); closePersonnelTableModal(); closeExpertBreakdown()
  }
})

// ── 키워드 치환 규칙 CRUD ────────────────────────────────────
async function addKwMapping(projectId) {
  const origEl   = document.getElementById('kwMapOrig')
  const mappedEl = document.getElementById('kwMapMapped')
  const orig   = (origEl?.value || '').trim()
  const mapped = (mappedEl?.value || '').trim()
  if (!orig || !mapped) { alert('원본 키워드와 변환 이름을 모두 입력해주세요.'); return }

  try {
    const res = await fetch('/api/projects/' + projectId + '/keyword-mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ original_keyword: orig, mapped_keyword: mapped }),
    })
    const json = await res.json()
    if (!json.ok) throw new Error(json.error)

    // DOM 즉시 반영 (새 규칙들 삽입)
    const list = document.getElementById('kwMappingList')
    if (list) {
      const empty = list.querySelector('p')
      if (empty) empty.remove()
      ;(json.inserted || []).forEach(m => {
        const div = document.createElement('div')
        div.className = 'flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-1.5'
        div.dataset.mappingId = String(m.id)
        div.innerHTML =
          '<span class="text-xs text-slate-500 line-through">' + m.original_keyword + '</span>' +
          '<i class="fas fa-arrow-right text-teal-400 text-xs"></i>' +
          '<span class="text-xs font-semibold text-teal-700">' + m.mapped_keyword + '</span>' +
          '<button onclick="deleteKwMapping(' + projectId + ',' + m.id + ')" ' +
            'class="ml-auto text-slate-300 hover:text-red-400 transition text-xs" title="삭제">' +
            '<i class="fas fa-times"></i></button>'
        list.appendChild(div)
      })
    }
    if (origEl)   origEl.value   = ''
    if (mappedEl) mappedEl.value = ''
  } catch (e) {
    alert('저장 실패: ' + e.message)
  }
}

async function deleteKwMapping(projectId, mappingId) {
  if (!confirm('이 치환 규칙을 삭제하시겠습니까?')) return
  try {
    const res = await fetch('/api/projects/' + projectId + '/keyword-mappings/' + mappingId, {
      method: 'DELETE',
    })
    const json = await res.json()
    if (!json.ok) throw new Error(json.error)

    // DOM에서 해당 행 제거
    const row = document.querySelector('[data-mapping-id="' + mappingId + '"]')
    if (row) row.remove()
    // 목록이 비었으면 안내 문구 표시
    const list = document.getElementById('kwMappingList')
    if (list && !list.querySelector('[data-mapping-id]')) {
      list.innerHTML = '<p class="text-xs text-slate-400 py-1">등록된 치환 규칙이 없습니다.</p>'
    }
  } catch (e) {
    alert('삭제 실패: ' + e.message)
  }
}
