/**
 * 업로드 페이지 HTML
 * 인력 / 사업 HTML 파일 업로드 → 파싱 → DB 적재
 */
export const uploadHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>파일 업로드 — 제안팀 포털</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css">
  <style>
    .drop-zone {
      border: 2px dashed #94a3b8;
      transition: border-color .2s, background .2s;
    }
    .drop-zone.dragover {
      border-color: #6366f1;
      background: #eef2ff;
    }
    .log-line { font-family: monospace; font-size: 13px; }
    .log-ok   { color: #16a34a; }
    .log-err  { color: #dc2626; }
    .log-info { color: #2563eb; }
  </style>
</head>
<body class="bg-slate-50 min-h-screen">

<!-- 상단 네비 -->
<nav class="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-6 shadow-sm">
  <span class="font-bold text-indigo-700 text-lg"><i class="fas fa-building mr-2"></i>제안팀 포털</span>
  <a href="/upload" class="text-indigo-600 font-medium text-sm"><i class="fas fa-upload mr-1"></i>업로드</a>
</nav>

<div class="max-w-4xl mx-auto px-6 py-10">
  <h1 class="text-2xl font-bold text-slate-800 mb-2">
    <i class="fas fa-file-upload text-indigo-500 mr-2"></i>HTML 파일 업로드
  </h1>
  <p class="text-slate-500 text-sm mb-8">인력 프로파일 또는 사업 제안작업표 HTML을 업로드하면 자동으로 파싱하여 DB에 적재합니다.<br>
  <span class="text-amber-600 font-medium">동일한 이름(인력명/사업명)이 이미 존재하면 덮어씁니다.</span></p>

  <div class="grid md:grid-cols-2 gap-6">

    <!-- 인력 업로드 카드 -->
    <div class="bg-white rounded-2xl shadow border border-slate-200 p-6">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
          <i class="fas fa-user text-blue-600"></i>
        </div>
        <div>
          <h2 class="font-bold text-slate-800">인력 프로파일</h2>
          <p class="text-xs text-slate-400">프로파일(성명).html</p>
        </div>
      </div>

      <div id="drop-personnel"
           class="drop-zone rounded-xl p-6 text-center cursor-pointer mb-4"
           onclick="document.getElementById('file-personnel').click()">
        <i class="fas fa-cloud-upload-alt text-3xl text-slate-300 mb-2"></i>
        <p class="text-sm text-slate-500">파일을 여기에 드래그하거나 클릭하여 선택</p>
        <p id="fname-personnel" class="text-xs text-indigo-600 mt-1 font-medium"></p>
      </div>
      <input type="file" id="file-personnel" accept=".html" class="hidden">

      <button id="btn-personnel"
              onclick="uploadFile('personnel')"
              class="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition disabled:opacity-40"
              disabled>
        <i class="fas fa-upload mr-2"></i>인력 DB 적재
      </button>

      <!-- 적재 결과 요약 -->
      <div id="result-personnel" class="mt-4 hidden">
        <div class="bg-slate-50 rounded-xl p-4 text-sm space-y-1" id="result-personnel-inner"></div>
      </div>
    </div>

    <!-- 사업 업로드 카드 -->
    <div class="bg-white rounded-2xl shadow border border-slate-200 p-6">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
          <i class="fas fa-briefcase text-emerald-600"></i>
        </div>
        <div>
          <h2 class="font-bold text-slate-800">사업 제안작업표</h2>
          <p class="text-xs text-slate-400">[사업명] 감리 용역.html</p>
        </div>
      </div>

      <div id="drop-project"
           class="drop-zone rounded-xl p-6 text-center cursor-pointer mb-4"
           onclick="document.getElementById('file-project').click()">
        <i class="fas fa-cloud-upload-alt text-3xl text-slate-300 mb-2"></i>
        <p class="text-sm text-slate-500">파일을 여기에 드래그하거나 클릭하여 선택</p>
        <p id="fname-project" class="text-xs text-emerald-600 mt-1 font-medium"></p>
      </div>
      <input type="file" id="file-project" accept=".html" class="hidden">

      <button id="btn-project"
              onclick="uploadFile('project')"
              class="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition disabled:opacity-40"
              disabled>
        <i class="fas fa-upload mr-2"></i>사업 DB 적재
      </button>

      <!-- 적재 결과 요약 -->
      <div id="result-project" class="mt-4 hidden">
        <div class="bg-slate-50 rounded-xl p-4 text-sm space-y-1" id="result-project-inner"></div>
      </div>
    </div>
  </div>

  <!-- 처리 로그 -->
  <div class="mt-8 bg-white rounded-2xl shadow border border-slate-200 p-6">
    <div class="flex items-center justify-between mb-3">
      <h3 class="font-bold text-slate-700 text-sm"><i class="fas fa-terminal mr-2 text-slate-400"></i>처리 로그</h3>
      <button onclick="clearLog()" class="text-xs text-slate-400 hover:text-slate-600">초기화</button>
    </div>
    <div id="log" class="min-h-16 max-h-64 overflow-y-auto space-y-0.5 bg-slate-900 rounded-xl p-4">
      <p class="log-line log-info">대기 중... HTML 파일을 선택해주세요.</p>
    </div>
  </div>
</div>

<script>
// ── 드래그 앤 드롭 & 파일 선택 ──────────────────────────────
const state = { personnel: null, project: null }

function setupDrop(type) {
  const zone = document.getElementById('drop-' + type)
  const input = document.getElementById('file-' + type)
  const nameEl = document.getElementById('fname-' + type)
  const btn = document.getElementById('btn-' + type)

  input.addEventListener('change', () => {
    const f = input.files[0]
    if (f) {
      state[type] = f
      nameEl.textContent = f.name
      btn.disabled = false
      addLog('info', '선택됨: ' + f.name + ' (' + (f.size/1024).toFixed(1) + ' KB)')
    }
  })

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover') })
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'))
  zone.addEventListener('drop', e => {
    e.preventDefault()
    zone.classList.remove('dragover')
    const f = e.dataTransfer.files[0]
    if (f && f.name.endsWith('.html')) {
      state[type] = f
      nameEl.textContent = f.name
      btn.disabled = false
      addLog('info', '드롭됨: ' + f.name + ' (' + (f.size/1024).toFixed(1) + ' KB)')
    } else {
      addLog('err', 'HTML 파일만 업로드할 수 있습니다')
    }
  })
}
setupDrop('personnel')
setupDrop('project')

// ── 업로드 처리 ──────────────────────────────────────────────
async function uploadFile(type) {
  const file = state[type]
  if (!file) return

  const btn = document.getElementById('btn-' + type)
  const resultEl = document.getElementById('result-' + type)
  const resultInner = document.getElementById('result-' + type + '-inner')

  btn.disabled = true
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>처리 중...'
  resultEl.classList.add('hidden')

  addLog('info', '[' + type + '] 업로드 시작: ' + file.name)

  const formData = new FormData()
  formData.append('file', file)

  try {
    const endpoint = type === 'personnel'
      ? '/api/upload/personnel'
      : '/api/upload/project'

    const res = await fetch(endpoint, { method: 'POST', body: formData })
    const json = await res.json()

    if (json.ok) {
      addLog('ok', '[' + type + '] ✅ ' + json.message)
      showResult(type, json.data, true)

      // 성공 후 버튼 상태 유지 (재업로드 가능)
      btn.innerHTML = '<i class="fas fa-check mr-2"></i>적재 완료 (재업로드 가능)'
      btn.disabled = false
    } else {
      addLog('err', '[' + type + '] ❌ ' + json.error)
      showResult(type, { error: json.error }, false)
      btn.innerHTML = '<i class="fas fa-upload mr-2"></i>' + (type === 'personnel' ? '인력' : '사업') + ' DB 적재'
      btn.disabled = false
    }
  } catch (e) {
    addLog('err', '[' + type + '] 네트워크 오류: ' + e.message)
    btn.innerHTML = '<i class="fas fa-upload mr-2"></i>' + (type === 'personnel' ? '인력' : '사업') + ' DB 적재'
    btn.disabled = false
  }
}

// ── 결과 요약 표시 ────────────────────────────────────────────
function showResult(type, data, ok) {
  const el = document.getElementById('result-' + type)
  const inner = document.getElementById('result-' + type + '-inner')
  el.classList.remove('hidden')

  if (!ok) {
    inner.innerHTML = '<p class="text-red-600 font-medium"><i class="fas fa-times-circle mr-1"></i>' + (data.error || '오류') + '</p>'
    return
  }

  const rows = []
  if (type === 'personnel') {
    rows.push(['<i class="fas fa-user mr-1 text-blue-500"></i>인력명', data.name])
    rows.push(['<i class="fas fa-certificate mr-1 text-yellow-500"></i>자격증', data.certifications + '건'])
    rows.push(['<i class="fas fa-history mr-1 text-indigo-500"></i>감리실적', data.audit_history + '건'])
    rows.push(['<i class="fas fa-briefcase mr-1 text-slate-500"></i>IT경력', data.it_career + '건'])
  } else {
    rows.push(['<i class="fas fa-building mr-1 text-emerald-600"></i>사업명', data.project_name])
    rows.push(['<i class="fas fa-tags mr-1 text-amber-500"></i>키워드', data.keywords + '개'])
    rows.push(['<i class="fas fa-calendar-alt mr-1 text-blue-500"></i>감리단계', data.phases + '단계'])
    rows.push(['<i class="fas fa-users mr-1 text-indigo-500"></i>단계배정', data.phase_assignments + '건'])
    rows.push(['<i class="fas fa-user-tie mr-1 text-slate-500"></i>제안인력', data.proposal_members + '명'])
    rows.push(['<i class="fas fa-file mr-1 text-red-400"></i>제안파일', data.proposal_files + '건'])
    rows.push(['<i class="fas fa-list mr-1 text-slate-400"></i>첨부목차', data.attachments_toc + '건'])
  }

  inner.innerHTML = '<p class="text-green-600 font-semibold mb-2"><i class="fas fa-check-circle mr-1"></i>적재 완료</p>'
    + rows.map(([k, v]) => \`<div class="flex justify-between text-xs"><span class="text-slate-500">\${k}</span><span class="font-medium text-slate-800">\${v}</span></div>\`).join('')
}

// ── 로그 ──────────────────────────────────────────────────────
function addLog(type, msg) {
  const log = document.getElementById('log')
  const p = document.createElement('p')
  const ts = new Date().toLocaleTimeString('ko-KR', {hour:'2-digit',minute:'2-digit',second:'2-digit'})
  p.className = 'log-line log-' + type
  p.textContent = '[' + ts + '] ' + msg
  log.appendChild(p)
  log.scrollTop = log.scrollHeight
}

function clearLog() {
  document.getElementById('log').innerHTML = '<p class="log-line log-info">로그 초기화됨</p>'
}
</script>
</body>
</html>
`
