/**
 * 메인화면 라우트 + 제안작업표 목록/상세 라우트
 */
import { Hono } from 'hono'
import { query, queryOne } from '../db/client.js'
import { layout, statusBadge, fmtMoney, fmtDate } from '../views/layout.js'

// ── 감리경력 "n년 n개월" 포맷 헬퍼 ──────────────────────────────
// earliest: "YYYY.MM" 문자열
function fmtCareer(earliest: string | null | undefined): string {
  if (!earliest) return '-'
  const m = String(earliest).match(/^(\d{4})\.(\d{2})$/)
  if (!m) return '-'
  const [, sy, sm] = m
  const now = new Date()
  const totalMonths = (now.getFullYear() - Number(sy)) * 12 + (now.getMonth() + 1 - Number(sm))
  if (totalMonths < 0) return '-'
  const years  = Math.floor(totalMonths / 12)
  const months = totalMonths % 12
  if (years === 0)  return `${months}개월`
  if (months === 0) return `${years}년`
  return `${years}년 ${months}개월`
}

// ── 인력풀 카드 SSR 헬퍼 ─────────────────────────────────────────
// 인력 풀 섹션에서 각 인원 카드를 서버 사이드로 렌더링
function renderPoolPersonSSR(
  name: string,
  fieldMap: Record<string, string>,
  gradeMap: Record<string, {
    grade: string
    group: string
    expertSubGroup: string
    residency: string
    certNo: string
  }>
): string {
  const field     = fieldMap[name] || ''
  const info      = gradeMap[name] || {}
  const rawGrade  = info.grade || ''
  const grade     = rawGrade === '수석감리원' ? '수석감리원'
                  : rawGrade === '감리원'    ? '감리원'
                  : rawGrade === '테스터'    ? '테스터'
                  : '전문가'
  const gradeColor = grade === '수석감리원' ? '#1a2e4a'
                   : grade === '감리원'     ? '#3a6ea8'
                   : grade === '테스터'     ? '#6b21a8'
                   : '#2e7d32'
  const safeName  = name.replace(/"/g, '&quot;')
  const safeField = field.replace(/"/g, '&quot;')
  return `<div class="pool-person" data-name="${safeName}" data-field="${safeField}" ` +
    `style="display:flex;flex-direction:column;gap:3px;padding:6px 10px;border-radius:6px;` +
    `margin-bottom:5px;background:#f8f9fc;border:1px solid #e5e8f0;cursor:pointer;transition:background .15s" ` +
    `onclick="highlightByName('${safeName}')" title="${safeName} 강조">` +
    (field
      ? `<span style="font-size:10px;color:#2e7d32;font-style:italic;background:#e8f5e9;` +
        `border:1px solid #c8e6c9;border-radius:3px;padding:1px 5px;display:inline-block">${field}</span>`
      : '') +
    `<div style="display:flex;align-items:center;gap:6px">` +
    `<span style="background:${gradeColor};color:#fff;border-radius:4px;font-size:11px;` +
    `padding:2px 7px;font-weight:700;flex-shrink:0">${grade}</span>` +
    `<span style="font-size:13px;font-weight:700;color:#1a2e4a">${name}</span>` +
    `</div>` +
    `</div>`
}

const app = new Hono()

// ── 메인 (대시보드) ───────────────────────────────────────────
app.get('/', async (c) => {
  const [totalProjects, totalPersonnel, statusRows, recentProjects] = await Promise.all([
    queryOne<{ cnt: string }>('SELECT COUNT(*) AS cnt FROM audit_projects'),
    queryOne<{ cnt: string }>('SELECT COUNT(*) AS cnt FROM personnel'),
    query<{ proposal_status: string; cnt: string }>(
      'SELECT proposal_status, COUNT(*) AS cnt FROM audit_projects GROUP BY proposal_status ORDER BY cnt DESC'
    ),
    query<Record<string, unknown>>(`
      SELECT id, project_name, client_org, bid_deadline, bid_amount, proposal_status, bid_rate
      FROM audit_projects
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 8
    `),
  ])

  const tProj = Number(totalProjects?.cnt ?? 0)
  const tPers = Number(totalPersonnel?.cnt ?? 0)

  const statusCards = [
    { label: '입력중',    icon: 'fa-pen',         color: 'yellow', key: '입력중' },
    { label: '자동화요청', icon: 'fa-robot',       color: 'blue',   key: '자동화요청' },
    { label: '지원요청',  icon: 'fa-hand-paper',  color: 'purple', key: '지원요청' },
    { label: '지원완료',  icon: 'fa-check-circle', color: 'green',  key: '지원완료' },
  ].map(sc => {
    const cnt = Number(statusRows.find(r => r.proposal_status === sc.key)?.cnt ?? 0)
    const colorMap: Record<string, string> = {
      yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
      blue:   'bg-blue-50 border-blue-200 text-blue-700',
      purple: 'bg-violet-50 border-violet-200 text-violet-700',
      green:  'bg-emerald-50 border-emerald-200 text-emerald-700',
    }
    const iconMap: Record<string, string> = {
      yellow: 'bg-yellow-100 text-yellow-600',
      blue:   'bg-blue-100 text-blue-600',
      purple: 'bg-violet-100 text-violet-600',
      green:  'bg-emerald-100 text-emerald-600',
    }
    return `
    <a href="/proposals?status=${encodeURIComponent(sc.key)}"
       class="bg-white border ${colorMap[sc.color]} rounded-2xl p-5 card-hover flex items-center gap-4">
      <div class="w-12 h-12 rounded-xl ${iconMap[sc.color]} flex items-center justify-center flex-shrink-0">
        <i class="fas ${sc.icon} text-xl"></i>
      </div>
      <div>
        <p class="text-2xl font-bold">${cnt}</p>
        <p class="text-sm font-medium mt-0.5">${sc.label}</p>
      </div>
    </a>`
  }).join('')

  const recentRows = (recentProjects as Record<string, unknown>[]).map(p => `
    <tr class="hover:bg-slate-50 cursor-pointer" onclick="location.href='/proposals/${p.id}'">
      <td class="px-4 py-3 text-sm font-medium text-indigo-700 max-w-xs truncate">${p.project_name}</td>
      <td class="px-4 py-3 text-sm text-slate-600">${p.client_org ?? '-'}</td>
      <td class="px-4 py-3 text-sm text-slate-600">${fmtDate(p.bid_deadline as string)}</td>
      <td class="px-4 py-3 text-sm text-right text-slate-700 font-medium">${fmtMoney(p.bid_amount as number)}</td>
      <td class="px-4 py-3 text-center">${statusBadge(p.proposal_status as string)}</td>
    </tr>`).join('')

  const body = `
  <div class="p-6 md:p-8">
    <!-- 페이지 타이틀 -->
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-slate-800">대시보드</h1>
      <p class="text-slate-500 text-sm mt-1">제안팀 포털 현황</p>
    </div>

    <!-- 상단 KPI 카드 2개 -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <a href="/proposals" class="bg-white rounded-2xl p-5 border border-slate-200 card-hover flex items-center gap-4 col-span-2 md:col-span-1">
        <div class="w-12 h-12 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center flex-shrink-0">
          <i class="fas fa-clipboard-list text-xl"></i>
        </div>
        <div>
          <p class="text-2xl font-bold text-slate-800">${tProj}</p>
          <p class="text-sm text-slate-500 mt-0.5">전체 제안작업표</p>
        </div>
      </a>
      <a href="/personnel" class="bg-white rounded-2xl p-5 border border-slate-200 card-hover flex items-center gap-4 col-span-2 md:col-span-1">
        <div class="w-12 h-12 rounded-xl bg-teal-100 text-teal-600 flex items-center justify-center flex-shrink-0">
          <i class="fas fa-users text-xl"></i>
        </div>
        <div>
          <p class="text-2xl font-bold text-slate-800">${tPers}</p>
          <p class="text-sm text-slate-500 mt-0.5">등록 인력</p>
        </div>
      </a>
      ${statusCards}
    </div>

    <!-- 최근 제안작업표 -->
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div class="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <h2 class="font-bold text-slate-700"><i class="fas fa-clock mr-2 text-slate-400"></i>최근 제안작업표</h2>
        <a href="/proposals" class="text-sm text-indigo-600 hover:underline">전체보기 →</a>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="bg-slate-50 text-xs text-slate-500 uppercase">
              <th class="px-4 py-3 text-left">사업명</th>
              <th class="px-4 py-3 text-left">발주기관</th>
              <th class="px-4 py-3 text-left">입찰마감</th>
              <th class="px-4 py-3 text-right">입찰금액</th>
              <th class="px-4 py-3 text-center">상태</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${recentRows || '<tr><td colspan="5" class="px-4 py-8 text-center text-slate-400">데이터가 없습니다</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  </div>`

  return c.html(layout('홈', body, 'home'))
})

// ── 제안작업표 목록 ───────────────────────────────────────────
app.get('/proposals', async (c) => {
  const status = c.req.query('status') || ''
  const search = c.req.query('search') || ''

  let sql = `
    SELECT p.id, p.project_name, p.client_org, p.bid_notice_no,
           p.bid_deadline, p.bid_amount, p.bid_rate,
           p.required_md, p.proposed_md,
           p.proposal_status, p.eval_method,
           p.writer, p.director, p.registered_yearmonth,
           COUNT(DISTINCT pm.id) AS member_count
    FROM audit_projects p
    LEFT JOIN proposal_members pm ON pm.project_id = p.id
    WHERE 1=1
  `
  const params: (string | number)[] = []
  let idx = 1
  if (status) { sql += ` AND p.proposal_status = $${idx++}`; params.push(status) }
  if (search) { sql += ` AND (p.project_name ILIKE $${idx} OR p.client_org ILIKE $${idx})`; params.push(`%${search}%`); idx++ }
  sql += ` GROUP BY p.id ORDER BY p.bid_deadline DESC NULLS LAST, p.id DESC`

  const projects = await query<Record<string, unknown>>(sql, params)

  const statusTabs = ['', '입력중', '자동화요청', '지원요청', '지원완료'].map(s => {
    const active = status === s
    return `<a href="/proposals${s ? '?status='+encodeURIComponent(s) : ''}"
      class="px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap
      ${active ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300'}">
      ${s || '전체'}</a>`
  }).join('')

  const rows = projects.map((p, i) => `
    <tr class="hover:bg-indigo-50 transition group" onclick="location.href='/proposals/${p.id}'">
      <td class="px-4 py-3 text-center text-sm text-slate-400">${i + 1}</td>
      <td class="px-4 py-3">
        <div class="text-sm font-semibold text-indigo-700 leading-snug line-clamp-2 max-w-xs">${p.project_name}</div>
        ${p.bid_notice_no ? `<div class="text-xs text-slate-400 mt-0.5">${p.bid_notice_no}</div>` : ''}
      </td>
      <td class="px-4 py-3 text-sm text-slate-600">${p.client_org ?? '-'}</td>
      <td class="px-4 py-3 text-sm text-slate-600 text-center">${p.registered_yearmonth ?? '-'}</td>
      <td class="px-4 py-3 text-sm font-medium text-center ${(p.bid_deadline as string)?.includes('2026') ? 'text-red-600' : 'text-slate-600'}">${fmtDate(p.bid_deadline as string)}</td>
      <td class="px-4 py-3 text-sm text-right font-semibold text-slate-700">${fmtMoney(p.bid_amount as number)}</td>
      <td class="px-4 py-3 text-center text-sm text-slate-500">${p.bid_rate != null ? Math.round(Number(p.bid_rate) * 100) + '%' : '-'}</td>
      <td class="px-4 py-3 text-center text-sm text-slate-600">${p.required_md ?? '-'} MD</td>
      <td class="px-4 py-3 text-center text-sm text-slate-600">${p.member_count ?? 0}명</td>
      <td class="px-4 py-3 text-center">${statusBadge(p.proposal_status as string)}</td>
      <td class="px-4 py-3 text-center" onclick="event.stopPropagation()">
        <button onclick="confirmDelete(${p.id}, '${String(p.project_name).replace(/'/g, "\\'")}')"
          class="opacity-0 group-hover:opacity-100 transition-opacity px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-500 hover:text-red-700 rounded-lg text-xs font-medium border border-red-200 hover:border-red-400 flex items-center gap-1 whitespace-nowrap">
          <i class="fas fa-trash-alt"></i> 삭제
        </button>
      </td>
    </tr>`).join('')

  const body = `
  <div class="p-6 md:p-8">
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-slate-800">제안작업표</h1>
      <p class="text-slate-500 text-sm mt-1">총 ${projects.length}건</p>
    </div>

    <!-- 필터 + 검색 -->
    <div class="flex flex-wrap gap-2 mb-4 items-center">
      <div class="flex flex-wrap gap-2">${statusTabs}</div>
      <div class="ml-auto">
        <form method="GET" action="/proposals" class="flex gap-2">
          ${status ? `<input type="hidden" name="status" value="${status}">` : ''}
          <input type="text" name="search" value="${search}"
            placeholder="사업명 / 발주기관 검색..."
            class="border border-slate-200 rounded-lg px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <button type="submit" class="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">
            <i class="fas fa-search"></i>
          </button>
        </form>
      </div>
    </div>

    <!-- 목록 테이블 -->
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-slate-50 text-xs text-slate-500 uppercase border-b border-slate-200">
              <th class="px-4 py-3 text-center w-10">#</th>
              <th class="px-4 py-3 text-left">사업명</th>
              <th class="px-4 py-3 text-left">발주기관</th>
              <th class="px-4 py-3 text-center">등록년월</th>
              <th class="px-4 py-3 text-center">입찰마감</th>
              <th class="px-4 py-3 text-right">입찰금액</th>
              <th class="px-4 py-3 text-center">투찰률</th>
              <th class="px-4 py-3 text-center">요구공수</th>
              <th class="px-4 py-3 text-center">제안인력</th>
              <th class="px-4 py-3 text-center">상태</th>
              <th class="px-4 py-3 text-center w-16"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${rows || '<tr><td colspan="11" class="px-4 py-12 text-center text-slate-400">데이터가 없습니다.<br><a href="/upload" class="text-indigo-500 underline mt-2 inline-block">HTML 파일을 업로드해주세요</a></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- 삭제 확인 모달 -->
  <div id="deleteModal" class="hidden fixed inset-0 z-50 flex items-center justify-center">
    <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" onclick="closeDeleteModal()"></div>
    <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
          <i class="fas fa-trash-alt text-red-500"></i>
        </div>
        <div>
          <h3 class="font-bold text-slate-800 text-base">제안건 삭제</h3>
          <p class="text-xs text-slate-500 mt-0.5">이 작업은 되돌릴 수 없습니다</p>
        </div>
      </div>
      <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5">
        <p class="text-sm text-red-700 font-medium" id="deleteModalName"></p>
        <p class="text-xs text-red-500 mt-1">감리 단계, 투입 인력, 키워드 등 모든 관련 데이터가 함께 삭제됩니다.</p>
      </div>
      <div class="flex gap-3 justify-end">
        <button onclick="closeDeleteModal()"
          class="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition">
          취소
        </button>
        <button id="deleteConfirmBtn" onclick="executeDelete()"
          class="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition flex items-center gap-2">
          <i class="fas fa-trash-alt"></i> 삭제
        </button>
      </div>
    </div>
  </div>

  <script>
  var _deleteTargetId = null;
  function confirmDelete(id, name) {
    _deleteTargetId = id;
    document.getElementById('deleteModalName').textContent = name;
    document.getElementById('deleteModal').classList.remove('hidden');
  }
  function closeDeleteModal() {
    document.getElementById('deleteModal').classList.add('hidden');
    _deleteTargetId = null;
  }
  async function executeDelete() {
    if (!_deleteTargetId) return;
    var btn = document.getElementById('deleteConfirmBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 삭제 중...';
    try {
      var res = await fetch('/api/projects/' + _deleteTargetId, { method: 'DELETE' });
      var json = await res.json();
      if (json.ok) {
        closeDeleteModal();
        location.reload();
      } else {
        alert('삭제 실패: ' + (json.error || '알 수 없는 오류'));
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-trash-alt"></i> 삭제';
      }
    } catch(e) {
      alert('삭제 중 오류가 발생했습니다: ' + e.message);
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-trash-alt"></i> 삭제';
    }
  }
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeDeleteModal();
  });
  </script>`

  return c.html(layout('제안작업표', body, 'proposals'))
})

// ── 제안작업표 상세 ───────────────────────────────────────────
app.get('/proposals/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (isNaN(id)) return c.redirect('/proposals')

  const project = await queryOne<Record<string, unknown>>(
    'SELECT * FROM audit_projects WHERE id = $1', [id]
  )
  if (!project) return c.html(layout('없음', '<div class="p-8 text-center text-red-500">프로젝트를 찾을 수 없습니다</div>', 'proposals'))

  const [phases, members, keywords, files, toc] = await Promise.all([
    query<Record<string, unknown>>(`
      SELECT ph.*,
        COALESCE(json_agg(
          json_build_object(
            'id', pa.id, 'person_name', pa.person_name, 'member_type', pa.member_type,
            'domain', pa.domain, 'pre_survey_md', pa.pre_survey_md,
            'audit_md', pa.audit_md, 'action_confirm_md', pa.action_confirm_md,
            'total_md', pa.total_md
          ) ORDER BY pa.id
        ) FILTER (WHERE pa.id IS NOT NULL), '[]'::json) AS assignments
      FROM audit_phases ph
      LEFT JOIN audit_phase_assignments pa ON pa.phase_id = ph.id
      WHERE ph.project_id = $1
      GROUP BY ph.id ORDER BY ph.phase_order, ph.id
    `, [id]),
    query<Record<string, unknown>>(`SELECT * FROM proposal_members WHERE project_id = $1 ORDER BY id ASC`, [id]),
    query<Record<string, unknown>>(`SELECT * FROM keywords WHERE project_id = $1 ORDER BY sort_order`, [id]),
    query<Record<string, unknown>>(`SELECT * FROM proposal_files WHERE project_id = $1 ORDER BY id`, [id]),
    query<Record<string, unknown>>(`SELECT * FROM proposal_attachments_toc WHERE project_id = $1 ORDER BY item_order`, [id]),
  ])

  // 키워드 태그
  const kwTags = keywords.map(k =>
    `<span class="inline-block px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full text-xs">${k.keyword}</span>`
  ).join(' ')

  // ── DB → parsedData 포맷 변환 ────────────────────────────────
  // proposal_members → personFieldMap / personGradeMap / portalOrder
  const personFieldMap: Record<string, string> = {}
  const personGradeMap: Record<string, { grade: string; group: string; expertSubGroup: string; residency: string; certNo: string }> = {}
  const portalOrder: { name: string; group: string; expertSubGroup: string }[] = []

  members.forEach(m => {
    const name = String(m.person_name ?? '')
    if (!name) return
    const rawGroup = String(m.member_group ?? '')
    // member_group 값: "감리팀", "전문가/핵심기술", "전문가/필수기술", "전문가/보안진단", "테스터" 등
    const isExpert = rawGroup.includes('전문가') || rawGroup.includes('테스터')
    const group = rawGroup.includes('테스터') ? '테스터'
                : rawGroup.includes('전문가') ? '전문가'
                : '감리원팀'
    // expertSubGroup: "핵심기술", "필수기술", "보안진단" 등
    const subMatch = rawGroup.match(/(핵심기술|필수기술|보안진단)/)
    const expertSubGroup = subMatch ? subMatch[1] : ''

    personFieldMap[name] = String(m.domain ?? '')
    personGradeMap[name] = {
      grade:          String(m.auditor_grade ?? ''),
      group,
      expertSubGroup,
      residency:      m.is_fulltime ? '상근' : '비상근',
      certNo:         String(m.auditor_cert_no ?? ''),
    }
    if (!portalOrder.find(p => p.name === name)) {
      portalOrder.push({ name, group, expertSubGroup })
    }
  })

  // audit_phases + audit_phase_assignments → stages[]
  interface StageEntry {
    stage: string; date: string; days: number | null
    감리원: { count: number; pre: number; audit: number; post: number; total: number; people: { name: string; pre: number; audit: number; post: number; field: string }[] } | null
    전문가: { count: number; pre: number; audit: number; post: number; total: number; people: { name: string; pre: number; audit: number; post: number; field: string }[] } | null
  }

  const stages: StageEntry[] = phases.map(ph => {
    const rawAssign = ph.assignments
    const assigns: Record<string, unknown>[] =
      typeof rawAssign === 'string' ? JSON.parse(rawAssign) : (rawAssign as Record<string, unknown>[] ?? [])

    const auditors = assigns.filter(a => String(a.member_type ?? '감리원') !== '전문가' && String(a.member_type ?? '') !== '테스터')
    const experts  = assigns.filter(a => String(a.member_type ?? '') === '전문가' || String(a.member_type ?? '') === '테스터')

    const toPeople = (arr: Record<string, unknown>[]) =>
      arr.map(a => ({
        name:  String(a.person_name ?? ''),
        pre:   Number(a.pre_survey_md ?? 0),
        audit: Number(a.audit_md ?? 0),
        post:  Number(a.action_confirm_md ?? 0),
        field: personFieldMap[String(a.person_name ?? '')] ?? String(a.domain ?? ''),
      }))

    const sumMD = (arr: Record<string, unknown>[], key: string) =>
      arr.reduce((s, a) => s + Number(a[key] ?? 0), 0)

    const aPeople = toPeople(auditors)
    const ePeople = toPeople(experts)

    return {
      stage: String(ph.phase_name ?? ''),
      date:  `${ph.phase_start_date ?? ''} ~ ${ph.phase_end_date ?? ''}`,
      days:  ph.phase_days != null ? Number(ph.phase_days) : null,
      감리원: aPeople.length ? {
        count: aPeople.length,
        pre:   sumMD(auditors, 'pre_survey_md'),
        audit: sumMD(auditors, 'audit_md'),
        post:  sumMD(auditors, 'action_confirm_md'),
        total: Number(ph.proposed_md ?? 0),
        people: aPeople,
      } : null,
      전문가: ePeople.length ? {
        count: ePeople.length,
        pre:   sumMD(experts, 'pre_survey_md'),
        audit: sumMD(experts, 'audit_md'),
        post:  sumMD(experts, 'action_confirm_md'),
        total: sumMD(experts, 'pre_survey_md') + sumMD(experts, 'audit_md') + sumMD(experts, 'action_confirm_md'),
        people: ePeople,
      } : null,
    }
  })

  // 요약 계산
  let totalAuditMD = 0, totalExpertMD = 0, totalTesterMD = 0
  stages.forEach(s => {
    if (s.감리원) totalAuditMD += s.감리원.total
    if (s.전문가) s.전문가.people.forEach(p => {
      const grp = (personGradeMap[p.name] || {}).group || ''
      const md = p.pre + p.audit + p.post
      if (grp === '테스터') totalTesterMD += md
      else totalExpertMD += md
    })
  })
  const totalAllMD = totalAuditMD + totalExpertMD + totalTesterMD

  // 인력 그룹 분류
  const auditNames: string[] = []
  const coreNames: string[] = [], requiredNames: string[] = [], securityNames: string[] = [], testerNames: string[] = []
  portalOrder.forEach(({ name, group, expertSubGroup }) => {
    if (group === '테스터') { testerNames.push(name); return }
    if (group === '전문가') {
      if (expertSubGroup.includes('보안'))      securityNames.push(name)
      else if (expertSubGroup.includes('필수')) requiredNames.push(name)
      else                                     coreNames.push(name)
      return
    }
    auditNames.push(name)
  })

  // JSON 직렬화 (클라이언트에 전달)
  // </script> 문자열이 JSON 값 안에 있으면 브라우저가 스크립트 태그를 조기 종료하므로
  // 반드시 <\/script> 로 이스케이프 처리해야 함
  const safeJSON = (v: unknown) =>
    JSON.stringify(v).replace(/<\/script>/gi, '<\\/script>').replace(/<!--/g, '<\\!--')

  const stagesJSON = safeJSON(stages)
  const personFieldMapJSON = safeJSON(personFieldMap)
  const personGradeMapJSON = safeJSON(personGradeMap)
  const portalOrderJSON = safeJSON(portalOrder)
  const projectDataJSON = safeJSON({
    projectTitle: String(project.project_name ?? ''),
    requestMD: 0, requestStageCount: 0, requestAuditDays: 0,
    clientOrg: String(project.client_org ?? ''),
    pmName: String(project.director ?? ''),
  })

  // ── 감리 단계 스케줄 테이블 (새 통합 버전) ──────────────────
  const scheduleSection = phases.length > 0 ? `
  <div id="schedule-section" style="font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif">
    <!-- 요약 카드바 -->
    <div id="summary-bar" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      <div style="background:#fff;border:1px solid #ddd;border-radius:8px;padding:10px 16px;text-align:center;min-width:90px">
        <div style="font-size:22px;font-weight:700;color:#1a2e4a">${stages.length}</div><div style="font-size:12px;color:#666;margin-top:2px">총 단계</div>
      </div>
      <div style="background:#fff;border:1px solid #ddd;border-radius:8px;padding:10px 16px;text-align:center;min-width:90px">
        <div style="font-size:22px;font-weight:700;color:#1a2e4a">${totalAuditMD}</div><div style="font-size:12px;color:#666;margin-top:2px">감리원 MD</div>
      </div>
      <div style="background:#fff;border:1px solid #ddd;border-radius:8px;padding:10px 16px;text-align:center;min-width:90px">
        <div style="font-size:22px;font-weight:700;color:#1b5e20">${totalExpertMD}</div><div style="font-size:12px;color:#666;margin-top:2px">전문가 MD</div>
      </div>
      <div style="background:#fff;border:1px solid #ddd;border-radius:8px;padding:10px 16px;text-align:center;min-width:90px">
        <div style="font-size:22px;font-weight:700;color:#6a1b9a">${totalTesterMD}</div><div style="font-size:12px;color:#666;margin-top:2px">테스터 MD</div>
      </div>
      <div style="background:#fff;border:1px solid #ddd;border-radius:8px;padding:10px 16px;text-align:center;min-width:90px">
        <div style="font-size:22px;font-weight:700;color:#e65100">${totalAllMD}</div><div style="font-size:12px;color:#666;margin-top:2px">총 제안 MD</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-left:auto;flex-wrap:wrap">
        <button onclick="clearHighlights()" style="background:#e0e0e0;color:#333;border:none;border-radius:5px;padding:6px 12px;font-size:13px;cursor:pointer;font-family:inherit">🧹 강조 초기화</button>
        <button onclick="highlightCorrections('pre')" style="background:#e65100;color:#fff;border:none;border-radius:5px;padding:6px 12px;font-size:13px;cursor:pointer;font-family:inherit">🔎 예비조사</button>
        <button onclick="highlightCorrections('audit')" style="background:#6a1b9a;color:#fff;border:none;border-radius:5px;padding:6px 12px;font-size:13px;cursor:pointer;font-family:inherit">🔔 감리</button>
        <button onclick="highlightCorrections('post')" style="background:#c62828;color:#fff;border:none;border-radius:5px;padding:6px 12px;font-size:13px;cursor:pointer;font-family:inherit">🚨 조치확인</button>
        <button onclick="openAutoModal()" style="background:linear-gradient(135deg,#7c3aed,#4338ca);color:#fff;border:none;border-radius:7px;padding:8px 16px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:0 2px 8px rgba(67,56,202,.4)">🛠️ 자동화 PPT</button>
      </div>
    </div>

    <!-- 범례 -->
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;font-size:12px;color:#444">
      <span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;border-radius:2px;display:inline-block;background:#fff9c4;border:1px solid #f9a825"></span>이름 강조</span>
      <span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;border-radius:2px;display:inline-block;background:#e8f5e9;border:1px solid #43a047"></span>분야 강조</span>
      <span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;border-radius:2px;display:inline-block;background:#eef4ff;border:1px solid #1565c0"></span>예비조사&gt;0</span>
      <span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;border-radius:2px;display:inline-block;background:#f5eefc;border:1px solid #6a1b9a"></span>감리&gt;0</span>
      <span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;border-radius:2px;display:inline-block;background:#ffcdd2;border:1px solid #c62828"></span>조치확인&gt;0</span>
    </div>

    <!-- 스케줄 테이블 -->
    <div style="overflow-x:auto;border-radius:8px;margin-bottom:20px">
      <table id="schedule-table" style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.1);font-size:13px">
        <thead>
          <tr>
            <th rowspan="2" style="background:#1a2e4a;color:#fff;padding:8px 10px;text-align:center;font-size:12px;font-weight:600;border:1px solid #2b4a78;min-width:90px;white-space:nowrap">단계 구분</th>
            <th rowspan="2" style="background:#1a2e4a;color:#fff;padding:8px 10px;text-align:center;font-size:12px;font-weight:600;border:1px solid #2b4a78;min-width:70px">감리원<br>MD</th>
            <th rowspan="2" style="background:#1a2e4a;color:#fff;padding:8px 10px;text-align:center;font-size:12px;font-weight:600;border:1px solid #2b4a78;min-width:70px">전문가<br>MD</th>
            <th rowspan="2" style="background:#1a2e4a;color:#fff;padding:8px 10px;text-align:center;font-size:12px;font-weight:600;border:1px solid #2b4a78;min-width:60px">총 MD</th>
            <th style="background:#1a2e4a;color:#fff;padding:8px 10px;text-align:center;font-size:12px;font-weight:600;border:1px solid #2b4a78;min-width:280px">감리원 투입 인력</th>
            <th style="background:#1a2e4a;color:#fff;padding:8px 10px;text-align:center;font-size:12px;font-weight:600;border:1px solid #2b4a78;min-width:280px">전문가 투입 인력</th>
          </tr>
          <tr>
            <th style="background:#1a2e4a;color:#a8c4e0;padding:6px 10px;text-align:center;font-size:11px;border:1px solid #2b4a78">투입 MD 합계</th>
            <th style="background:#1a2e4a;color:#a8c4e0;padding:6px 10px;text-align:center;font-size:11px;border:1px solid #2b4a78">투입 MD 합계</th>
          </tr>
        </thead>
        <tbody id="schedule-tbody">
          ${stages.map((s, si) => {
            const ae = s.감리원 ?? { total: 0, people: [], count: 0 }
            const ee = s.전문가 ?? { total: 0, people: [], count: 0 }
            const tot = ae.total + ee.total
            const auditPeople = ae.people.map((p: { name: string; pre: number; audit: number; post: number; field: string }) =>
              `<span class="person-chip" data-name="${p.name}" data-field="${(p.field||'').replace(/"/g,'&quot;')}" data-stage="${si}" data-pre="${p.pre}" data-audit="${p.audit}" data-post="${p.post}" style="display:inline-flex;align-items:center;gap:3px;cursor:pointer;border-radius:3px;padding:2px 6px;border:1px solid transparent;margin:2px;white-space:nowrap;transition:all .15s">
                <span class="chip-name" style="font-weight:700;color:#1a2e4a;font-size:12px">${p.name}</span>
                <span class="chip-mds" style="color:#666;font-size:11px">
                  <span class="mds-num" data-k="pre">${p.pre}</span>:<span class="mds-num" data-k="audit">${p.audit}</span>:<span class="mds-num" data-k="post">${p.post}</span>
                </span>
              </span>`
            ).join('')
            const expertPeople = ee.people.map((p: { name: string; pre: number; audit: number; post: number; field: string }) =>
              `<span class="person-chip" data-name="${p.name}" data-field="${(p.field||'').replace(/"/g,'&quot;')}" data-stage="${si}" data-pre="${p.pre}" data-audit="${p.audit}" data-post="${p.post}" style="display:inline-flex;align-items:center;gap:3px;cursor:pointer;border-radius:3px;padding:2px 6px;border:1px solid transparent;margin:2px;white-space:nowrap;transition:all .15s">
                <span class="chip-name" style="font-weight:700;color:#1a2e4a;font-size:12px">${p.name}</span>
                <span class="chip-mds" style="color:#666;font-size:11px">
                  <span class="mds-num" data-k="pre">${p.pre}</span>:<span class="mds-num" data-k="audit">${p.audit}</span>:<span class="mds-num" data-k="post">${p.post}</span>
                </span>
  
              </span>`
            ).join('')
            return `<tr data-stage="${si}">
              <td style="padding:8px 10px;border:1px solid #ddd;background:#e8edf5;font-weight:700;text-align:center;white-space:nowrap;font-size:14px">
                <div>${s.stage}</div>
                ${s.date && s.date.trim() !== ' ~ ' ? `<div style="font-size:11px;color:#444;margin-top:2px;font-weight:400">${s.date}</div>` : ''}
                ${s.days ? `<div style="font-size:12px;color:#3a6ea8;font-weight:600;margin-top:2px">(${s.days}일)</div>` : ''}
              </td>
              <td style="padding:8px 10px;border:1px solid #ddd;text-align:center;font-weight:700;font-size:14px;background:#fff9e8;vertical-align:middle">
                <div>${ae.total}</div><div style="font-size:10px;color:#888;font-weight:400">(${ae.count || ae.people.length}명)</div>
              </td>
              <td style="padding:8px 10px;border:1px solid #ddd;text-align:center;font-weight:700;font-size:14px;background:#fff9e8;vertical-align:middle">
                <div>${ee.total}</div><div style="font-size:10px;color:#888;font-weight:400">(${ee.count || ee.people.length}명)</div>
              </td>
              <td style="padding:8px 10px;border:1px solid #ddd;text-align:center;font-weight:700;font-size:14px;background:#e8f5e9;color:#1b5e20;vertical-align:middle">${tot}</td>
              <td class="people-cell" data-ci="people-audit-${si}" style="padding:6px 8px;border:1px solid #ddd;vertical-align:top;line-height:1.8">
                ${auditPeople || '<span style="color:#bbb;font-size:12px">없음</span>'}
              </td>
              <td class="people-cell" data-ci="people-expert-${si}" style="padding:6px 8px;border:1px solid #ddd;vertical-align:top;line-height:1.8">
                ${expertPeople || '<span style="color:#bbb;font-size:12px">없음</span>'}
              </td>
            </tr>`
          }).join('')}
        </tbody>
      </table>
    </div>

    <!-- 인력 모음 풀 -->
    <div id="personnel-pool" style="margin-top:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px">
        <h3 style="font-size:15px;font-weight:700;color:#1a2e4a;margin:0">👥 인력 모음</h3>
        <button onclick="copyPersonnelTable()" style="background:#1a2e4a;color:#fff;border:none;border-radius:5px;padding:6px 12px;font-size:13px;cursor:pointer;font-family:inherit">📋 표로 복사</button>
      </div>
      <div id="pool-row" style="display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap">
        <div id="pool-audit-group" class="pool-group" style="background:#fff;border:1px solid #ddd;border-radius:8px;padding:12px;flex:1;min-width:160px">
          <div style="font-size:14px;font-weight:700;color:#1a2e4a;margin-bottom:8px;padding-bottom:5px;border-bottom:2px solid #e0e8f5">🔵 감리원 (${auditNames.length}명)</div>
          <div id="pool-audit-list">${auditNames.map(n => renderPoolPersonSSR(n, personFieldMap, personGradeMap)).join('')}</div>
        </div>
        <div id="pool-core-group" class="pool-group" style="background:#fff;border:1px solid #ddd;border-radius:8px;padding:12px;flex:1;min-width:160px">
          <div style="font-size:14px;font-weight:700;color:#1a2e4a;margin-bottom:8px;padding-bottom:5px;border-bottom:2px solid #e0e8f5">🟢 핵심기술 (${coreNames.length}명)</div>
          <div id="pool-core-list">${coreNames.map(n => renderPoolPersonSSR(n, personFieldMap, personGradeMap)).join('')}</div>
        </div>
        <div id="pool-required-group" class="pool-group" style="background:#fff;border:1px solid #ddd;border-radius:8px;padding:12px;flex:1;min-width:160px">
          <div style="font-size:14px;font-weight:700;color:#1a2e4a;margin-bottom:8px;padding-bottom:5px;border-bottom:2px solid #e0e8f5">🟩 필수기술 (${requiredNames.length}명)</div>
          <div id="pool-required-list">${requiredNames.map(n => renderPoolPersonSSR(n, personFieldMap, personGradeMap)).join('')}</div>
        </div>
        <div id="pool-security-group" class="pool-group" style="background:#fff;border:1px solid #ddd;border-radius:8px;padding:12px;flex:1;min-width:160px">
          <div style="font-size:14px;font-weight:700;color:#1a2e4a;margin-bottom:8px;padding-bottom:5px;border-bottom:2px solid #e0e8f5">🔴 보안진단 (${securityNames.length}명)</div>
          <div id="pool-security-list">${securityNames.map(n => renderPoolPersonSSR(n, personFieldMap, personGradeMap)).join('')}</div>
        </div>
        <div id="pool-tester-group" class="pool-group" style="background:#fff;border:1px solid #ddd;border-radius:8px;padding:12px;flex:1;min-width:160px">
          <div style="font-size:14px;font-weight:700;color:#1a2e4a;margin-bottom:8px;padding-bottom:5px;border-bottom:2px solid #e0e8f5">🟣 테스터 (${testerNames.length}명)</div>
          <div id="pool-tester-list">${testerNames.map(n => renderPoolPersonSSR(n, personFieldMap, personGradeMap)).join('')}</div>
        </div>
      </div>
    </div>
  </div>` : ''

  // ── 제안 인력 테이블 ──────────────────────────────────────────
  const memberRows = members.map(m => {
    const pid = m.personnel_id
    const nameCell = pid
      ? `<span class="cursor-pointer text-indigo-700 font-semibold hover:underline" onclick="openPersonModal(${pid})">${m.person_name}</span><span class="text-xs text-teal-600 font-bold cursor-pointer hover:text-teal-800 ml-0.5" onclick="openKModal(${pid},${id},'${String(m.person_name).replace(/'/g,"\\'")}')"> (K)</span>`
      : `<span class="font-medium text-slate-700">${m.person_name}</span>`
    return `
    <tr class="hover:bg-slate-50 text-sm border-t border-slate-100">
      <td class="px-4 py-2.5 text-slate-500 text-xs">${m.member_group ?? '-'}</td>
      <td class="px-4 py-2.5">${nameCell}</td>
      <td class="px-4 py-2.5 text-slate-600 text-xs">${m.member_type ?? '-'}</td>
      <td class="px-4 py-2.5 text-slate-600 text-xs">${m.domain ?? '-'}</td>
      <td class="px-4 py-2.5 text-center">${m.total_md ?? 0} MD</td>
      <td class="px-4 py-2.5 text-center text-xs text-slate-500">${m.is_fulltime ? '상근' : '비상근'}</td>
      <td class="px-4 py-2.5 text-slate-600 text-xs">${m.auditor_grade ?? '-'}</td>
      <td class="px-4 py-2.5 text-slate-500 text-xs">${m.phone ?? '-'}</td>
    </tr>`
  }).join('')

  // 파일 목록
  const fileRows = files.map(f => `
    <tr class="text-xs border-t border-slate-100">
      <td class="px-4 py-2 text-slate-500">${f.file_category ?? '-'}</td>
      <td class="px-4 py-2 font-medium text-slate-700">${f.file_name}</td>
      <td class="px-4 py-2 text-right text-slate-500">${f.file_size_kb != null ? Number(f.file_size_kb).toFixed(1) + ' KB' : '-'}</td>
      <td class="px-4 py-2 text-slate-500">${f.uploaded_at ?? '-'}</td>
    </tr>`).join('')

  // TOC
  const tocItems = toc.map(t =>
    `<li class="text-sm text-slate-600 flex gap-2"><span class="text-slate-400 w-5 text-right flex-shrink-0">${t.item_order}.</span>${t.item_name}</li>`
  ).join('')

  const infoRow = (label: string, value: string, span = false) =>
    `<tr>
      <th class="px-4 py-2.5 text-left text-xs font-medium text-slate-500 bg-slate-50 w-28 whitespace-nowrap">${label}</th>
      <td class="px-4 py-2.5 text-sm text-slate-800 ${span ? 'colspan=\"3\"' : ''}">${value}</td>
    </tr>`

  const body = `
  <div class="p-6 md:p-8">
    <!-- 뒤로가기 + 제목 -->
    <div class="mb-6 flex items-start gap-4">
      <a href="/proposals" class="mt-1 text-slate-400 hover:text-slate-600 transition">
        <i class="fas fa-arrow-left text-lg"></i>
      </a>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-3 flex-wrap mb-1">
          ${statusBadge(project.proposal_status as string)}
          <span class="text-xs text-slate-400">${project.registered_yearmonth ?? ''}</span>
        </div>
        <h1 class="text-xl font-bold text-slate-800 leading-snug">${project.project_name}</h1>
        <p class="text-slate-500 text-sm mt-1">${project.client_org ?? ''}</p>
      </div>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <!-- 왼쪽 메인 -->
      <div class="xl:col-span-2 space-y-6">

        <!-- 기본 정보 -->
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-5 py-3 bg-slate-700 text-white font-semibold text-sm flex items-center gap-2">
            <i class="fas fa-info-circle"></i> 기본 정보
          </div>
          <table class="w-full divide-y divide-slate-100">
            <tbody>
              ${infoRow('사업명', String(project.project_name ?? '-'))}
              ${infoRow('발주기관', String(project.client_org ?? '-'))}
              ${infoRow('입찰공고번호', project.bid_notice_no
                ? `<a href="https://www.g2b.go.kr/link/PNPE027_01/single/?bidPbancNo=${project.bid_notice_no}" target="_blank" class="text-indigo-600 hover:underline">${project.bid_notice_no}</a>`
                : '-')}
              ${infoRow('입찰마감일시', `<span class="${String(project.bid_deadline ?? '').includes('2026') ? 'text-red-600 font-semibold' : ''}">${fmtDate(project.bid_deadline as string)}</span>`)}
              ${infoRow('평가일시', fmtDate(project.eval_dt as string))}
              ${infoRow('제안평가방식', String(project.eval_method ?? '-'))}
              ${infoRow('제안작업상태', statusBadge(project.proposal_status as string))}
            </tbody>
          </table>
        </div>

        <!-- 금액 정보 -->
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-5 py-3 bg-indigo-700 text-white font-semibold text-sm flex items-center gap-2">
            <i class="fas fa-won-sign"></i> 금액 정보
          </div>
          <div class="grid grid-cols-2 md:grid-cols-3 divide-x divide-y divide-slate-100">
            ${[
              ['사업금액', fmtMoney(project.base_budget as number)],
              ['배정예산', fmtMoney(project.target_budget as number)],
              ['입찰금액(VAT포함)', `<span class="text-indigo-700 font-bold text-base">${fmtMoney(project.bid_amount as number)}</span>`],
              ['입찰금액(VAT제외)', fmtMoney(project.bid_amount_excl_vat as number)],
              ['투찰률', project.bid_rate != null ? `<span class="font-semibold">${Math.round(Number(project.bid_rate) * 100)}%</span>` : '-'],
              ['1MD단가(VAT제외)', fmtMoney(project.md_unit_price_excl as number)],
              ['요구투입공수', `<span class="font-semibold">${project.required_md ?? '-'} MD</span>`],
              ['제안투입공수', `<span class="font-semibold text-indigo-700">${project.proposed_md ?? '-'} MD</span>`],
              ['제안수당', project.proposal_allowance ? `${fmtMoney(project.proposal_allowance as number)} (${project.proposal_allowance_rate != null ? Number(project.proposal_allowance_rate).toFixed(2) + '%' : ''})` : '-'],
            ].map(([k, v]) => `
              <div class="px-4 py-3">
                <p class="text-xs text-slate-500 mb-1">${k}</p>
                <p class="text-sm">${v}</p>
              </div>`).join('')}
          </div>
        </div>

        <!-- 감리 단계별 인력 배정 (통합 뷰어) -->
        ${phases.length > 0 ? `
        <div>
          <h2 class="font-bold text-slate-700 mb-3 flex items-center gap-2">
            <i class="fas fa-tasks text-slate-400"></i> 감리 단계별 인력 배정
          </h2>
          ${scheduleSection}
        </div>` : ''}

        <!-- 제안 인력 -->
        ${members.length > 0 ? `
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-5 py-3 bg-teal-700 text-white font-semibold text-sm flex items-center gap-2">
            <i class="fas fa-users"></i> 제안 인력 (${members.length}명)
          </div>
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead><tr class="bg-slate-50 text-xs text-slate-500 border-b">
                <th class="px-4 py-2 text-left">그룹</th>
                <th class="px-4 py-2 text-left">성명</th>
                <th class="px-4 py-2 text-center">구분</th>
                <th class="px-4 py-2 text-center">분야</th>
                <th class="px-4 py-2 text-center">공수</th>
                <th class="px-4 py-2 text-center">상근</th>
                <th class="px-4 py-2 text-center">등급</th>
                <th class="px-4 py-2 text-center">연락처</th>
              </tr></thead>
              <tbody class="divide-y divide-slate-100">${memberRows}</tbody>
            </table>
          </div>
        </div>` : ''}

      </div>

      <!-- 오른쪽 사이드 -->
      <div class="space-y-6">

        <!-- 제안 관련자 -->
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h3 class="font-bold text-slate-700 mb-3 text-sm"><i class="fas fa-user-tie mr-2 text-slate-400"></i>제안 관련자</h3>
          <div class="space-y-2 text-sm">
            ${project.writer ? `<div class="flex gap-2"><span class="text-slate-400 w-14">작성자</span><span class="font-medium">${project.writer}</span></div>` : ''}
            ${project.director ? `<div class="flex gap-2"><span class="text-slate-400 w-14">총괄</span><span class="font-medium">${project.director}</span></div>` : ''}
            ${project.supporters ? `<div class="flex gap-2"><span class="text-slate-400 w-14">지원</span><span class="text-slate-600">${project.supporters}</span></div>` : ''}
            ${project.references_cc ? `<div class="flex gap-2"><span class="text-slate-400 w-14">참조</span><span class="text-slate-600 text-xs leading-relaxed">${project.references_cc}</span></div>` : ''}
          </div>
        </div>

        <!-- 키워드 -->
        ${keywords.length > 0 ? `
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h3 class="font-bold text-slate-700 mb-3 text-sm"><i class="fas fa-tags mr-2 text-slate-400"></i>키워드 (${keywords.length}개)</h3>
          <div class="flex flex-wrap gap-1.5">${kwTags}</div>
        </div>` : ''}

        <!-- 감리 일정 -->
        ${project.special_notes ? `
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h3 class="font-bold text-slate-700 mb-3 text-sm"><i class="fas fa-calendar-alt mr-2 text-slate-400"></i>감리 일정</h3>
          <p class="text-xs text-slate-600 whitespace-pre-line leading-relaxed">${project.special_notes}</p>
        </div>` : ''}

        <!-- 첨부 목차 -->
        ${toc.length > 0 ? `
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h3 class="font-bold text-slate-700 mb-3 text-sm"><i class="fas fa-list mr-2 text-slate-400"></i>첨부 목차 (${toc.length}건)</h3>
          <ol class="space-y-1">${tocItems}</ol>
        </div>` : ''}

        <!-- 제안 파일 -->
        ${files.length > 0 ? `
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-4 py-3 bg-amber-50 border-b border-amber-100">
            <h3 class="font-bold text-amber-700 text-sm"><i class="fas fa-paperclip mr-2"></i>제안 파일 (${files.length}건)</h3>
          </div>
          <table class="w-full">
            <thead><tr class="bg-slate-50 text-xs text-slate-500 border-b">
              <th class="px-4 py-2 text-left">분류</th>
              <th class="px-4 py-2 text-left">파일명</th>
              <th class="px-4 py-2 text-right">크기</th>
            </tr></thead>
            <tbody class="divide-y divide-slate-100">${fileRows}</tbody>
          </table>
        </div>` : ''}

        <!-- 비고 -->
        ${project.remarks ? `
        <div class="bg-amber-50 rounded-2xl border border-amber-200 p-5">
          <h3 class="font-bold text-amber-700 mb-2 text-sm"><i class="fas fa-sticky-note mr-2"></i>비고</h3>
          <p class="text-sm text-amber-800 whitespace-pre-line leading-relaxed">${project.remarks}</p>
        </div>` : ''}

      </div>
    </div>
  </div>

  <!-- ── 인원 상세 모달 ─────────────────────────────── -->
  <div id="personModal" class="fixed inset-0 z-50 hidden flex items-center justify-center p-4">
    <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" onclick="closePersonModal()"></div>
    <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
      <div class="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
        <h2 class="font-bold text-slate-800 text-lg" id="personModalTitle">인원 정보</h2>
        <button onclick="closePersonModal()" class="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
      </div>
      <div id="personModalBody" class="p-6">
        <div class="flex justify-center py-8"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div></div>
      </div>
    </div>
  </div>

  <!-- ── K 감리이력 매칭 모달 ──────────────────────────── -->
  <div id="kModal" class="fixed inset-0 z-50 hidden flex items-center justify-center p-4">
    <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" onclick="closeKModal()"></div>
    <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
      <div class="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
        <h2 class="font-bold text-slate-800 text-lg" id="kModalTitle">감리이력 키워드 매칭</h2>
        <button onclick="closeKModal()" class="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
      </div>
      <div id="kModalBody" class="p-6">
        <div class="flex justify-center py-8"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500"></div></div>
      </div>
    </div>
  </div>

  <!-- ── 자동화 PPT 모달 ───────────────────────────────── -->
  <div id="autoModal" style="display:none;position:fixed;inset:0;z-index:3000;background:rgba(0,0,0,.5);align-items:center;justify-content:center;padding:20px">
    <div style="background:#fff;border-radius:12px;max-width:600px;width:100%;max-height:85vh;overflow-y:auto;padding:24px;position:relative;box-shadow:0 8px 30px rgba(0,0,0,.25);font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif">
      <button onclick="closeAutoModal()" style="position:absolute;top:14px;right:16px;background:#e0e0e0;border:none;border-radius:50%;width:28px;height:28px;cursor:pointer;font-size:14px">✕</button>
      <h3 style="font-size:16px;font-weight:700;margin:0 0 6px;color:#1a2e4a">🛠️ 자동화 PPT 생성</h3>
      <p style="font-size:13px;color:#666;margin:0 0 16px">세부감리일정(1,2) → 표장표 → 사진장표 → 요약표 순서로 하나의 PPT로 합쳐서 내려받습니다.</p>
      <div id="autoModalAlertBox" style="display:none;margin-bottom:12px;padding:10px 14px;border-radius:7px;font-size:13px;font-weight:600"></div>
      <div style="margin-bottom:16px;background:#f7f8fa;border-radius:8px;padding:12px">
        <b style="font-size:13px;color:#333">추가 제안 단계</b>
        <div style="font-size:12px;color:#666;margin-top:4px">RFP 최소 요건 이상으로 추가 제안한 단계를 선택하세요 (요약표에 반영됩니다)</div>
        <div id="extra-stage-boxes" style="display:flex;flex-wrap:wrap;gap:10px;margin-top:8px">
          ${stages.map(s => `<label style="display:flex;align-items:center;gap:4px;font-size:13px;color:#333;cursor:pointer"><input type="checkbox" class="st-extra-stage-cb" value="${s.stage}"> ${s.stage}</label>`).join('')}
        </div>
        <div style="font-size:12px;color:#777;margin-top:8px">
          요청공수: <b>${project.required_md != null ? project.required_md + ' MD' : '(없음)'}</b> · 
          주관기관: <b>${project.client_org ?? '(없음)'}</b> · 
          총괄감리원: <b>${project.director ?? '(없음)'}</b>
        </div>
      </div>
      <!-- ── 사진장표용 분류 체크리스트 ── -->
      <div style="margin-bottom:16px;border:1px solid #e8eaf0;border-radius:8px;padding:12px">
        <b style="font-size:13px;color:#333">🖼️ 사진장표용 분류 체크리스트</b>
        <div id="photo-assign-rows" style="display:flex;flex-direction:column;gap:8px;margin-top:10px">
          <span style="color:#aaa;font-size:13px">인력 데이터를 불러오는 중...</span>
        </div>
      </div>
      <button onclick="downloadAllPptx(this)" style="width:100%;padding:14px 0;font-size:16px;font-weight:800;color:#fff;background:linear-gradient(135deg,#7c3aed,#4338ca);border:none;border-radius:9px;cursor:pointer;box-shadow:0 3px 10px rgba(67,56,202,.4);font-family:inherit;margin-bottom:16px">
        🚀 자동화 생성 (전체 합본)
      </button>
      <details style="margin-top:4px">
        <summary style="cursor:pointer;color:#555;font-size:13px;font-weight:600;padding:4px 0">🔧 개별 생성</summary>
        <div style="margin-top:10px;display:flex;flex-direction:column;gap:10px">
          <button onclick="downloadDetailSchedule1Pptx(this)" style="background:#2e7d32;color:#fff;border:none;border-radius:6px;padding:9px 14px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;text-align:left">📅 세부 감리 일정 (1, 2) 생성</button>
          <button onclick="downloadAssignPptx(this)" style="background:#2e7d32;color:#fff;border:none;border-radius:6px;padding:9px 14px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;text-align:left">📋 표장표 생성</button>
          <button onclick="downloadPhotoAssignPptx(this)" style="background:#2e7d32;color:#fff;border:none;border-radius:6px;padding:9px 14px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;text-align:left">🖼️ 사진장표 생성</button>
          <button onclick="downloadSummaryTablePptx(this)" style="background:#2e7d32;color:#fff;border:none;border-radius:6px;padding:9px 14px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;text-align:left">📊 요약표 생성</button>
        </div>
      </details>
    </div>
  </div>

  <!-- ── 인력 모음 표 복사 모달 ─────────────────────────── -->
  <div id="personnelTableModal" style="display:none;position:fixed;inset:0;z-index:3000;background:rgba(0,0,0,.5);align-items:center;justify-content:center;padding:20px">
    <div style="background:#fff;border-radius:10px;max-width:560px;width:100%;max-height:85vh;overflow-y:auto;padding:22px;position:relative;font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif">
      <button onclick="closePersonnelTableModal()" style="position:absolute;top:14px;right:16px;background:#e0e0e0;border:none;border-radius:50%;width:28px;height:28px;cursor:pointer;font-size:14px">✕</button>
      <h3 style="font-size:16px;font-weight:700;margin:0 0 4px">👥 인력 모음 표</h3>
      <div style="font-size:12px;color:#888;margin-bottom:14px">역할 · 분야 · 이름(음절마다 띄어쓰기). 셀을 드래그해 선택 후 Ctrl+C 복사, 또는 전체 복사 버튼을 사용하세요.</div>
      <div id="personnel-table-wrap" style="overflow-x:auto;margin-top:4px"></div>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button onclick="copyPersonnelSummaryTable()" style="flex:1;background:#2e7d32;color:#fff;border:none;border-radius:6px;padding:9px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit">📋 전체 복사</button>
        <button onclick="closePersonnelTableModal()" style="flex:1;background:#e0e0e0;color:#333;border:none;border-radius:6px;padding:9px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit">닫기</button>
      </div>
    </div>
  </div>

  <!-- ── 전문가 분류별 Breakdown 모달 ─────────────────────── -->
  <div id="expertBreakdownModal" style="display:none;position:fixed;inset:0;z-index:3000;background:rgba(0,0,0,.5);align-items:center;justify-content:center;padding:20px" onclick="if(event.target===this)closeExpertBreakdown()">
    <div style="background:#fff;border-radius:10px;max-width:440px;width:100%;max-height:80vh;overflow-y:auto;padding:22px;position:relative;font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif">
      <button onclick="closeExpertBreakdown()" style="position:absolute;top:14px;right:16px;background:#e0e0e0;border:none;border-radius:50%;width:28px;height:28px;cursor:pointer;font-size:14px">✕</button>
      <h3 id="ebTitle" style="font-size:16px;font-weight:700;margin:0 0 2px">전문가 분류별 인력</h3>
      <div id="ebSub" style="font-size:12px;color:#888;margin-bottom:14px"></div>
      <div id="ebBody"></div>
    </div>
  </div>

  <!-- pptxgenjs + jszip + 사진장표 PPTX 템플릿 (base64) -->
  <script src="https://cdn.jsdelivr.net/npm/pptxgenjs@4.0.1/dist/pptxgen.bundle.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>
  <script src="/static/photo-template.b64.js"></script>

  <script>
  // ══════════════════════════════════════════════════════════
  // 데이터 주입 (서버에서 렌더링된 JSON) — 함수는 외부 JS로 분리
  // ══════════════════════════════════════════════════════════
  var parsedData = {
    projectTitle:  ${projectDataJSON}.projectTitle,
    requestMD:     ${project.required_md ?? 0},
    requestStageCount: 0,
    requestAuditDays:  0,
    clientOrg:     ${projectDataJSON}.clientOrg,
    pmName:        ${projectDataJSON}.pmName,
    stages:        ${stagesJSON},
    personFieldMap:${personFieldMapJSON},
    personGradeMap:${personGradeMapJSON},
    portalOrder:   ${portalOrderJSON},
  }
  var activeHL = null
  var correctionMode = null
  var gradeOverrides = {}

  </script>
  <script src="/static/proposal-detail.js"></script>`

  return c.html(layout(String(project.project_name), body, 'proposals'))
})

