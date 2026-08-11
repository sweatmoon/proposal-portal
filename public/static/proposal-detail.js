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
    return { name, field, stageLabel, affil, certDisplay, grade, heritageLines: isAudit ? 10 : 3 }
  })
}

async function downloadAssignPptx(btn, opts) {
  opts = opts || {}
  if (typeof PptxGenJS === 'undefined') { alert('PPT 라이브러리 로딩 중입니다.'); return null }
  setBtnState(btn, true)
  try {
    const rows = computeAssignRows()
    if (!rows.length) { alert('인력 데이터가 없습니다.'); return null }
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

// ── 사진장표 PPT ────────────────────────────────────────────
// 장표 레이아웃: 슬라이드 당 카드 배치 정의 (cols × rows 격자)
const PHOTO_LAYOUT = {
  2: { cols: 2, rows: 1 },
  4: { cols: 2, rows: 2 },
  6: { cols: 3, rows: 2 },
  9: { cols: 3, rows: 3 },
}

// PHOTO_CATS 라벨 → 슬라이드 제목 매핑
const PHOTO_CAT_TITLES = {
  audit:    '감리원',
  core:     '핵심기술 전문가',
  required: '필수기술 전문가',
  security: '보안진단 전문가',
  tester:   '테스터',
}

async function downloadPhotoAssignPptx(btn, opts) {
  opts = opts || {}
  if (typeof PptxGenJS === 'undefined') { alert('PPT 라이브러리 로딩 중입니다.'); return null }
  setBtnState(btn, true)
  try {
    const { portalOrder, personFieldMap, personGradeMap } = parsedData
    const cache = buildPhotoAssignCache()
    if (!cache) { showAutoAlert('❌ 인력 데이터가 없습니다.', false); return null }

    // 체크리스트 설정 읽기 (모달이 열려 있으면 실제 설정, 아니면 기본값 사용)
    let cfg = {}
    try { cfg = readPhotoAssignConfig() } catch (e) { cfg = {} }

    // cfg가 비어있으면 (모달 미열림 or 모든 행 비활성) 기본 설정으로 fallback
    const activeCfgKeys = Object.keys(cfg)
    if (!activeCfgKeys.length) {
      PHOTO_CATS.forEach(c => {
        if (c.key === 'audit') return
        const cnt = (cache[c.key] || []).length
        if (cnt > 0) cfg[c.key] = { sheet: suggestSheetSize(cnt), include: new Set() }
      })
    }

    // 감리원은 항상 독립 처리 (2인 장표, 단독)
    const allGroups = [] // { label, people, sheetSize }

    // 감리원 (체크리스트 무관 고정 포함)
    const auditPeople = cache.audit || []
    if (auditPeople.length > 0) {
      // 감리원은 2인 장표씩 나눔
      const pageSize = 2
      for (let i = 0; i < auditPeople.length; i += pageSize) {
        allGroups.push({ label: '감리원', people: auditPeople.slice(i, i + pageSize), sheetSize: pageSize })
      }
    }

    // 전문가/테스터 그룹 묶기 (union-find)
    const catGroups = groupPhotoCategories(cfg) // [[catKey, ...], ...]
    for (const catKeys of catGroups) {
      // 그룹 내 인원 합치기 (PHOTO_CATS 순서 유지)
      let people = []
      catKeys.forEach(k => { people = people.concat(cache[k] || []) })
      if (!people.length) continue
      // 장표 크기: 그룹 내 첫 번째 cat 기준
      const firstCat = PHOTO_CATS.find(c => catKeys.includes(c.key))
      const sheetSize = (cfg[firstCat.key] || {}).sheet || suggestSheetSize(people.length)
      // 슬라이드 제목: 그룹 내 cat 라벨 합치기
      const label = catKeys.map(k => PHOTO_CAT_TITLES[k] || k).join(' + ')
      // 장표 크기 단위로 페이지 나누기
      for (let i = 0; i < people.length; i += sheetSize) {
        allGroups.push({ label, people: people.slice(i, i + sheetSize), sheetSize })
      }
    }

    if (!allGroups.length) { showAutoAlert('❌ 생성할 인력이 없습니다.', false); return null }

    const pres = new PptxGenJS(); pres.layout = 'LAYOUT_WIDE'
    const FONT_BOLD = 'KoPub돋움체 Bold', FONT_MEDIUM = 'KoPub돋움체 Medium'

    for (const g of allGroups) {
      const people = g.people
      const layout = PHOTO_LAYOUT[g.sheetSize] || PHOTO_LAYOUT[suggestSheetSize(people.length)]
      const cols = layout.cols, rows = layout.rows
      const cardW = 3.8, cardH = 1.4, gapX = 0.2, gapY = 0.2
      const totalW = cols * cardW + (cols - 1) * gapX
      const startX = (13.33 - totalW) / 2, startY = 1.2
      const sld = pres.addSlide()
      sld.addText(g.label, { x: 0.4, y: 0.3, w: 12.5, h: 0.5, fontFace: FONT_BOLD, fontSize: 18, color: '1A2E4A', bold: true })
      people.forEach((p, i) => {
        const col = i % cols, row = Math.floor(i / cols)
        const x = startX + col * (cardW + gapX), y = startY + row * (cardH + gapY)
        const field = personFieldMap[p.name] || p.field || ''
        const grade = getEffectiveGrade(p.name)
        const gradeColor = grade === '수석감리원' ? '1A2E4A' : grade === '감리원' ? '3A6EA8' : '2E7D32'
        sld.addShape('rect', { x, y, w: cardW, h: cardH, fill: { color: 'F8F9FC' }, line: { color: 'E5E8F0', pt: 1 } })
        sld.addText(field || '(분야 미상)', { x: x + 0.12, y: y + 0.08, w: cardW - 0.24, h: 0.25, fontFace: FONT_MEDIUM, fontSize: 9, color: '2E7D32', italic: true, valign: 'top' })
        sld.addText(p.name, { x: x + 0.12, y: y + 0.35, w: cardW - 0.24, h: 0.4, fontFace: FONT_BOLD, fontSize: 16, color: '1A2E4A', bold: true, valign: 'middle' })
        sld.addShape('rect', { x: x + 0.12, y: y + 0.82, w: 0.7, h: 0.24, fill: { color: gradeColor }, line: { color: gradeColor, pt: 0 } })
        sld.addText(grade, { x: x + 0.12, y: y + 0.82, w: 0.7, h: 0.24, fontFace: FONT_BOLD, fontSize: 9, color: 'FFFFFF', bold: true, align: 'center', valign: 'middle' })
      })
    }
    if (opts.returnZip) {
      const ab = await pres.write({ outputType: 'arraybuffer' })
      const z = new JSZip(); await z.loadAsync(ab); return { zip: z }
    }
    await pres.writeFile({ fileName: '사진장표_' + (parsedData.projectTitle || '').slice(0, 10) + '.pptx' })
    showAutoAlert('✅ 사진장표 생성 완료', true)
    return null
  } catch (e) { showAutoAlert('❌ 생성 실패: ' + e.message, false); return null }
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
async function downloadAllPptx(btn) {
  if (typeof PptxGenJS === 'undefined' || typeof JSZip === 'undefined') { alert('PPT 라이브러리 로딩 중입니다. 잠시 후 다시 시도해주세요.'); return }
  setBtnState(btn, true)
  showAutoAlert('⏳ 생성 중... 완료될 때까지 잠시 기다려주세요.', false)
  try {
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
      const srcPresXml = await srcZip.file('ppt/presentation.xml').async('string')
      const srcRelsXml = await srcZip.file('ppt/_rels/presentation.xml.rels').async('string')
      const relMap = {}
      srcRelsXml.replace(/<Relationship\b[^>]*\/>/g, tag => {
        const id = tag.match(/\bId="([^"]+)"/)?.[1]
        const tgt = tag.match(/\bTarget="([^"]+)"/)?.[1]
        const type = tag.match(/\bType="([^"]+)"/)?.[1] || ''
        if (id && tgt && type.includes('slide') && !type.includes('slideLayout') && !type.includes('slideMaster')) relMap[id] = tgt
        return tag
      })
      for (const [origId, tgt] of Object.entries(relMap)) {
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
    const { keywords, rows, mappingMap } = json
    const kwTags = keywords.map((k, i) => {
      const cls = i < 3 ? 'bg-teal-50 border-teal-300 text-teal-700 font-semibold' : 'bg-slate-50 border-slate-200 text-slate-500'
      const kwText = mappingMap[k.keyword]
        ? '<span class="line-through text-slate-300">' + k.keyword + '</span><span class="ml-1">' + mappingMap[k.keyword] + '</span>'
        : k.keyword
      return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ' + cls + '"><span class="text-slate-400">' + (i + 1) + '.</span>' + kwText + '</span>'
    }).join(' ')
    const tableRows = rows.map(h => {
      const matchBadges = h.mapped_keywords.map(mk => '<span class="inline-block px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded text-xs font-medium mr-0.5">' + mk + '</span>').join('')
      const origBadges = h.matched_keywords.map(ok => mappingMap[ok] ? '<span class="text-slate-400 text-xs line-through mr-0.5">' + ok + '</span>' : '').join('')
      const matchClass = h.match_count >= 3 ? 'bg-teal-50' : h.match_count >= 1 ? 'bg-indigo-50/40' : ''
      const matchBadge = h.match_count > 0 ? '<span class="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-teal-600 text-white">' + h.match_count + '</span>' : '<span class="text-slate-300">-</span>'
      return '<tr class="border-t border-slate-100 text-xs ' + matchClass + '"><td class="px-3 py-2 text-slate-700 max-w-xs">' + (h.project_name || '-') + '</td><td class="px-3 py-2 text-slate-500">' + (h.client_org || '-') + '</td><td class="px-3 py-2 text-slate-500">' + (h.domain || '-') + '</td><td class="px-3 py-2 text-center">' + matchBadge + '</td><td class="px-3 py-2">' + (matchBadges || '<span class="text-slate-300 text-xs">없음</span>') + origBadges + '</td></tr>'
    }).join('')
    const matchedCount = rows.filter(r => r.match_count > 0).length
    const copyLines = rows.filter(r => r.match_count > 0).map(r => {
      const kwLabel = r.mapped_keywords.length > 0 ? r.mapped_keywords[0] : r.matched_keywords[0]
      return '[ ' + kwLabel + ' ] ' + (r.client_org || '') + ', ' + (r.project_name || '')
    }).join('\n')
    let html = '<div class="mb-4"><p class="text-xs text-slate-500 mb-2 font-medium">이 제안의 키워드 (' + keywords.length + '개) — 앞 순서가 상위 키워드</p><div class="flex flex-wrap gap-1.5">' + kwTags + '</div></div>'
    html += '<div class="mb-3 flex items-center gap-3"><span class="text-sm text-slate-600">전체 감리실적 <strong>' + rows.length + '</strong>건</span><span class="text-sm text-teal-700 font-semibold">키워드 매칭 <strong>' + matchedCount + '</strong>건</span><span class="text-xs text-slate-400">(상위 키워드 순 → 최근 수행일자 순 정렬)</span></div>'
    if (matchedCount > 0) {
      html += '<div class="mb-4"><div class="flex items-center justify-between mb-1.5"><span class="text-xs font-semibold text-slate-600">매칭 감리이력 요약</span><button onclick="copyKText()" class="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs rounded-lg transition"><i class="fas fa-copy"></i> 복사</button></div>'
      html += '<textarea id="kCopyText" readonly class="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-teal-300" rows="' + Math.min(matchedCount, 8) + '">' + copyLines + '</textarea></div>'
    }
    html += '<div class="overflow-x-auto rounded-xl border border-slate-200"><table class="w-full text-xs"><thead><tr class="bg-slate-50 text-slate-500 text-xs"><th class="px-3 py-2 text-left">사업명</th><th class="px-3 py-2 text-left">발주처</th><th class="px-3 py-2 text-left">분야</th><th class="px-3 py-2 text-center">매칭수</th><th class="px-3 py-2 text-left">주요 키워드 (변환)</th></tr></thead><tbody>' + tableRows + '</tbody></table></div>'
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
