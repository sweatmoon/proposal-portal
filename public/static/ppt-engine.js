/**
 * ppt-engine.js
 * ──────────────────────────────────────────────────────────────
 * PPT 자동화 고도화 엔진
 *
 * 구조:
 *   ProjectViewModel  — 데이터 표준화 (HTML Parser / DB Loader 양쪽 추상화)
 *   PptMenuRegistry   — DB에서 로드한 메뉴/규칙 캐시
 *   generateMenuPpt() — 단일 메뉴 PPT 생성 (메뉴 코드 → {zip, slideCount})
 *   generateProposalPpt() — 전체 메뉴 순서대로 생성 후 합본
 *   mergePresentationZips() — 범용 PPTX 합본 (STANDARD + FOREIGN_TEMPLATE)
 *
 * 기존 Generator 함수들은 그대로 유지하면서
 * 이 모듈이 메뉴 디스패처 역할을 담당한다.
 * ──────────────────────────────────────────────────────────────
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
// 1. ProjectViewModel — 표준 데이터 구조
//    parsedData (HTML 파서 산출물)를 ViewModel로 변환
// ═══════════════════════════════════════════════════════════════

/**
 * parsedData → ProjectViewModel 변환
 * 기존 parsedData 구조를 그대로 활용하면서 표준 인터페이스를 제공
 *
 * @param {object} pd - parsedData (기존 HTML 파서 결과)
 * @returns {object} ProjectViewModel
 */
function buildProjectViewModel(pd) {
  if (!pd) return null;

  // 인력을 역할별로 분류
  const allMembers = (pd.portalOrder || []).map(({ name }) => {
    const info = pd.personGradeMap?.[name] || {};
    const field = pd.personFieldMap?.[name] || '';
    const group = info.group || '';
    return { name, field, grade: info.grade || '', group, residency: info.residency || '', certNo: info.certNo || '' };
  });

  const auditMembers   = allMembers.filter(m => !m.group || m.group === '감리원');
  const coreExperts    = allMembers.filter(m => m.group === '핵심기술');
  const requiredExperts = allMembers.filter(m => m.group === '필수기술');
  const securityExperts = allMembers.filter(m => m.group === '보안');
  const testers        = allMembers.filter(m => m.group === '테스터');

  return {
    // ── 프로젝트 기본 정보
    project: {
      title: pd.projectTitle || '',
      client: pd.clientOrg || '',
      period: pd.projectPeriod || '',
      budget: pd.budget || '',
    },
    // ── 감리 단계 (stages) — 기존 구조 그대로
    stages: pd.stages || [],
    // ── 전체 인력 (순서 포함)
    members: allMembers,
    portalOrder: pd.portalOrder || [],
    // ── 역할별 분류
    auditMembers,
    coreExperts,
    requiredExperts,
    securityExperts,
    testers,
    // ── 원시 맵 (기존 함수 호환용)
    personGradeMap: pd.personGradeMap || {},
    personFieldMap: pd.personFieldMap || {},
    // ── 요구사항 / 리스크 (향후 확장)
    requirements: pd.requirements || [],
    risks: pd.risks || [],
    keywords: pd.keywords || [],
    // ── 요약 (computeSummaryTableData 등 결과 캐시용)
    summary: pd.summary || null,
    // ── 원본 parsedData 보관 (기존 함수가 직접 접근할 경우)
    _raw: pd,
  };
}

// ═══════════════════════════════════════════════════════════════
// 2. PptMenuRegistry — DB 메뉴 캐시
// ═══════════════════════════════════════════════════════════════

const PptMenuRegistry = (() => {
  let _cache = null;          // { byCode: {DETAIL_SCHEDULE: {...}}, list: [...] }
  let _fetchPromise = null;

  async function load(force = false) {
    if (_cache && !force) return _cache;
    if (_fetchPromise) return _fetchPromise;
    _fetchPromise = fetch('/api/ppt-menus')
      .then(r => r.json())
      .then(json => {
        if (!json.ok) throw new Error('메뉴 로드 실패: ' + json.error);
        // 트리 → 플랫 리스트로 펼치기
        const list = [];
        function flatten(nodes) {
          (nodes || []).forEach(n => {
            list.push(n);
            if (n.children?.length) flatten(n.children);
          });
        }
        flatten(json.data);
        // rule이 있는 메뉴만 실행 가능
        const byCode = {};
        list.forEach(m => { if (m.rule) byCode[m.menu_code] = m; });
        _cache = { byCode, list, tree: json.data };
        _fetchPromise = null;
        return _cache;
      });
    return _fetchPromise;
  }

  function invalidate() { _cache = null; }

  return { load, invalidate };
})();