// ── 인력정보 목록 ─────────────────────────────────────────────
app.get('/personnel', async (c) => {
  const search = c.req.query('search') || ''
  const grade  = c.req.query('grade')  || ''

  let sql = `
    SELECT p.id, p.name, p.position, p.company, p.is_fulltime,
           p.auditor_grade, p.auditor_cert_no, p.phone,
           COUNT(DISTINCT pc.id) AS cert_count,
           COUNT(DISTINCT ph.id) AS audit_count,
           MIN(ph.audit_yearmonth) AS earliest_audit
    FROM personnel p
    LEFT JOIN personnel_certifications pc ON pc.personnel_id = p.id
    LEFT JOIN personnel_audit_history  ph ON ph.personnel_id = p.id
    WHERE 1=1
  `
  const params: string[] = []
  let idx = 1
  if (search) { sql += ` AND (p.name ILIKE $${idx} OR p.company ILIKE $${idx})`; params.push(`%${search}%`); idx++ }
  if (grade)  { sql += ` AND p.auditor_grade = $${idx++}`; params.push(grade) }
  sql += ` GROUP BY p.id ORDER BY TRIM(p.name) COLLATE "C" ASC`

  const list = await query<Record<string, unknown>>(sql, params)

  const gradeOptions = ['', '특급', '고급', '중급', '초급'].map(g =>
    `<option value="${g}" ${grade === g ? 'selected' : ''}>${g || '전체 등급'}</option>`
  ).join('')

  const rows = list.map((p, i) => `
    <tr class="hover:bg-indigo-50 cursor-pointer transition" onclick="location.href='/personnel/${p.id}'">
      <td class="px-4 py-3 text-center text-sm text-slate-400">${i + 1}</td>
      <td class="px-4 py-3 font-semibold text-indigo-700">${p.name}</td>
      <td class="px-4 py-3 text-sm text-slate-600">${p.position ?? '-'}</td>
      <td class="px-4 py-3 text-sm text-slate-600">${p.company ?? '-'}</td>
      <td class="px-4 py-3 text-center">
        <span class="status-badge ${p.is_fulltime ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}">
          ${p.is_fulltime ? '상근' : '비상근'}
        </span>
      </td>
      <td class="px-4 py-3 text-center text-sm">${p.auditor_grade ?? '-'}</td>
      <td class="px-4 py-3 text-center text-sm text-slate-500">${p.auditor_cert_no ?? '-'}</td>
      <td class="px-4 py-3 text-center text-sm">${fmtCareer(p.earliest_audit as string)}</td>
      <td class="px-4 py-3 text-center text-sm text-slate-500">${p.cert_count ?? 0}개</td>
      <td class="px-4 py-3 text-center text-sm text-slate-500">${p.audit_count ?? 0}건</td>
      <td class="px-4 py-3 text-sm text-slate-500">${p.phone ?? '-'}</td>
    </tr>`).join('')

  const body = `
  <div class="p-6 md:p-8">
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-slate-800">인력정보</h1>
      <p class="text-slate-500 text-sm mt-1">총 ${list.length}명</p>
    </div>

    <div class="flex flex-wrap gap-2 mb-4 items-center">
      <form method="GET" action="/personnel" class="flex gap-2 flex-wrap">
        <input type="text" name="search" value="${search}"
          placeholder="이름 / 회사 검색..."
          class="border border-slate-200 rounded-lg px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-indigo-300">
        <select name="grade" class="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
          ${gradeOptions}
        </select>
        <button type="submit" class="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">
          <i class="fas fa-search mr-1"></i>검색
        </button>
      </form>
    </div>

    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-slate-50 text-xs text-slate-500 uppercase border-b border-slate-200">
              <th class="px-4 py-3 text-center w-10">#</th>
              <th class="px-4 py-3 text-left">이름</th>
              <th class="px-4 py-3 text-left">직위</th>
              <th class="px-4 py-3 text-left">소속</th>
              <th class="px-4 py-3 text-center">상근여부</th>
              <th class="px-4 py-3 text-center">감리등급</th>
              <th class="px-4 py-3 text-center">자격번호</th>
              <th class="px-4 py-3 text-center">감리경력</th>
              <th class="px-4 py-3 text-center">자격증</th>
              <th class="px-4 py-3 text-center">감리실적</th>
              <th class="px-4 py-3 text-left">연락처</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${rows || '<tr><td colspan="11" class="px-4 py-12 text-center text-slate-400">데이터가 없습니다.<br><a href="/upload" class="text-indigo-500 underline mt-2 inline-block">HTML 파일을 업로드해주세요</a></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  </div>`

  return c.html(layout('인력정보', body, 'personnel'))
})

