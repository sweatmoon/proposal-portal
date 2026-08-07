/**
 * 메인화면 라우트 + 제안작업표 목록/상세 라우트
 */
import { Hono } from 'hono'
import { query, queryOne } from '../db/client.js'
import { layout, statusBadge, fmtMoney, fmtDate } from '../views/layout.js'
import { uploadHtml } from '../upload-html.js'

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
    <tr class="hover:bg-indigo-50 cursor-pointer transition" onclick="location.href='/proposals/${p.id}'">
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
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${rows || '<tr><td colspan="10" class="px-4 py-12 text-center text-slate-400">데이터가 없습니다.<br><a href="/upload" class="text-indigo-500 underline mt-2 inline-block">HTML 파일을 업로드해주세요</a></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  </div>`

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
            'total_md', pa.total_md, 'is_fulltime', pa.is_fulltime
          ) ORDER BY pa.id
        ) FILTER (WHERE pa.id IS NOT NULL), '[]') AS assignments
      FROM audit_phases ph
      LEFT JOIN audit_phase_assignments pa ON pa.phase_id = ph.id
      WHERE ph.project_id = $1
      GROUP BY ph.id ORDER BY ph.phase_order, ph.id
    `, [id]),
    query<Record<string, unknown>>(`SELECT * FROM proposal_members WHERE project_id = $1 ORDER BY member_group, id`, [id]),
    query<Record<string, unknown>>(`SELECT * FROM keywords WHERE project_id = $1 ORDER BY sort_order`, [id]),
    query<Record<string, unknown>>(`SELECT * FROM proposal_files WHERE project_id = $1 ORDER BY id`, [id]),
    query<Record<string, unknown>>(`SELECT * FROM proposal_attachments_toc WHERE project_id = $1 ORDER BY item_order`, [id]),
  ])

  // 키워드 태그
  const kwTags = keywords.map(k =>
    `<span class="inline-block px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full text-xs">${k.keyword}</span>`
  ).join(' ')

  // 감리 단계 테이블
  const phaseRows = phases.map(ph => {
    const assigns = ph.assignments as Record<string, unknown>[]
    const assignRows = assigns.map((a: Record<string, unknown>) => `
      <tr class="text-xs border-t border-slate-100">
        <td class="px-3 py-2 text-slate-600">${a.domain ?? '-'}</td>
        <td class="px-3 py-2 font-medium">${a.person_name}</td>
        <td class="px-3 py-2 text-center text-slate-500">${a.member_type ?? '-'}</td>
        <td class="px-3 py-2 text-center">${a.pre_survey_md ?? 0}</td>
        <td class="px-3 py-2 text-center">${a.audit_md ?? 0}</td>
        <td class="px-3 py-2 text-center">${a.action_confirm_md ?? 0}</td>
        <td class="px-3 py-2 text-center font-semibold text-indigo-700">${a.total_md ?? 0}</td>
        <td class="px-3 py-2 text-center text-slate-500">${a.is_fulltime ? '상근' : '비상근'}</td>
      </tr>`).join('')

    return `
    <div class="mb-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div class="bg-slate-700 text-white px-4 py-2 flex items-center justify-between">
        <span class="font-semibold text-sm">${ph.phase_name}</span>
        <span class="text-xs text-slate-300">${ph.phase_start_date ?? ''} ~ ${ph.phase_end_date ?? ''} · ${ph.phase_days ?? '-'}일 · ${ph.proposed_md ?? 0}MD</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead><tr class="bg-slate-50 text-slate-500">
            <th class="px-3 py-2 text-left">분야</th>
            <th class="px-3 py-2 text-left">성명</th>
            <th class="px-3 py-2 text-center">구분</th>
            <th class="px-3 py-2 text-center">사전조사</th>
            <th class="px-3 py-2 text-center">감리</th>
            <th class="px-3 py-2 text-center">조치확인</th>
            <th class="px-3 py-2 text-center">합계</th>
            <th class="px-3 py-2 text-center">상근여부</th>
          </tr></thead>
          <tbody>${assignRows || '<tr><td colspan="8" class="px-3 py-3 text-center text-slate-400">배정 인력 없음</td></tr>'}</tbody>
        </table>
      </div>
    </div>`
  }).join('')

  // 제안 인력 테이블
  const memberRows = members.map(m => `
    <tr class="hover:bg-slate-50 text-sm border-t border-slate-100">
      <td class="px-4 py-2.5 text-slate-500 text-xs">${m.member_group ?? '-'}</td>
      <td class="px-4 py-2.5 font-medium">${m.person_name}</td>
      <td class="px-4 py-2.5 text-slate-600 text-xs">${m.member_type ?? '-'}</td>
      <td class="px-4 py-2.5 text-slate-600 text-xs">${m.domain ?? '-'}</td>
      <td class="px-4 py-2.5 text-center">${m.total_md ?? 0} MD</td>
      <td class="px-4 py-2.5 text-center text-xs text-slate-500">${m.is_fulltime ? '상근' : '비상근'}</td>
      <td class="px-4 py-2.5 text-slate-600 text-xs">${m.auditor_grade ?? '-'}</td>
      <td class="px-4 py-2.5 text-slate-500 text-xs">${m.phone ?? '-'}</td>
    </tr>`).join('')

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

        <!-- 감리 단계별 인력 배정 -->
        ${phases.length > 0 ? `
        <div>
          <h2 class="font-bold text-slate-700 mb-3 flex items-center gap-2">
            <i class="fas fa-tasks text-slate-400"></i> 감리 단계별 인력 배정
          </h2>
          ${phaseRows}
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
  </div>`

  return c.html(layout(String(project.project_name), body, 'proposals'))
})

// ── 인력정보 목록 ─────────────────────────────────────────────
app.get('/personnel', async (c) => {
  const search = c.req.query('search') || ''
  const grade  = c.req.query('grade')  || ''

  let sql = `
    SELECT p.id, p.name, p.position, p.company, p.is_fulltime,
           p.auditor_grade, p.auditor_cert_no, p.auditor_career_yrs, p.phone,
           COUNT(DISTINCT pc.id) AS cert_count,
           COUNT(DISTINCT ph.id) AS audit_count
    FROM personnel p
    LEFT JOIN personnel_certifications pc ON pc.personnel_id = p.id
    LEFT JOIN personnel_audit_history  ph ON ph.personnel_id = p.id
    WHERE 1=1
  `
  const params: string[] = []
  let idx = 1
  if (search) { sql += ` AND (p.name ILIKE $${idx} OR p.company ILIKE $${idx})`; params.push(`%${search}%`); idx++ }
  if (grade)  { sql += ` AND p.auditor_grade = $${idx++}`; params.push(grade) }
  sql += ` GROUP BY p.id ORDER BY p.name`

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
      <td class="px-4 py-3 text-center text-sm">${p.auditor_career_yrs != null ? Number(p.auditor_career_yrs).toFixed(1) + '년' : '-'}</td>
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
      'SELECT * FROM personnel_audit_history WHERE personnel_id = $1 ORDER BY audit_yearmonth DESC', [id]
    ),
    query<Record<string, unknown>>(
      'SELECT * FROM personnel_it_career WHERE personnel_id = $1 ORDER BY period_start DESC', [id]
    ),
  ])

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
  const auditRows = auditHistory.map(h => `
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
            <span><i class="fas fa-history mr-2"></i>감리 실적 (${auditHistory.length}건)</span>
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
            ${infoItem('감리경력', person.auditor_career_yrs != null ? Number(person.auditor_career_yrs).toFixed(1) + '년' : '-')}
            ${infoItem('감리시작일', String(person.auditor_start_date ?? '-'))}
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
          <h3 class="font-bold text-teal-700 mb-2 text-sm"><i class="fas fa-star mr-2"></i>자격 사항</h3>
          <p class="text-xs text-teal-800 whitespace-pre-line leading-relaxed">${person.career_qualif}</p>
        </div>` : ''}

        ${person.career_expert ? `
        <div class="bg-violet-50 rounded-2xl border border-violet-200 p-5">
          <h3 class="font-bold text-violet-700 mb-2 text-sm"><i class="fas fa-lightbulb mr-2"></i>전문 분야</h3>
          <p class="text-xs text-violet-800 whitespace-pre-line leading-relaxed">${person.career_expert}</p>
        </div>` : ''}

      </div>
    </div>
  </div>`

  return c.html(layout(String(person.name), body, 'personnel'))
})

// ── HTML 파일 업로드 페이지 ───────────────────────────────────
app.get('/upload', (c) => c.html(uploadHtml))

export default app