// ═══════════════════════════════════════════════════════════════
// 3. 범용 mergePresentationZips()
//    - STANDARD: slide XML + rels만 복사 (기존 방식)
//    - FOREIGN_TEMPLATE: master/theme/layout/media까지 복사
// ═══════════════════════════════════════════════════════════════

/**
 * 여러 {zip, mergeStrategy} 파트를 baseZip으로 합본
 *
 * @param {Array<{zip: JSZip, mergeStrategy?: string, slideCount?: number}>} parts
 * @returns {Promise<JSZip>} 합본된 JSZip 객체
 */
async function mergePresentationZips(parts) {
  const usable = parts.filter(p => p && p.zip);
  if (!usable.length) throw new Error('병합할 슬라이드가 없습니다.');

  const baseZip = usable[0].zip;

  let presXml    = await baseZip.file('ppt/presentation.xml').async('string');
  let presRelsXml = await baseZip.file('ppt/_rels/presentation.xml.rels').async('string');
  let ctXml      = await baseZip.file('[Content_Types].xml').async('string');

  let maxRid   = 0; presRelsXml.replace(/Id="rId(\d+)"/g, (_, n) => { maxRid   = Math.max(maxRid,   +n); return _; });
  let maxSldId = 255; presXml.replace(/<p:sldId id="(\d+)"/g, (_, n) => { maxSldId = Math.max(maxSldId, +n); return _; });

  // master/theme/layout 중복 방지용 경로 → 새 rId 맵
  const foreignPathMap = {};   // origPath → { newPath, newRid }
  let   masterIdx = 100, themeIdx = 100, layoutIdx = 100;

  let newRels = '', newIds = '', newCt = '';
  let sc = 0;

  for (let i = 1; i < usable.length; i++) {
    const part      = usable[i];
    const srcZip    = part.zip;
    const isForeign = (part.mergeStrategy === 'FOREIGN_TEMPLATE');

    const srcPresRels = await srcZip.file('ppt/_rels/presentation.xml.rels').async('string');

    if (isForeign) {
      // ── FOREIGN_TEMPLATE: master/theme/layout/media까지 복사 ──
      await _mergeForeign({
        baseZip, srcZip, srcPresRels,
        presXmlRef: { val: presXml },
        presRelsXmlRef: { val: presRelsXml },
        ctXmlRef: { val: ctXml },
        counters: { maxRid, maxSldId, masterIdx, themeIdx, layoutIdx, sc },
        foreignPathMap,
        newCt_ref: { val: newCt },
        newRels_ref: { val: newRels },
        newIds_ref: { val: newIds },
      });
      // 카운터 동기화
      ({ maxRid, maxSldId, masterIdx, themeIdx, layoutIdx, sc } = {
        maxRid:     _counters.maxRid,
        maxSldId:   _counters.maxSldId,
        masterIdx:  _counters.masterIdx,
        themeIdx:   _counters.themeIdx,
        layoutIdx:  _counters.layoutIdx,
        sc:         _counters.sc,
      });
      newRels = _counters.newRels;
      newIds  = _counters.newIds;
      newCt   = _counters.newCt;
      presXml     = _counters.presXml;
      presRelsXml = _counters.presRelsXml;
      ctXml       = _counters.ctXml;
    } else {
      // ── STANDARD: slide + rels만 복사 (기존 방식) ──
      const relMap = {};
      srcPresRels.replace(/<Relationship\b[^>]*\/>/g, tag => {
        const id   = tag.match(/\bId="([^"]+)"/)?.[1];
        const tgt  = tag.match(/\bTarget="([^"]+)"/)?.[1];
        const type = tag.match(/\bType="([^"]+)"/)?.[1] || '';
        if (id && tgt && type.includes('slide') && !type.includes('slideLayout') && !type.includes('slideMaster')) relMap[id] = tgt;
        return tag;
      });

      for (const [, tgt] of Object.entries(relMap)) {
        const xml  = await srcZip.file('ppt/' + tgt).async('string').catch(() => null);
        if (!xml) continue;
        const relsPath = 'ppt/' + tgt.replace(/([^/]+)$/, '_rels/$1.rels');
        const rels = await srcZip.file(relsPath).async('string').catch(() => null);
        const newName = 'slideM' + (++sc) + '.xml';
        baseZip.file('ppt/slides/' + newName, xml);
        if (rels) baseZip.file('ppt/slides/_rels/' + newName + '.rels', rels);
        const rid  = 'rId' + (++maxRid); const sldId = ++maxSldId;
        newRels += `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/${newName}"/>`;
        newIds  += `<p:sldId id="${sldId}" r:id="${rid}"/>`;
        newCt   += `<Override PartName="/ppt/slides/${newName}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
      }
    }
  }

  presRelsXml = presRelsXml.replace('</Relationships>', newRels + '</Relationships>');
  presXml     = presXml.replace('</p:sldIdLst>', newIds + '</p:sldIdLst>');
  ctXml       = ctXml.replace('</Types>', newCt + '</Types>');
  baseZip.file('ppt/presentation.xml', presXml);
  baseZip.file('ppt/_rels/presentation.xml.rels', presRelsXml);
  baseZip.file('[Content_Types].xml', ctXml);

  return baseZip;
}

// foreign merge 전용 내부 카운터 공유 객체
const _counters = {};

/**
 * FOREIGN_TEMPLATE 병합 내부 함수
 * master / theme / layout / media 참조 구조를 그대로 복사
 */
async function _mergeForeign({ baseZip, srcZip, srcPresRels, counters,
                                foreignPathMap, presXmlRef, presRelsXmlRef, ctXmlRef,
                                newRels_ref, newIds_ref, newCt_ref }) {
  let { maxRid, maxSldId, masterIdx, themeIdx, layoutIdx, sc } = counters;
  let newRels = newRels_ref.val, newIds = newIds_ref.val, newCt = newCt_ref.val;
  let presXml = presXmlRef.val, presRelsXml = presRelsXmlRef.val, ctXml = ctXmlRef.val;

  // src의 slide → master/layout 관계 맵을 재귀적으로 구축
  async function getFileText(path) {
    const f = srcZip.file(path);
    return f ? f.async('string') : null;
  }
  async function getFileBytes(path) {
    const f = srcZip.file(path);
    return f ? f.async('uint8array') : null;
  }

  // slideLayout → slideMaster → theme 체인 복사
  async function ensureMaster(origMasterPath) {
    if (foreignPathMap[origMasterPath]) return foreignPathMap[origMasterPath];

    const masterXml = await getFileText(origMasterPath);
    if (!masterXml) return null;

    const newMasterName = `slideMasterF${++masterIdx}.xml`;
    const newMasterPath = `ppt/slideMasters/${newMasterName}`;

    // master의 .rels 파싱 (theme, layout 참조)
    const origMasterRelsPath = origMasterPath.replace(/([^/]+)$/, '_rels/$1.rels').replace('ppt/', 'ppt/');
    let masterRelsXml = await getFileText(origMasterRelsPath) || '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';

    // theme 복사
    let newMasterRels = masterRelsXml;
    const themeMatches = [...masterRelsXml.matchAll(/<Relationship\b[^>]*Target="[^"]*theme[^"]*"[^>]*\/>/g)];
    for (const m of themeMatches) {
      const origRelTarget = m[0].match(/Target="([^"]+)"/)?.[1];
      if (!origRelTarget) continue;
      const origThemePath = 'ppt/slideMasters/' + origRelTarget;
      const absThemePath  = origThemePath.replace(/\/[^/]+\/\.\.\//g, '/');

      if (!foreignPathMap[absThemePath]) {
        const themeBytes = await getFileBytes(absThemePath);
        if (themeBytes) {
          const newThemeName = `themeF${++themeIdx}.xml`;
          const newThemePath = `ppt/theme/${newThemeName}`;
          baseZip.file(newThemePath, themeBytes);
          foreignPathMap[absThemePath] = newThemePath;
          newCt += `<Override PartName="/${newThemePath}" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>`;
        }
      }
      if (foreignPathMap[absThemePath]) {
        const relNewTarget = '../../' + foreignPathMap[absThemePath];
        newMasterRels = newMasterRels.replace(origRelTarget, relNewTarget);
      }
    }

    baseZip.file(newMasterPath, masterXml);
    baseZip.file(newMasterPath.replace(/([^/]+)$/, '_rels/$1.rels').replace('ppt/', 'ppt/'), newMasterRels);
    newCt += `<Override PartName="/${newMasterPath}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>`;

    // presentation.xml.rels에 master 등록
    const masterRid = `rId${++maxRid}`;
    presRelsXml = presRelsXml.replace('</Relationships>',
      `<Relationship Id="${masterRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/${newMasterName}"/></Relationships>`);
    presXml = presXml.replace('</p:sldMasterIdLst>',
      `<p:sldMasterId id="${700 + masterIdx}" r:id="${masterRid}"/></p:sldMasterIdLst>`);

    foreignPathMap[origMasterPath] = { newPath: newMasterPath, masterRid, newMasterName };
    return foreignPathMap[origMasterPath];
  }

  async function ensureLayout(origLayoutPath, masterInfo) {
    if (foreignPathMap[origLayoutPath]) return foreignPathMap[origLayoutPath];

    const layoutXml = await getFileText(origLayoutPath);
    if (!layoutXml) return null;

    const newLayoutName = `slideLayoutF${++layoutIdx}.xml`;
    const newLayoutPath = `ppt/slideLayouts/${newLayoutName}`;

    // layout .rels: master 참조를 새 master로 교체
    const origLayoutRelsPath = origLayoutPath.replace(/([^/]+)$/, '_rels/$1.rels').replace('ppt/', 'ppt/');
    let layoutRelsXml = await getFileText(origLayoutRelsPath) || '';
    if (masterInfo?.newMasterName && layoutRelsXml) {
      layoutRelsXml = layoutRelsXml.replace(/Target="[^"]*slideMasters\/[^"]+"/g,
        `Target="../slideMasters/${masterInfo.newMasterName}"`);
    }

    baseZip.file(newLayoutPath, layoutXml);
    if (layoutRelsXml) baseZip.file(`ppt/slideLayouts/_rels/${newLayoutName}.rels`, layoutRelsXml);
    newCt += `<Override PartName="/${newLayoutPath}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>`;

    foreignPathMap[origLayoutPath] = { newPath: newLayoutPath, newLayoutName };
    return foreignPathMap[origLayoutPath];
  }

  // src 슬라이드 순회
  const slideRelMap = {};
  srcPresRels.replace(/<Relationship\b[^>]*\/>/g, tag => {
    const id   = tag.match(/\bId="([^"]+)"/)?.[1];
    const tgt  = tag.match(/\bTarget="([^"]+)"/)?.[1];
    const type = tag.match(/\bType="([^"]+)"/)?.[1] || '';
    if (id && tgt && type.includes('/slide') && !type.includes('Layout') && !type.includes('Master')) {
      slideRelMap[id] = tgt;
    }
    return tag;
  });

  for (const [, tgt] of Object.entries(slideRelMap)) {
    const slideXml = await getFileText('ppt/' + tgt);
    if (!slideXml) continue;

    const slideRelsPath = 'ppt/' + tgt.replace(/([^/]+)$/, '_rels/$1.rels');
    let slideRelsXml = await getFileText(slideRelsPath) || '';

    // 슬라이드 .rels에서 layout 참조 추적
    const layoutMatch = slideRelsXml.match(/Target="[^"]*slideLayouts\/([^"]+)"/);
    const origLayoutFileName = layoutMatch?.[1];

    if (origLayoutFileName) {
      const origLayoutPath = `ppt/slideLayouts/${origLayoutFileName}`;
      const layoutRelsPath = `ppt/slideLayouts/_rels/${origLayoutFileName}.rels`;
      const layoutRelsXml2 = await getFileText(layoutRelsPath) || '';

      // layout → master 추적
      const masterMatch = layoutRelsXml2.match(/Target="[^"]*slideMasters\/([^"]+)"/);
      const origMasterFileName = masterMatch?.[1];

      let masterInfo = null;
      if (origMasterFileName) {
        const origMasterPath = `ppt/slideMasters/${origMasterFileName}`;
        masterInfo = await ensureMaster(origMasterPath);
      }

      const layoutInfo = await ensureLayout(origLayoutPath, masterInfo);

      // 슬라이드 .rels의 layout 참조 교체
      if (layoutInfo?.newLayoutName) {
        slideRelsXml = slideRelsXml.replace(
          /Target="[^"]*slideLayouts\/[^"]+"/g,
          `Target="../slideLayouts/${layoutInfo.newLayoutName}"`
        );
      }
    }

    // 미디어 파일 복사
    const mediaMatches = [...slideRelsXml.matchAll(/Target="[^"]*media\/([^"]+)"/g)];
    for (const mm of mediaMatches) {
      const mediaFile = mm[1];
      const srcMediaPath = `ppt/media/${mediaFile}`;
      if (!foreignPathMap[srcMediaPath]) {
        const mediaBytes = await getFileBytes(srcMediaPath);
        if (mediaBytes) {
          baseZip.file(srcMediaPath, mediaBytes);
          foreignPathMap[srcMediaPath] = true;
        }
      }
    }

    const newName = `slideF${++sc}.xml`;
    baseZip.file(`ppt/slides/${newName}`, slideXml);
    baseZip.file(`ppt/slides/_rels/${newName}.rels`, slideRelsXml);

    const rid    = `rId${++maxRid}`;
    const sldId  = ++maxSldId;
    newRels += `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/${newName}"/>`;
    newIds  += `<p:sldId id="${sldId}" r:id="${rid}"/>`;
    newCt   += `<Override PartName="/ppt/slides/${newName}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
  }

  // 카운터 공유
  Object.assign(_counters, { maxRid, maxSldId, masterIdx, themeIdx, layoutIdx, sc,
                              newRels, newIds, newCt, presXml, presRelsXml, ctXml });
}

// ═══════════════════════════════════════════════════════════════
// 4. generateMenuPpt() — 단일 메뉴 PPT 생성 디스패처
// ═══════════════════════════════════════════════════════════════

/**
 * 메뉴 하나에 해당하는 PPT를 생성하고 {zip, slideCount, mergeStrategy}를 반환
 *
 * @param {object} menu  - ppt_menus row (rule 포함)
 * @param {object} vm    - ProjectViewModel
 * @returns {Promise<{zip: JSZip, slideCount: number, mergeStrategy: string} | null>}
 */
async function generateMenuPpt(menu, vm) {
  if (!menu || !menu.is_enabled) return null;

  const rule = menu.rule;
  if (!rule) {
    console.warn('[PptEngine] rule 없음:', menu.menu_code);
    return null;
  }

  const mergeStrategy = rule.merge_strategy || 'STANDARD';
  let result = null;

  // ── 메뉴 코드별 디스패처 ──
  switch (menu.menu_code) {

    // ── 세부 감리 일정 ─────────────────────────────────────────────
    case 'DETAIL_SCHEDULE':
      result = await downloadDetailSchedule1Pptx(null, { returnZip: true });
      break;

    // ── 사진장표 3종 ───────────────────────────────────────────────
    // 3.1 단계 감리원의 전문 역량
    case 'AUDITOR_PROFILE':
    case 'PHOTO_ASSIGN':          // 구버전 alias
      result = await downloadPhotoAssignPptx(null, { returnZip: true, groupFilter: 'AUDITOR' });
      break;

    // 3.2 핵심기술 점검팀의 전문 역량
    case 'CORE_EXPERT_PROFILE':
      result = await downloadPhotoAssignPptx(null, { returnZip: true, groupFilter: 'CORE_EXPERT' });
      break;

    // 3.3 필수기술·보안·테스트팀 전문 역량
    case 'EXPERT_PROFILE':
      result = await downloadPhotoAssignPptx(null, { returnZip: true, groupFilter: 'EXPERT' });
      break;

    // ── 표장표 2종 ─────────────────────────────────────────────────
    // 3.4 감리원별 유사 감리 실적 및 경력·자격
    case 'AUDITOR_HISTORY':
      result = await downloadAssignPptx(null, { returnZip: true, groupFilter: 'AUDITOR' });
      break;

    // 3.5 전문가별 유사 감리 실적 및 경력·자격
    case 'EXPERT_HISTORY':
      result = await downloadAssignPptx(null, { returnZip: true, groupFilter: 'EXPERT' });
      break;

    // ── 기존 표장표 (감리원/전문가 통합 표) ───────────────────────
    case 'ASSIGN_TABLE':          // 구버전 alias
    case 'MANPOWER_MD':
      result = await downloadAssignPptx(null, { returnZip: true });
      break;

    // ── 주관기관 요청사항 준수 여부 (요약표) ──────────────────────
    case 'SUMMARY_TABLE':         // 구버전 alias
    case 'COMPLIANCE':
      result = await downloadSummaryTablePptx(null, { returnZip: true });
      break;

    default:
      console.warn('[PptEngine] 알 수 없는 menu_code:', menu.menu_code);
      return null;
  }

  if (!result || !result.zip) return null;

  // 슬라이드 수 계산
  let slideCount = 0;
  try {
    const presXml = await result.zip.file('ppt/presentation.xml').async('string');
    slideCount = (presXml.match(/<p:sldId\b/g) || []).length;
  } catch (_) { slideCount = 1; }

  return { ...result, slideCount, mergeStrategy };
}

// ═══════════════════════════════════════════════════════════════
// 5. generateProposalPpt() — 전체 메뉴 Composer
// ═══════════════════════════════════════════════════════════════

/**
 * 활성화된 메뉴를 sort_order 순으로 순회하며 각 PPT를 생성하고
 * mergePresentationZips()로 하나의 최종 PPTX를 합본한다.
 *
 * @param {object} vm - ProjectViewModel
 * @returns {Promise<JSZip>} 최종 합본 JSZip 객체
 */
async function generateProposalPpt(vm) {
  // 1. 메뉴 목록 로드
  const registry = await PptMenuRegistry.load();
  const enabledMenus = Object.values(registry.byCode)
    .filter(m => m.is_enabled && m.rule)
    .sort((a, b) => a.sort_order - b.sort_order);

  if (!enabledMenus.length) throw new Error('활성화된 메뉴가 없습니다.');

  // 2. 각 메뉴 PPT 생성
  showAutoAlert('⏳ PPT 생성 중... 완료될 때까지 잠시 기다려주세요.', false);

  const parts = [];
  for (const menu of enabledMenus) {
    try {
      const part = await generateMenuPpt(menu, vm);
      if (part && part.slideCount > 0) {
        parts.push(part);
        console.log(`[PptEngine] ${menu.menu_code} → ${part.slideCount}장`);
      } else {
        console.log(`[PptEngine] ${menu.menu_code} → 0장 (건너뜀)`);
      }
    } catch (e) {
      console.error(`[PptEngine] ${menu.menu_code} 생성 실패:`, e);
      // 개별 메뉴 실패는 건너뛰고 계속 진행
    }
  }

  if (!parts.length) throw new Error('생성할 슬라이드가 없습니다.');

  // 3. 합본
  return mergePresentationZips(parts);
}

// ═══════════════════════════════════════════════════════════════
// 6. downloadProposalPpt() — 최종 다운로드 래퍼
//    (기존 downloadAllPptx 대체)
// ═══════════════════════════════════════════════════════════════

async function downloadProposalPpt(btn) {
  if (typeof PptxGenJS === 'undefined' || typeof JSZip === 'undefined') {
    alert('PPT 라이브러리 로딩 중입니다. 잠시 후 다시 시도해주세요.'); return;
  }
  setBtnState(btn, true);
  try {
    const vm = buildProjectViewModel(parsedData);
    const finalZip = await generateProposalPpt(vm);

    const blob = await finalZip.generateAsync({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const d = new Date();
    const dateStr = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '자동화PPT_' + (parsedData.projectTitle || '').slice(0, 10) + '_' + dateStr + '.pptx';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    showAutoAlert('✅ 자동화 PPT 생성 완료!', true);
  } catch (e) {
    showAutoAlert('❌ 생성 실패: ' + e.message, false);
    console.error(e);
  } finally {
    setBtnState(btn, false);
  }
}

// ═══════════════════════════════════════════════════════════════
// 7. 메뉴 캐시 강제 재로드 유틸
// ═══════════════════════════════════════════════════════════════

function invalidatePptMenuCache() {
  PptMenuRegistry.invalidate();
}