// ── 인력 상세 ─────────────────────────────────────────────────
app.get('/personnel/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (isNaN(id)) return c.redirect('/personnel')

  const person = await queryOne<Record<string, unknown>>(
    'SELECT * FROM personnel WHERE id = $1', [id]
  )
  if (!person) return c.html(layout('없음', '<div class="p-8 text-center text-red-500">인력 정보를 찾을 수 없습니다</div>', 'personnel'))

  const [certs, auditHistory, itCareer] = await Promise.all([
    query<Record<string, unknown>>(
      'SELECT * FROM personnel_certifications WHERE personnel_id = $1 ORDER BY cert_year DESC', [id]
    ),
    query<Record<string, unknown>>(
      'SELECT * FROM personnel_audit_history WHERE personnel_id = $1 ORDER BY audit_yearmonth ASC', [id]
    ),
    query<Record<string, unknown>>(
      'SELECT * FROM personnel_it_career WHERE personnel_id = $1 ORDER BY period_start DESC', [id]
    ),
  ])

  // 감리 실적 표시용 정렬: 최신순(DESC)
  const auditHistoryDesc = [...auditHistory].reverse()

  // 감리경력 동적 계산: audit_history 최솟값 → fmtCareer로 n년 n개월
  const toSortableYM = (ym: string): string => {
    const m = String(ym).match(/(\d{4})[.\s년](\d{1,2})/)
    return m ? `${m[1]}.${m[2].padStart(2, '0')}` : String(ym)
  }
  const sortedYM = auditHistory
    .map(h => toSortableYM(String(h.audit_yearmonth ?? '')))
    .filter(s => /^\d{4}\.\d{2}$/.test(s))
    .sort()
  const dynamicStartDate: string | null = sortedYM[0] ?? null

  // 자격증 목록
  const certRows = certs.map(cert => `
    <tr class="border-t border-slate-100 hover:bg-slate-50">
      <td class="px-4 py-2.5 text-sm font-medium text-slate-800">${cert.cert_name}</td>
      <td class="px-4 py-2.5 text-sm text-slate-600 text-center">${cert.cert_year ?? '-'}</td>
      <td class="px-4 py-2.5 text-sm text-slate-600">${cert.issuer ?? '-'}</td>
      <td class="px-4 py-2.5 text-center">
        <span class="inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cert.is_national ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}">
          ${cert.is_national ? '국가자격' : '민간자격'}
        </span>
      </td>
      <td class="px-4 py-2.5 text-sm text-slate-500">${cert.related_field ?? '-'}</td>
    </tr>`).join('')

  // 감리 실적 목록
  const auditRows = auditHistoryDesc.map(h => `
    <tr class="border-t border-slate-100 hover:bg-slate-50">
      <td class="px-4 py-2.5 text-sm text-slate-600 text-center whitespace-nowrap">${h.audit_yearmonth ?? '-'}</td>
      <td class="px-4 py-2.5 text-sm font-medium text-slate-800 max-w-xs">
        <div class="line-clamp-2">${h.project_name}</div>
      </td>
      <td class="px-4 py-2.5 text-sm text-slate-600">${h.client_org ?? '-'}</td>
      <td class="px-4 py-2.5 text-sm text-slate-500 text-center">${h.sector ?? '-'}</td>
      <td class="px-4 py-2.5 text-sm text-slate-500 text-center">${h.domain ?? '-'}</td>
      <td class="px-4 py-2.5 text-sm text-slate-500 text-center">${h.role ?? '-'}</td>
      <td class="px-4 py-2.5 text-sm text-slate-500 text-center">${h.phase ?? '-'}</td>
      <td class="px-4 py-2.5 text-sm text-slate-500 text-center">${h.participation_rate != null ? h.participation_rate + '%' : '-'}</td>
    </tr>`).join('')

  // IT 경력 목록
  const careerRows = itCareer.map(c2 => `
    <tr class="border-t border-slate-100 hover:bg-slate-50">
      <td class="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">${c2.period_start ?? ''} ~ ${c2.period_end ?? ''}</td>
      <td class="px-4 py-2.5 text-sm font-medium text-slate-800 max-w-xs">
        <div class="line-clamp-2">${c2.project_name}</div>
      </td>
      <td class="px-4 py-2.5 text-sm text-slate-600">${c2.client_org ?? '-'}</td>
      <td class="px-4 py-2.5 text-sm text-slate-500 text-center">${c2.domain ?? '-'}</td>
      <td class="px-4 py-2.5 text-sm text-slate-500 text-center">${c2.role ?? '-'}</td>
      <td class="px-4 py-2.5 text-sm text-slate-500">${c2.company ?? '-'}</td>
      <td class="px-4 py-2.5 text-xs text-slate-400">${c2.remarks ?? '-'}</td>
    </tr>`).join('')

  // 기본 정보 항목 헬퍼
  const infoItem = (label: string, value: string) =>
    `<div class="flex gap-2 py-2 border-b border-slate-100 last:border-0">
      <span class="text-slate-400 text-xs w-24 flex-shrink-0 mt-0.5">${label}</span>
      <span class="text-sm text-slate-800 flex-1">${value || '-'}</span>
    </div>`

  const gradeBadge = (grade: string | null) => {
    const map: Record<string, string> = {
      '특급': 'bg-purple-100 text-purple-700',
      '고급': 'bg-blue-100 text-blue-700',
      '중급': 'bg-teal-100 text-teal-700',
      '초급': 'bg-slate-100 text-slate-600',
    }
    const cls = map[grade as string] ?? 'bg-slate-100 text-slate-500'
    return `<span class="inline-block px-3 py-1 rounded-full text-sm font-bold ${cls}">${grade ?? '-'}</span>`
  }

  const body = `
  <div class="p-6 md:p-8">
    <!-- 뒤로가기 + 헤더 -->
    <div class="mb-6 flex items-start gap-4">
      <a href="/personnel" class="mt-1 text-slate-400 hover:text-slate-600 transition">
        <i class="fas fa-arrow-left text-lg"></i>
      </a>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-3 flex-wrap mb-2">
          ${gradeBadge(person.auditor_grade as string)}
          <span class="inline-block px-2 py-1 rounded-full text-xs font-medium ${person.is_fulltime ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}">
            ${person.is_fulltime ? '상근' : '비상근'}
          </span>
          ${person.tech_grade ? `<span class="inline-block px-2 py-1 rounded-full text-xs bg-green-50 text-green-700">기술등급: ${person.tech_grade}</span>` : ''}
        </div>
        <h1 class="text-2xl font-bold text-slate-800">${person.name}</h1>
        <p class="text-slate-500 text-sm mt-1">${person.position ?? ''} ${person.company ? '· ' + person.company : ''}</p>
      </div>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <!-- 왼쪽 메인 -->
      <div class="xl:col-span-2 space-y-6">

        <!-- 감리 실적 -->
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-5 py-3 bg-slate-700 text-white font-semibold text-sm flex items-center justify-between">
            <span><i class="fas fa-history mr-2"></i>감리 실적 (${auditHistoryDesc.length}건)</span>
          </div>
          ${auditHistory.length > 0 ? `
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                  <th class="px-4 py-2.5 text-center whitespace-nowrap">년월</th>
                  <th class="px-4 py-2.5 text-left">사업명</th>
                  <th class="px-4 py-2.5 text-left">발주기관</th>
                  <th class="px-4 py-2.5 text-center">사업분야</th>
                  <th class="px-4 py-2.5 text-center">감리분야</th>
                  <th class="px-4 py-2.5 text-center">역할</th>
                  <th class="px-4 py-2.5 text-center">단계</th>
                  <th class="px-4 py-2.5 text-center">참여율</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">${auditRows}</tbody>
            </table>
          </div>` : `
          <div class="px-4 py-8 text-center text-slate-400 text-sm">감리 실적이 없습니다</div>`}
        </div>

        <!-- IT 경력 -->
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-5 py-3 bg-indigo-700 text-white font-semibold text-sm">
            <i class="fas fa-laptop-code mr-2"></i>IT 경력 (${itCareer.length}건)
          </div>
          ${itCareer.length > 0 ? `
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                  <th class="px-4 py-2.5 text-center">기간</th>
                  <th class="px-4 py-2.5 text-left">사업명</th>
                  <th class="px-4 py-2.5 text-left">발주기관</th>
                  <th class="px-4 py-2.5 text-center">분야</th>
                  <th class="px-4 py-2.5 text-center">역할</th>
                  <th class="px-4 py-2.5 text-left">수행사</th>
                  <th class="px-4 py-2.5 text-left">비고</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">${careerRows}</tbody>
            </table>
          </div>` : `
          <div class="px-4 py-8 text-center text-slate-400 text-sm">IT 경력이 없습니다</div>`}
        </div>

        <!-- 경력 요약 (career_summary가 있을 경우) -->
        ${person.career_summary ? `
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h3 class="font-bold text-slate-700 mb-3 text-sm"><i class="fas fa-align-left mr-2 text-slate-400"></i>경력 요약</h3>
          <p class="text-sm text-slate-600 whitespace-pre-line leading-relaxed">${person.career_summary}</p>
        </div>` : ''}

      </div>

      <!-- 오른쪽 사이드 -->
      <div class="space-y-6">

        <!-- 기본 정보 -->
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h3 class="font-bold text-slate-700 mb-3 text-sm"><i class="fas fa-id-card mr-2 text-slate-400"></i>기본 정보</h3>
          <div>
            ${infoItem('감리자격번호', String(person.auditor_cert_no ?? '-'))}
            ${infoItem('감리등급', String(person.auditor_grade ?? '-'))}
            ${infoItem('기술등급', String(person.tech_grade ?? '-'))}
            ${infoItem('감리경력', fmtCareer(dynamicStartDate ?? String(person.auditor_start_date ?? '')))}
            ${infoItem('감리시작일', dynamicStartDate ?? String(person.auditor_start_date ?? '-'))}
            ${infoItem('이메일', String(person.email ?? '-'))}
            ${infoItem('연락처', String(person.phone ?? '-'))}
            ${infoItem('생년월일', String(person.birthdate ?? '-'))}
          </div>
        </div>

        <!-- 학력 -->
        ${(person.school || person.major || person.degree) ? `
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h3 class="font-bold text-slate-700 mb-3 text-sm"><i class="fas fa-graduation-cap mr-2 text-slate-400"></i>학력</h3>
          <div>
            ${infoItem('학교', String(person.school ?? '-'))}
            ${infoItem('전공', String(person.major ?? '-'))}
            ${infoItem('학위', String(person.degree ?? '-'))}
          </div>
        </div>` : ''}

        <!-- 자격증 -->
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-4 py-3 bg-amber-50 border-b border-amber-100">
            <h3 class="font-bold text-amber-700 text-sm"><i class="fas fa-certificate mr-2"></i>자격증 (${certs.length}개)</h3>
          </div>
          ${certs.length > 0 ? `
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr class="bg-slate-50 text-xs text-slate-500 border-b">
                  <th class="px-4 py-2 text-left">자격증명</th>
                  <th class="px-4 py-2 text-center">취득연도</th>
                  <th class="px-4 py-2 text-left">발급기관</th>
                  <th class="px-4 py-2 text-center">구분</th>
                  <th class="px-4 py-2 text-left">분야</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">${certRows}</tbody>
            </table>
          </div>` : `
          <div class="px-4 py-6 text-center text-slate-400 text-sm">등록된 자격증이 없습니다</div>`}
        </div>

        <!-- 교육 이력 -->
        ${(person.education_name || person.education_org) ? `
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h3 class="font-bold text-slate-700 mb-3 text-sm"><i class="fas fa-chalkboard-teacher mr-2 text-slate-400"></i>교육 이력</h3>
          <div>
            ${infoItem('교육명', String(person.education_name ?? '-'))}
            ${infoItem('교육기관', String(person.education_org ?? '-'))}
            ${infoItem('교육시간', person.education_hours != null ? person.education_hours + '시간' : '-')}
          </div>
        </div>` : ''}

        <!-- 전문 역량 -->
        ${person.career_qualif ? `
        <div class="bg-teal-50 rounded-2xl border border-teal-200 p-5">
          <h3 class="font-bold text-teal-700 mb-2 text-sm"><i class="fas fa-star mr-2"></i>주요 경력 및 자격</h3>
          <p class="text-xs text-teal-800 whitespace-pre-line leading-relaxed">${person.career_qualif}</p>
        </div>` : ''}

        ${person.career_project ? `
        <div class="bg-orange-50 rounded-2xl border border-orange-200 p-5">
          <h3 class="font-bold text-orange-700 mb-2 text-sm"><i class="fas fa-code mr-2"></i>시스템 개발 / 프로젝트 실무 경력</h3>
          <p class="text-xs text-orange-800 whitespace-pre-line leading-relaxed">${person.career_project}</p>
        </div>` : ''}

        ${person.career_expert ? `
        <div class="bg-violet-50 rounded-2xl border border-violet-200 p-5">
          <h3 class="font-bold text-violet-700 mb-2 text-sm"><i class="fas fa-lightbulb mr-2"></i>주요 이력 (전문가용)</h3>
          <p class="text-xs text-violet-800 whitespace-pre-line leading-relaxed">${person.career_expert}</p>
        </div>` : ''}

      </div>
    </div>
  </div>`

  return c.html(layout(String(person.name), body, 'personnel'))
})

// ── HTML 파일 업로드 페이지 ───────────────────────────────────
app.get('/upload', (c) => {
  const body = `
  <div class="p-6 md:p-8">
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-slate-800">HTML 파일 업로드</h1>
      <p class="text-slate-500 text-sm mt-1">인력 프로파일 또는 사업 제안작업표 HTML을 업로드하면 자동으로 파싱하여 DB에 적재합니다.</p>
      <p class="text-amber-600 text-xs mt-1 font-medium">
        <i class="fas fa-exclamation-triangle mr-1"></i>동일한 이름(인력명/사업명)이 이미 존재하면 덮어씁니다.
        <span class="ml-2 text-slate-400">· 1회 최대 <strong class="text-indigo-600">10개</strong> 파일 병렬 처리</span>
      </p>
    </div>

    <style>
      .drop-zone { border: 2px dashed #94a3b8; transition: border-color .2s, background .2s; }
      .drop-zone.dragover { border-color: #6366f1; background: #eef2ff; }
      .log-line { font-family: monospace; font-size: 13px; }
      .log-ok   { color: #4ade80; }
      .log-err  { color: #f87171; }
      .log-info { color: #60a5fa; }
    </style>

    <div class="grid md:grid-cols-2 gap-6 mb-8">

      <!-- 인력 업로드 카드 -->
      <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
            <i class="fas fa-user text-blue-600"></i>
          </div>
          <div>
            <h2 class="font-bold text-slate-800">인력 프로파일</h2>
            <p class="text-xs text-slate-400">프로파일(성명).html · 최대 10개</p>
          </div>
        </div>
        <div id="drop-personnel"
             class="drop-zone rounded-xl p-6 text-center cursor-pointer mb-3"
             onclick="document.getElementById('file-personnel').click()">
          <i class="fas fa-cloud-upload-alt text-3xl text-slate-300 mb-2 block"></i>
          <p class="text-sm text-slate-500">파일을 여기에 드래그하거나 클릭하여 선택</p>
          <p id="fname-personnel" class="text-xs text-indigo-600 mt-1 font-medium"></p>
        </div>
        <input type="file" id="file-personnel" accept=".html" multiple class="hidden">
        <ul id="filelist-personnel" class="mb-3 space-y-1 max-h-32 overflow-y-auto hidden"></ul>
        <button id="btn-personnel" onclick="uploadFiles('personnel')"
                class="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition disabled:opacity-40"
                disabled>
          <i class="fas fa-upload mr-2"></i>인력 DB 적재
        </button>
        <div id="progress-personnel" class="mt-3 hidden">
          <div class="flex justify-between text-xs text-slate-500 mb-1">
            <span>처리 중...</span><span id="progress-personnel-text">0 / 0</span>
          </div>
          <div class="w-full bg-slate-200 rounded-full h-2">
            <div id="progress-personnel-bar" class="bg-blue-500 h-2 rounded-full transition-all" style="width:0%"></div>
          </div>
        </div>
        <div id="result-personnel" class="mt-4 hidden">
          <div class="bg-slate-50 rounded-xl p-4 text-sm space-y-1" id="result-personnel-inner"></div>
        </div>
      </div>

      <!-- 사업 업로드 카드 -->
      <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
            <i class="fas fa-briefcase text-emerald-600"></i>
          </div>
          <div>
            <h2 class="font-bold text-slate-800">사업 제안작업표</h2>
            <p class="text-xs text-slate-400">[사업명] 감리 용역.html · 최대 10개</p>
          </div>
        </div>
        <div id="drop-project"
             class="drop-zone rounded-xl p-6 text-center cursor-pointer mb-3"
             onclick="document.getElementById('file-project').click()">
          <i class="fas fa-cloud-upload-alt text-3xl text-slate-300 mb-2 block"></i>
          <p class="text-sm text-slate-500">파일을 여기에 드래그하거나 클릭하여 선택</p>
          <p id="fname-project" class="text-xs text-emerald-600 mt-1 font-medium"></p>
        </div>
        <input type="file" id="file-project" accept=".html" multiple class="hidden">
        <ul id="filelist-project" class="mb-3 space-y-1 max-h-32 overflow-y-auto hidden"></ul>
        <button id="btn-project" onclick="uploadFiles('project')"
                class="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition disabled:opacity-40"
                disabled>
          <i class="fas fa-upload mr-2"></i>사업 DB 적재
        </button>
        <div id="progress-project" class="mt-3 hidden">
          <div class="flex justify-between text-xs text-slate-500 mb-1">
            <span>처리 중...</span><span id="progress-project-text">0 / 0</span>
          </div>
          <div class="w-full bg-slate-200 rounded-full h-2">
            <div id="progress-project-bar" class="bg-emerald-500 h-2 rounded-full transition-all" style="width:0%"></div>
          </div>
        </div>
        <div id="result-project" class="mt-4 hidden">
          <div class="bg-slate-50 rounded-xl p-4 text-sm space-y-1" id="result-project-inner"></div>
        </div>
      </div>
    </div>

    <!-- 처리 로그 -->
    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-bold text-slate-700 text-sm"><i class="fas fa-terminal mr-2 text-slate-400"></i>처리 로그</h3>
        <button onclick="clearLog()" class="text-xs text-slate-400 hover:text-slate-600 transition">초기화</button>
      </div>
      <div id="log" class="min-h-16 max-h-64 overflow-y-auto space-y-0.5 bg-slate-900 rounded-xl p-4">
        <p class="log-line log-info">대기 중... HTML 파일을 선택해주세요.</p>
      </div>
    </div>
  </div>

  <script>
  const MAX_FILES = 10
  const state = { personnel: [], project: [] }

  // ── 알럿 (카드 하단 인라인) ──────────────────────────────────
  function showAlert(type, msg) {
    const id = 'alert-' + type
    let el = document.getElementById(id)
    if (!el) {
      el = document.createElement('div')
      el.id = id
      el.className = 'mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex gap-2 items-start'
      // 카드 내부 drop-zone 위쪽에 삽입
      const card = document.getElementById('drop-' + type).closest('.bg-white')
      card.appendChild(el)
    }
    el.innerHTML = \`<i class="fas fa-exclamation-circle mt-0.5 flex-shrink-0"></i><span class="whitespace-pre-line">\${msg}</span>
      <button onclick="document.getElementById('\${id}').remove()" class="ml-auto text-red-400 hover:text-red-600 flex-shrink-0"><i class="fas fa-times"></i></button>\`
  }

  function renderFileList(type) {
    const files = state[type]
    const ul = document.getElementById('filelist-' + type)
    const nameEl = document.getElementById('fname-' + type)
    const btn = document.getElementById('btn-' + type)
    if (files.length === 0) {
      ul.classList.add('hidden'); nameEl.textContent = ''; btn.disabled = true; return
    }
    ul.classList.remove('hidden')
    ul.innerHTML = files.map((f, i) =>
      \`<li class="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-3 py-1.5">
        <span class="text-slate-700 truncate max-w-[180px]"><i class="fas fa-file-code mr-1 text-slate-400"></i>\${f.name}</span>
        <button onclick="removeFile('\${type}', \${i})" class="text-slate-300 hover:text-red-500 ml-2"><i class="fas fa-times"></i></button>
      </li>\`
    ).join('')
    nameEl.textContent = files.length + '개 파일 선택됨'
    btn.disabled = false
  }

  function removeFile(type, idx) { state[type].splice(idx, 1); renderFileList(type) }

  function setupDrop(type) {
    const zone = document.getElementById('drop-' + type)
    const input = document.getElementById('file-' + type)
    input.addEventListener('change', () => { handleFiles(type, Array.from(input.files)); input.value = '' })
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover') })
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'))
    zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('dragover'); handleFiles(type, Array.from(e.dataTransfer.files)) })
  }

  function handleFiles(type, newFiles) {
    const htmlFiles = newFiles.filter(f => f.name.endsWith('.html'))
    const nonHtml = newFiles.length - htmlFiles.length
    if (nonHtml > 0) addLog('err', nonHtml + '개 파일은 HTML이 아니어서 제외됨')

    const merged = [...state[type], ...htmlFiles]

    // 10개 초과 시 알럿 + 추가 자체 차단
    if (merged.length > MAX_FILES) {
      const over = merged.length - MAX_FILES
      showAlert(type,
        \`파일은 최대 \${MAX_FILES}개까지만 업로드할 수 있습니다.\\n현재 \${state[type].length}개 선택됨 + 새 파일 \${htmlFiles.length}개 = \${merged.length}개 (초과: \${over}개)\\n\\n먼저 기존 파일을 제거하거나, 파일을 \${MAX_FILES - state[type].length}개 이하로 선택해 주세요.\`
      )
      addLog('err', \`❌ 파일 추가 불가: 최대 \${MAX_FILES}개 초과 (선택 \${merged.length}개)\`)
      return  // 추가하지 않고 즉시 종료
    }

    state[type] = merged
    if (htmlFiles.length > 0) addLog('info', htmlFiles.length + '개 파일 추가됨 (총 ' + state[type].length + '개)')
    renderFileList(type)
  }

  setupDrop('personnel')
  setupDrop('project')

  async function uploadFiles(type) {
    const files = state[type]
    if (files.length === 0) return
    const btn = document.getElementById('btn-' + type)
    const progressEl = document.getElementById('progress-' + type)
    const progressBar = document.getElementById('progress-' + type + '-bar')
    const progressText = document.getElementById('progress-' + type + '-text')
    const resultEl = document.getElementById('result-' + type)

    btn.disabled = true
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>처리 중...'
    progressEl.classList.remove('hidden')
    resultEl.classList.add('hidden')

    const total = files.length
    let done = 0
    const results = []
    addLog('info', \`[\${type}] \${total}개 파일 병렬 업로드 시작\`)
    const endpoint = type === 'personnel' ? '/api/upload/personnel' : '/api/upload/project'

    await Promise.all(files.map(async (file) => {
      const formData = new FormData()
      formData.append('file', file)
      try {
        const res = await fetch(endpoint, { method: 'POST', body: formData })
        const json = await res.json()
        done++
        progressBar.style.width = (done / total * 100) + '%'
        progressText.textContent = done + ' / ' + total
        if (json.ok) { addLog('ok', '✅ ' + file.name + ' → ' + (json.message || '완료')); results.push({ ok: true, file: file.name, data: json.data }) }
        else          { addLog('err', '❌ ' + file.name + ' → ' + (json.error || '오류')); results.push({ ok: false, file: file.name, error: json.error }) }
      } catch (e) {
        done++
        progressBar.style.width = (done / total * 100) + '%'
        progressText.textContent = done + ' / ' + total
        addLog('err', '❌ ' + file.name + ' → 네트워크 오류: ' + e.message)
        results.push({ ok: false, file: file.name, error: e.message })
      }
    }))

    const okCount = results.filter(r => r.ok).length
    const errCount = results.length - okCount
    addLog(errCount === 0 ? 'ok' : 'err', \`[\${type}] 완료 — 성공: \${okCount}개 / 실패: \${errCount}개\`)
    showBatchResult(type, results)
    btn.innerHTML = '<i class="fas fa-check mr-2"></i>완료 (재업로드 가능)'
    btn.disabled = false
    progressEl.classList.add('hidden')
    state[type] = state[type].filter((f, i) => !results[i]?.ok)
    renderFileList(type)
    if (state[type].length > 0) addLog('info', '실패한 ' + state[type].length + '개 파일이 목록에 남아있습니다.')
  }

  function showBatchResult(type, results) {
    const el = document.getElementById('result-' + type)
    const inner = document.getElementById('result-' + type + '-inner')
    el.classList.remove('hidden')
    const okList = results.filter(r => r.ok)
    const errList = results.filter(r => !r.ok)
    let html = ''
    if (okList.length > 0) {
      html += \`<p class="text-green-600 font-semibold mb-2"><i class="fas fa-check-circle mr-1"></i>성공 \${okList.length}개</p>\`
      html += okList.map(r => {
        const d = r.data
        return type === 'personnel'
          ? \`<div class="text-xs bg-white rounded-lg px-3 py-2 mb-1 border border-slate-100"><span class="font-medium text-slate-700">\${d.name}</span><span class="text-slate-400 ml-2">자격증 \${d.certifications}건 · 감리실적 \${d.audit_history}건 · IT경력 \${d.it_career}건</span></div>\`
          : \`<div class="text-xs bg-white rounded-lg px-3 py-2 mb-1 border border-slate-100"><span class="font-medium text-slate-700">\${d.project_name}</span><span class="text-slate-400 ml-2">키워드 \${d.keywords}개 · 단계 \${d.phases} · 인력 \${d.proposal_members}명</span></div>\`
      }).join('')
    }
    if (errList.length > 0) {
      html += \`<p class="text-red-600 font-semibold mt-2 mb-1"><i class="fas fa-times-circle mr-1"></i>실패 \${errList.length}개</p>\`
      html += errList.map(r => \`<div class="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-1.5 mb-1">\${r.file}: \${r.error}</div>\`).join('')
    }
    inner.innerHTML = html
  }

  function addLog(type, msg) {
    const log = document.getElementById('log')
    const p = document.createElement('p')
    const ts = new Date().toLocaleTimeString('ko-KR', {hour:'2-digit',minute:'2-digit',second:'2-digit'})
    p.className = 'log-line log-' + type
    p.textContent = '[' + ts + '] ' + msg
    log.appendChild(p)
    log.scrollTop = log.scrollHeight
  }

  function clearLog() { document.getElementById('log').innerHTML = '<p class="log-line log-info">로그 초기화됨</p>' }
  </script>`

  return c.html(layout('HTML 업로드', body, 'upload'))
})

export default app
