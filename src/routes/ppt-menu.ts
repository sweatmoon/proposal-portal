/**
 * PPT 목차/메뉴/템플릿/생성규칙/구성순서 관리 API
 *
 * POST   /api/ppt-menus/migrate               — PPT 테이블 생성 (멱등)
 * POST   /api/ppt-menus/seed                  — 명세 기반 전체 목차 시드 (멱등)
 *
 * GET    /api/ppt-menus                        — 전체 메뉴 트리
 * POST   /api/ppt-menus                        — 메뉴 생성
 * PUT    /api/ppt-menus/:id                   — 메뉴 수정
 * DELETE /api/ppt-menus/:id                   — 메뉴 삭제
 *
 * GET    /api/ppt-menus/:id/rule              — 생성규칙 조회
 * PUT    /api/ppt-menus/:id/rule              — 생성규칙 저장 (upsert)
 *
 * GET    /api/ppt-menus/:id/templates         — 템플릿 목록
 * POST   /api/ppt-menus/:id/templates         — 템플릿 생성
 * PUT    /api/ppt-templates/:tid              — 템플릿 수정
 * DELETE /api/ppt-templates/:tid              — 템플릿 삭제
 *
 * GET    /api/ppt-compositions                 — 구성순서 목록
 * POST   /api/ppt-compositions                 — 구성순서 항목 추가
 * PUT    /api/ppt-compositions/:cid            — 구성순서 수정
 * DELETE /api/ppt-compositions/:cid            — 구성순서 삭제
 * POST   /api/ppt-compositions/reorder         — 순서 일괄 변경
 */

import { Hono } from 'hono'
import { query, queryOne } from '../db/client.js'

const app = new Hono()

// ─────────────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────────────
async function exec(sql: string, params: unknown[] = []) {
  return query(sql, params)
}

// ═══════════════════════════════════════════════════════════════════
// [1] 마이그레이션 — 6개 테이블 생성 (멱등)
// ═══════════════════════════════════════════════════════════════════
app.post('/migrate', async (c) => {
  try {
    // 1. ppt_menus
    await exec(`
      CREATE TABLE IF NOT EXISTS ppt_menus (
        id          SERIAL PRIMARY KEY,
        parent_id   INTEGER REFERENCES ppt_menus(id) ON DELETE SET NULL,
        menu_code   TEXT    NOT NULL UNIQUE,
        menu_name   TEXT    NOT NULL,
        menu_number TEXT,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        is_enabled  INTEGER NOT NULL DEFAULT 1,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    // 2. ppt_templates
    await exec(`
      CREATE TABLE IF NOT EXISTS ppt_templates (
        id              SERIAL PRIMARY KEY,
        menu_id         INTEGER NOT NULL REFERENCES ppt_menus(id) ON DELETE CASCADE,
        template_name   TEXT    NOT NULL,
        variant_code    TEXT    NOT NULL DEFAULT 'DEFAULT',
        pptx_file_path  TEXT,
        pptx_b64_key    TEXT,
        capacity        INTEGER,
        slide_count     INTEGER,
        version         INTEGER NOT NULL DEFAULT 1,
        is_default      INTEGER NOT NULL DEFAULT 1,
        is_active       INTEGER NOT NULL DEFAULT 1,
        metadata        TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (menu_id, variant_code, version)
      )
    `)

    // 3. ppt_generation_rules
    await exec(`
      CREATE TABLE IF NOT EXISTS ppt_generation_rules (
        id               SERIAL PRIMARY KEY,
        menu_id          INTEGER NOT NULL UNIQUE REFERENCES ppt_menus(id) ON DELETE CASCADE,
        generation_mode  TEXT    NOT NULL DEFAULT 'BUILD_TABLE',
        template_strategy TEXT   NOT NULL DEFAULT 'PPTX_TEMPLATE',
        calculator_code  TEXT,
        renderer_code    TEXT,
        pagination_mode  TEXT    NOT NULL DEFAULT 'SINGLE',
        postprocess_mode TEXT    NOT NULL DEFAULT 'NONE',
        merge_strategy   TEXT    NOT NULL DEFAULT 'STANDARD',
        rule_config      TEXT,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    // 4. ppt_template_elements
    await exec(`
      CREATE TABLE IF NOT EXISTS ppt_template_elements (
        id            SERIAL PRIMARY KEY,
        template_id   INTEGER NOT NULL REFERENCES ppt_templates(id) ON DELETE CASCADE,
        element_code  TEXT    NOT NULL,
        element_type  TEXT    NOT NULL,
        data_key      TEXT,
        slide_index   INTEGER,
        x             REAL,
        y             REAL,
        width         REAL,
        height        REAL,
        config        TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    // 5. ppt_compositions (최종 PPT 구성 순서 / 조건)
    await exec(`
      CREATE TABLE IF NOT EXISTS ppt_compositions (
        id             SERIAL PRIMARY KEY,
        proposal_type  TEXT    NOT NULL DEFAULT 'DEFAULT',
        menu_id        INTEGER NOT NULL REFERENCES ppt_menus(id) ON DELETE CASCADE,
        sort_order     INTEGER NOT NULL DEFAULT 0,
        is_required    INTEGER NOT NULL DEFAULT 1,
        condition_code TEXT,
        is_enabled     INTEGER NOT NULL DEFAULT 1,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (proposal_type, menu_id)
      )
    `)

    // 6. ppt_template_versions (버전 이력)
    await exec(`
      CREATE TABLE IF NOT EXISTS ppt_template_versions (
        id            SERIAL PRIMARY KEY,
        template_id   INTEGER NOT NULL REFERENCES ppt_templates(id) ON DELETE CASCADE,
        version       INTEGER NOT NULL,
        file_path     TEXT,
        pptx_b64_key  TEXT,
        uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        uploaded_by   TEXT,
        change_note   TEXT,
        UNIQUE (template_id, version)
      )
    `)

    // 인덱스
    const indexes = [
      `CREATE INDEX IF NOT EXISTS idx_ppt_menus_parent        ON ppt_menus(parent_id)`,
      `CREATE INDEX IF NOT EXISTS idx_ppt_menus_sort          ON ppt_menus(sort_order)`,
      `CREATE INDEX IF NOT EXISTS idx_ppt_templates_menu      ON ppt_templates(menu_id)`,
      `CREATE INDEX IF NOT EXISTS idx_ppt_gen_rules_menu      ON ppt_generation_rules(menu_id)`,
      `CREATE INDEX IF NOT EXISTS idx_ppt_elements_template   ON ppt_template_elements(template_id)`,
      `CREATE INDEX IF NOT EXISTS idx_ppt_compositions_menu   ON ppt_compositions(menu_id)`,
      `CREATE INDEX IF NOT EXISTS idx_ppt_compositions_sort   ON ppt_compositions(proposal_type, sort_order)`,
      `CREATE INDEX IF NOT EXISTS idx_ppt_tpl_versions_tpl    ON ppt_template_versions(template_id)`,
    ]
    for (const sql of indexes) await exec(sql)

    return c.json({ ok: true, message: 'PPT 테이블 마이그레이션 완료 (6개 테이블)' })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ ok: false, error: msg }, 500)
  }
})

// ═══════════════════════════════════════════════════════════════════
// [2] 시드 — 명세 기반 전체 목차 (38개 메뉴 + 6개 섹션) + GenerationRule
// ═══════════════════════════════════════════════════════════════════
app.post('/seed', async (c) => {
  try {
    // ── 구버전 menu_code 호환 rename (멱등) ────────────────────────
    // SUMMARY_TABLE → COMPLIANCE, ASSIGN_TABLE → MANPOWER_MD, PHOTO_ASSIGN → AUDITOR_PROFILE
    const renames: Array<[string, string]> = [
      ['SUMMARY_TABLE', 'COMPLIANCE'],
      ['ASSIGN_TABLE',  'MANPOWER_MD'],
      ['PHOTO_ASSIGN',  'AUDITOR_PROFILE'],
    ]
    for (const [oldCode, newCode] of renames) {
      // 새 코드가 아직 없을 때만 rename (이미 둘 다 존재하면 건드리지 않음)
      await exec(`
        UPDATE ppt_menus
        SET menu_code = $2, updated_at = NOW()
        WHERE menu_code = $1
          AND NOT EXISTS (SELECT 1 FROM ppt_menus WHERE menu_code = $2)
      `, [oldCode, newCode])
    }

    // ── 섹션 (parent) 정의 ─────────────────────────────────────────
    type SectionDef = { code: string; name: string; number: string; sort: number }
    const SECTIONS: SectionDef[] = [
      { code: 'SECTION_SCHEDULE',  name: '감리 일정 및 절차', number: '다', sort: 300 },
      { code: 'SECTION_MANPOWER',  name: '감리 인력',         number: '라', sort: 400 },
      { code: 'SECTION_QUALITY',   name: '품질 및 지원',      number: '마', sort: 600 },
      { code: 'SECTION_COMPANY',   name: '제안사 소개',        number: '바', sort: 800 },
    ]
    for (const s of SECTIONS) {
      await exec(`
        INSERT INTO ppt_menus (menu_code, menu_name, menu_number, sort_order, is_enabled)
        VALUES ($1, $2, $3, $4, 1)
        ON CONFLICT (menu_code) DO UPDATE
          SET menu_name=$2, menu_number=$3, sort_order=$4, updated_at=NOW()
      `, [s.code, s.name, s.number, s.sort])
    }

    // 섹션 ID 맵
    const secRows = await query<{ id: number; menu_code: string }>(
      `SELECT id, menu_code FROM ppt_menus WHERE menu_code = ANY($1)`,
      [SECTIONS.map(s => s.code)]
    )
    const SEC: Record<string, number> = {}
    for (const r of secRows) SEC[r.menu_code] = r.id

    // ── 메뉴 + 생성규칙 정의 ───────────────────────────────────────
    type MenuDef = {
      parentKey: string
      code: string; name: string; number: string; sort: number; enabled: number
      mode: string; strategy: string; calc: string; renderer: string
      pagination: string; postprocess: string; merge: string; config: object
      templates?: Array<{ variant: string; capacity: number | null; b64Key?: string }>
    }

    const MENUS: MenuDef[] = [
      // ── 다. 감리 일정 및 절차 ─────────────────────────────────────
      {
        parentKey: 'SECTION_SCHEDULE', code: 'SCHEDULE_PLAN', name: '감리 일정 계획',
        number: '1.1', sort: 310, enabled: 1,
        mode: 'HYBRID', strategy: 'FRAME_TEMPLATE',
        calc: 'computeSchedulePlan', renderer: 'renderSchedulePlan',
        pagination: 'FIT_OR_SPLIT', postprocess: 'NONE', merge: 'STANDARD',
        config: { timelineUnit: 'MONTH', bars: ['PROJECT', 'PHASE', 'EXPERT'] },
        templates: [{ variant: 'DEFAULT', capacity: null }],
      },
      {
        parentKey: 'SECTION_SCHEDULE', code: 'DETAIL_SCHEDULE', name: '세부 감리 일정',
        number: '1.2', sort: 320, enabled: 1,
        mode: 'BUILD_TABLE', strategy: 'FRAME_TEMPLATE',
        calc: 'computeDetailSchedule1Rows', renderer: 'renderDetailScheduleTable',
        pagination: 'ROW_SPLIT', postprocess: 'OOXML_PATCH', merge: 'STANDARD',
        config: { variantBy: 'TEAM_TYPE', preSurveyOffsetDays: -7, overflow: 'NEW_SLIDE' },
        templates: [
          { variant: 'AUDIT_TEAM',   capacity: null },
          { variant: 'EXPERT_TEST',  capacity: null },
        ],
      },
      {
        parentKey: 'SECTION_SCHEDULE', code: 'AUDIT_PROCEDURE', name: '단계별 감리 수행 절차',
        number: '2.1', sort: 330, enabled: 1,
        mode: 'REPLACE', strategy: 'PPTX_XML_TEMPLATE',
        calc: 'computeAuditProcedure', renderer: 'renderAuditProcedure',
        pagination: 'SINGLE', postprocess: 'NONE', merge: 'STANDARD',
        config: {},
        templates: [{ variant: 'DEFAULT', capacity: null }],
      },
      {
        parentKey: 'SECTION_SCHEDULE', code: 'ACTION_CONFIRM_PROCEDURE', name: '시정조치확인 수행 절차',
        number: '3.1', sort: 340, enabled: 1,
        mode: 'REPLACE', strategy: 'PPTX_XML_TEMPLATE',
        calc: 'computeActionConfirmProcedure', renderer: 'renderActionConfirmProcedure',
        pagination: 'SINGLE', postprocess: 'NONE', merge: 'STANDARD',
        config: {},
        templates: [{ variant: 'DEFAULT', capacity: null }],
      },
      {
        parentKey: 'SECTION_SCHEDULE', code: 'ACTION_CONFIRM_STAFF', name: '시정조치확인 수행 인력',
        number: '3.2', sort: 350, enabled: 1,
        mode: 'BUILD_TABLE', strategy: 'FRAME_TEMPLATE',
        calc: 'computeActionConfirmStaff', renderer: 'renderActionConfirmStaffTable',
        pagination: 'ROW_SPLIT', postprocess: 'OOXML_PATCH', merge: 'STANDARD',
        config: { maxRowsPerSlide: 15, headerRepeat: true },
        templates: [{ variant: 'DEFAULT', capacity: null }],
      },

      // ── 라. 감리 인력 ──────────────────────────────────────────────
      {
        parentKey: 'SECTION_MANPOWER', code: 'MANPOWER_BASIS', name: '감리 인력 편성 근거',
        number: '1.1', sort: 410, enabled: 1,
        mode: 'HYBRID', strategy: 'FRAME_TEMPLATE',
        calc: 'computeManpowerBasis', renderer: 'renderManpowerBasis',
        pagination: 'FIT_OR_SPLIT', postprocess: 'NONE', merge: 'STANDARD',
        config: { build: ['REQUIREMENT_TABLE', 'RISK_LIST', 'DONUT_CHART', 'HEADCOUNT'] },
        templates: [{ variant: 'DEFAULT', capacity: null }],
      },
      {
        parentKey: 'SECTION_MANPOWER', code: 'ORGANIZATION', name: '감리 수행 조직',
        number: '1.2', sort: 420, enabled: 1,
        mode: 'BUILD_OBJECTS', strategy: 'FRAME_TEMPLATE',
        calc: 'computeOrganization', renderer: 'renderOrganization',
        pagination: 'FIT_OR_SPLIT', postprocess: 'NONE', merge: 'STANDARD',
        config: { groupOrder: ['AUDIT', 'CORE', 'REQUIRED', 'SECURITY', 'TEST'], layout: 'AUTO_GRID' },
        templates: [{ variant: 'DEFAULT', capacity: null }],
      },
      {
        parentKey: 'SECTION_MANPOWER', code: 'ORGANIZATION_ROLE', name: '감리 조직별 역할',
        number: '1.3', sort: 430, enabled: 1,
        mode: 'REPLACE', strategy: 'PPTX_XML_TEMPLATE',
        calc: 'computeOrganizationRole', renderer: 'renderOrganizationRole',
        pagination: 'SINGLE', postprocess: 'NONE', merge: 'STANDARD',
        config: {},
        templates: [{ variant: 'DEFAULT', capacity: null }],
      },
      {
        parentKey: 'SECTION_MANPOWER', code: 'MANPOWER_MD', name: '감리 인력 투입 공수',
        number: '1.4', sort: 440, enabled: 1,
        mode: 'BUILD_TABLE', strategy: 'FRAME_TEMPLATE',
        calc: 'computeManpowerMd', renderer: 'renderManpowerMdTable',
        pagination: 'ROW_SPLIT', postprocess: 'OOXML_PATCH', merge: 'STANDARD',
        config: { repeatUnit: 'MEMBER', dynamicColumns: 'PHASE', maxRowsPerSlide: 15, headerRepeat: true },
        templates: [{ variant: 'DEFAULT', capacity: null }],
      },
      {
        parentKey: 'SECTION_MANPOWER', code: 'FULLTIME_RATIO', name: '상근 감리원 투입 비율',
        number: '1.5', sort: 450, enabled: 1,
        mode: 'HYBRID', strategy: 'FRAME_TEMPLATE',
        calc: 'computeFulltimeRatio', renderer: 'renderFulltimeRatio',
        pagination: 'SINGLE', postprocess: 'NONE', merge: 'STANDARD',
        config: { build: ['RATIO_TABLE', 'BAR_CHART'] },
        templates: [{ variant: 'DEFAULT', capacity: null }],
      },
      {
        parentKey: 'SECTION_MANPOWER', code: 'PM_PROFILE_CAPABILITY', name: '총괄 감리원의 전문 역량',
        number: '2.1', sort: 460, enabled: 1,
        mode: 'REPLACE', strategy: 'PPTX_XML_TEMPLATE',
        calc: 'computePmProfileCapability', renderer: 'renderPmProfileCapability',
        pagination: 'SINGLE', postprocess: 'NONE', merge: 'FOREIGN_TEMPLATE',
        config: {},
        templates: [{ variant: 'DEFAULT', capacity: 1 }],
      },
      {
        parentKey: 'SECTION_MANPOWER', code: 'PM_PROFILE_REQUIREMENTS', name: '총괄 감리원 자격 요건',
        number: '2.2', sort: 470, enabled: 1,
        mode: 'REPLACE', strategy: 'PPTX_XML_TEMPLATE',
        calc: 'computePmProfileRequirements', renderer: 'renderPmProfileRequirements',
        pagination: 'SINGLE', postprocess: 'NONE', merge: 'FOREIGN_TEMPLATE',
        config: {},
        templates: [{ variant: 'DEFAULT', capacity: 1 }],
      },
      {
        parentKey: 'SECTION_MANPOWER', code: 'AUDITOR_PROFILE', name: '단계 감리원의 전문 역량',
        number: '3.1', sort: 480, enabled: 1,
        mode: 'CLONE_SLIDE', strategy: 'PPTX_XML_TEMPLATE',
        calc: 'computeAuditorProfiles', renderer: 'buildPhotoPptxFromTemplate',
        pagination: 'BEST_FIT', postprocess: 'NONE', merge: 'FOREIGN_TEMPLATE',
        config: { variants: [2, 4, 6, 9], overflow: 'NEW_SLIDE', fillOrder: 'COLUMN_MAJOR', slotRemoval: true },
        templates: [
          { variant: 'PERSON_2', capacity: 2 },
          { variant: 'PERSON_4', capacity: 4 },
          { variant: 'PERSON_6', capacity: 6 },
          { variant: 'PERSON_9', capacity: 9 },
        ],
      },
      {
        parentKey: 'SECTION_MANPOWER', code: 'CORE_EXPERT_PROFILE', name: '핵심기술 점검팀의 전문 역량',
        number: '3.2', sort: 490, enabled: 0,
        mode: 'CLONE_SLIDE', strategy: 'PPTX_XML_TEMPLATE',
        calc: 'computeCoreExpertProfiles', renderer: 'buildPhotoPptxFromTemplate',
        pagination: 'BEST_FIT', postprocess: 'NONE', merge: 'FOREIGN_TEMPLATE',
        config: { variants: [2, 4, 6, 9], overflow: 'NEW_SLIDE' },
        templates: [
          { variant: 'PERSON_2', capacity: 2 },
          { variant: 'PERSON_4', capacity: 4 },
          { variant: 'PERSON_6', capacity: 6 },
          { variant: 'PERSON_9', capacity: 9 },
        ],
      },
      {
        parentKey: 'SECTION_MANPOWER', code: 'EXPERT_PROFILE', name: '필수기술·보안·테스트팀 전문 역량',
        number: '3.3', sort: 500, enabled: 0,
        mode: 'CLONE_SLIDE', strategy: 'PPTX_XML_TEMPLATE',
        calc: 'computeExpertProfiles', renderer: 'buildPhotoPptxFromTemplate',
        pagination: 'BEST_FIT', postprocess: 'NONE', merge: 'FOREIGN_TEMPLATE',
        config: { variants: [2, 4, 6, 9], mergeCategories: true, categoryOrder: ['REQUIRED', 'SECURITY', 'TEST'] },
        templates: [
          { variant: 'PERSON_2', capacity: 2 },
          { variant: 'PERSON_4', capacity: 4 },
          { variant: 'PERSON_6', capacity: 6 },
          { variant: 'PERSON_9', capacity: 9 },
        ],
      },
      {
        parentKey: 'SECTION_MANPOWER', code: 'AUDITOR_HISTORY', name: '감리원별 유사 감리 실적 및 경력·자격',
        number: '3.4', sort: 510, enabled: 1,
        mode: 'CLONE_SLIDE', strategy: 'PPTX_XML_TEMPLATE',
        calc: 'computeAuditorHistory', renderer: 'cloneHistoryTemplate',
        pagination: 'CAPACITY_SPLIT', postprocess: 'NONE', merge: 'FOREIGN_TEMPLATE',
        config: { repeatUnit: 'AUDITOR', historyLimit: 5, overflow: 'NEW_SLIDE' },
        templates: [{ variant: 'DEFAULT', capacity: 1 }],
      },
      {
        parentKey: 'SECTION_MANPOWER', code: 'EXPERT_HISTORY', name: '전문가별 유사 감리 실적 및 경력·자격',
        number: '3.5', sort: 520, enabled: 0,
        mode: 'CLONE_SLIDE', strategy: 'PPTX_XML_TEMPLATE',
        calc: 'computeExpertHistory', renderer: 'cloneHistoryTemplate',
        pagination: 'CAPACITY_SPLIT', postprocess: 'NONE', merge: 'FOREIGN_TEMPLATE',
        config: { repeatUnit: 'EXPERT', historyLimit: 5, overflow: 'NEW_SLIDE' },
        templates: [{ variant: 'DEFAULT', capacity: 1 }],
      },
      {
        parentKey: 'SECTION_MANPOWER', code: 'CONTINUING_EDU', name: '참여 감리원 계속교육 이수 실적',
        number: '3.6', sort: 530, enabled: 1,
        mode: 'BUILD_TABLE', strategy: 'FRAME_TEMPLATE',
        calc: 'computeContinuingEdu', renderer: 'renderContinuingEduTable',
        pagination: 'ROW_SPLIT', postprocess: 'OOXML_PATCH', merge: 'STANDARD',
        config: { maxRowsPerSlide: 20, headerRepeat: true },
        templates: [{ variant: 'DEFAULT', capacity: null }],
      },
      {
        parentKey: 'SECTION_MANPOWER', code: 'MANPOWER_RATIO', name: '감리원 및 전문가 투입 비율',
        number: '3.7', sort: 540, enabled: 1,
        mode: 'HYBRID', strategy: 'FRAME_TEMPLATE',
        calc: 'computeManpowerRatio', renderer: 'renderManpowerRatio',
        pagination: 'SINGLE', postprocess: 'NONE', merge: 'STANDARD',
        config: { build: ['RATIO_TABLE', 'PIE_CHART'] },
        templates: [{ variant: 'DEFAULT', capacity: null }],
      },

      // ── 마. 품질 및 지원 ───────────────────────────────────────────
      {
        parentKey: 'SECTION_QUALITY', code: 'QA_SYSTEM', name: '제안사 품질보증체계',
        number: '1.1', sort: 610, enabled: 1,
        mode: 'REPLACE', strategy: 'PPTX_XML_TEMPLATE',
        calc: 'computeQaSystem', renderer: 'renderQaSystem',
        pagination: 'SINGLE', postprocess: 'NONE', merge: 'FOREIGN_TEMPLATE',
        config: {},
        templates: [{ variant: 'DEFAULT', capacity: null }],
      },
      {
        parentKey: 'SECTION_QUALITY', code: 'QA_MANAGEMENT', name: '감리 품질관리 수행 방안',
        number: '1.2', sort: 620, enabled: 1,
        mode: 'REPLACE', strategy: 'PPTX_XML_TEMPLATE',
        calc: 'computeQaManagement', renderer: 'renderQaManagement',
        pagination: 'SINGLE', postprocess: 'NONE', merge: 'FOREIGN_TEMPLATE',
        config: {},
        templates: [{ variant: 'DEFAULT', capacity: null }],
      },
      {
        parentKey: 'SECTION_QUALITY', code: 'REPORT_QUALITY', name: '감리보고서 품질 지표 관리 방안',
        number: '1.3', sort: 630, enabled: 1,
        mode: 'REPLACE', strategy: 'PPTX_XML_TEMPLATE',
        calc: 'computeReportQuality', renderer: 'renderReportQuality',
        pagination: 'SINGLE', postprocess: 'NONE', merge: 'FOREIGN_TEMPLATE',
        config: {},
        templates: [{ variant: 'DEFAULT', capacity: null }],
      },
      {
        parentKey: 'SECTION_QUALITY', code: 'DELIVERABLE_MGMT', name: '단계별 산출물 관리',
        number: '1.4', sort: 640, enabled: 1,
        mode: 'HYBRID', strategy: 'FRAME_TEMPLATE',
        calc: 'computeDeliverableMgmt', renderer: 'renderDeliverableMgmt',
        pagination: 'SINGLE', postprocess: 'NONE', merge: 'FOREIGN_TEMPLATE',
        config: { dynamicPhases: true },
        templates: [{ variant: 'DEFAULT', capacity: null }],
      },
      {
        parentKey: 'SECTION_QUALITY', code: 'RESEARCH_SUPPORT', name: '제안사 연구·기술지원 및 교육 수행 체계',
        number: '1.5', sort: 650, enabled: 1,
        mode: 'REPLACE', strategy: 'PPTX_XML_TEMPLATE',
        calc: 'computeResearchSupport', renderer: 'renderResearchSupport',
        pagination: 'SINGLE', postprocess: 'NONE', merge: 'FOREIGN_TEMPLATE',
        config: {},
        templates: [{ variant: 'DEFAULT', capacity: null }],
      },
      {
        parentKey: 'SECTION_QUALITY', code: 'AUTO_TOOL_PLAN', name: '단계별 자동화 도구 적용 방안',
        number: '2.1', sort: 660, enabled: 1,
        mode: 'HYBRID', strategy: 'FRAME_TEMPLATE',
        calc: 'computeAutoToolPlan', renderer: 'renderAutoToolPlan',
        pagination: 'SINGLE', postprocess: 'NONE', merge: 'STANDARD',
        config: { dynamicPhases: true, dynamicTools: true },
        templates: [{ variant: 'DEFAULT', capacity: null }],
      },
      {
        parentKey: 'SECTION_QUALITY', code: 'AUTO_TOOL_OBJECTIVITY', name: '자동화 도구 객관성·타당성 확보',
        number: '2.2', sort: 670, enabled: 1,
        mode: 'REPLACE', strategy: 'PPTX_XML_TEMPLATE',
        calc: 'computeAutoToolObjectivity', renderer: 'renderAutoToolObjectivity',
        pagination: 'SINGLE', postprocess: 'NONE', merge: 'FOREIGN_TEMPLATE',
        config: {},
        templates: [{ variant: 'DEFAULT', capacity: null }],
      },
      {
        parentKey: 'SECTION_QUALITY', code: 'AUTO_TOOL_DETAIL', name: '자동화 도구 적용 상세',
        number: '2.3', sort: 680, enabled: 0,
        mode: 'CLONE_SLIDE', strategy: 'VARIANT_TEMPLATE',
        calc: 'computeAutoToolDetail', renderer: 'renderAutoToolDetail',
        pagination: 'BEST_FIT', postprocess: 'NONE', merge: 'FOREIGN_TEMPLATE',
        config: { variantBy: 'TOOL_AREA' },
        templates: [
          { variant: 'PROJECT_MGMT', capacity: null },
          { variant: 'DATABASE',      capacity: null },
          { variant: 'SW_SECURITY',   capacity: null },
        ],
      },
      {
        parentKey: 'SECTION_QUALITY', code: 'ADDITIONAL_SUPPORT', name: '추가 지원 사항',
        number: '3.1', sort: 690, enabled: 0,
        mode: 'CLONE_SLIDE', strategy: 'PPTX_XML_TEMPLATE',
        calc: 'computeAdditionalSupport', renderer: 'renderAdditionalSupport',
        pagination: 'CAPACITY_SPLIT', postprocess: 'NONE', merge: 'FOREIGN_TEMPLATE',
        config: { repeatUnit: 'SUPPORT_ITEM' },
        templates: [{ variant: 'DEFAULT', capacity: null }],
      },
      {
        parentKey: 'SECTION_QUALITY', code: 'CONSTANT_SUPPORT', name: '제안사 상시 지원 프로세스',
        number: '3.2', sort: 700, enabled: 1,
        mode: 'REPLACE', strategy: 'PPTX_XML_TEMPLATE',
        calc: 'computeConstantSupport', renderer: 'renderConstantSupport',
        pagination: 'SINGLE', postprocess: 'NONE', merge: 'FOREIGN_TEMPLATE',
        config: {},
        templates: [{ variant: 'DEFAULT', capacity: null }],
      },
      {
        parentKey: 'SECTION_QUALITY', code: 'RISK_MANAGEMENT', name: '위험 관리',
        number: '3.3', sort: 710, enabled: 1,
        mode: 'BUILD_TABLE', strategy: 'FRAME_TEMPLATE',
        calc: 'computeRiskManagement', renderer: 'renderRiskManagementTable',
        pagination: 'ROW_SPLIT', postprocess: 'OOXML_PATCH', merge: 'STANDARD',
        config: { maxRowsPerSlide: 12 },
        templates: [{ variant: 'DEFAULT', capacity: null }],
      },
      {
        parentKey: 'SECTION_QUALITY', code: 'SECURITY_MANAGEMENT', name: '감리 보안 관리',
        number: '3.4', sort: 720, enabled: 1,
        mode: 'REPLACE', strategy: 'PPTX_XML_TEMPLATE',
        calc: 'computeSecurityManagement', renderer: 'renderSecurityManagement',
        pagination: 'SINGLE', postprocess: 'NONE', merge: 'FOREIGN_TEMPLATE',
        config: {},
        templates: [{ variant: 'DEFAULT', capacity: null }],
      },
      {
        parentKey: 'SECTION_QUALITY', code: 'SAFETY_HEALTH', name: '안전 및 보건 관리 등 비상 대책',
        number: '3.5', sort: 730, enabled: 1,
        mode: 'REPLACE', strategy: 'PPTX_XML_TEMPLATE',
        calc: 'computeSafetyHealth', renderer: 'renderSafetyHealth',
        pagination: 'SINGLE', postprocess: 'NONE', merge: 'FOREIGN_TEMPLATE',
        config: {},
        templates: [{ variant: 'DEFAULT', capacity: null }],
      },
      {
        parentKey: 'SECTION_QUALITY', code: 'COMPLIANCE', name: '주관기관 요청사항 준수 여부',
        number: '3.6', sort: 740, enabled: 1,
        mode: 'BUILD_TABLE', strategy: 'FRAME_TEMPLATE',
        calc: 'computeSummaryTableData', renderer: 'renderComplianceTable',
        pagination: 'ROW_SPLIT', postprocess: 'OOXML_PATCH', merge: 'STANDARD',
        config: { headerRepeat: true, overflow: 'NEW_SLIDE' },
        templates: [{ variant: 'DEFAULT', capacity: null }],
      },

      // ── 바. 제안사 소개 ────────────────────────────────────────────
      {
        parentKey: 'SECTION_COMPANY', code: 'COMPANY_OVERVIEW', name: '제안사 일반 현황',
        number: '1.1', sort: 810, enabled: 1,
        mode: 'REPLACE', strategy: 'PPTX_XML_TEMPLATE',
        calc: 'computeCompanyOverview', renderer: 'renderCompanyOverview',
        pagination: 'SINGLE', postprocess: 'NONE', merge: 'FOREIGN_TEMPLATE',
        config: {},
        templates: [{ variant: 'DEFAULT', capacity: null }],
      },
      {
        parentKey: 'SECTION_COMPANY', code: 'FINANCIAL_CREDIT', name: '제안사 재무 현황 및 신용 등급',
        number: '1.2', sort: 820, enabled: 1,
        mode: 'HYBRID', strategy: 'FRAME_TEMPLATE',
        calc: 'computeFinancialCredit', renderer: 'renderFinancialCredit',
        pagination: 'SINGLE', postprocess: 'NONE', merge: 'FOREIGN_TEMPLATE',
        config: { dynamicYears: true },
        templates: [{ variant: 'DEFAULT', capacity: null }],
      },
      {
        parentKey: 'SECTION_COMPANY', code: 'COMPANY_ORG', name: '제안사 조직 및 인력 현황',
        number: '2.1', sort: 830, enabled: 1,
        mode: 'BUILD_OBJECTS', strategy: 'FRAME_TEMPLATE',
        calc: 'computeCompanyOrg', renderer: 'renderCompanyOrg',
        pagination: 'FIT_OR_SPLIT', postprocess: 'NONE', merge: 'STANDARD',
        config: {},
        templates: [{ variant: 'DEFAULT', capacity: null }],
      },
      {
        parentKey: 'SECTION_COMPANY', code: 'COMPANY_TECH', name: '주요 사업 분야 및 보유 기술',
        number: '3.1', sort: 840, enabled: 1,
        mode: 'CLONE_SLIDE', strategy: 'PPTX_XML_TEMPLATE',
        calc: 'computeCompanyTech', renderer: 'renderCompanyTech',
        pagination: 'CAPACITY_SPLIT', postprocess: 'NONE', merge: 'FOREIGN_TEMPLATE',
        config: { repeatUnit: 'TECH_ITEM' },
        templates: [{ variant: 'DEFAULT', capacity: null }],
      },
      {
        parentKey: 'SECTION_COMPANY', code: 'COMPANY_PERFORMANCE', name: '제안사 사업 실적',
        number: '3.2~3.4', sort: 850, enabled: 1,
        mode: 'CLONE_SLIDE', strategy: 'VARIANT_TEMPLATE',
        calc: 'computeCompanyPerformance', renderer: 'renderCompanyPerformance',
        pagination: 'BEST_FIT', postprocess: 'NONE', merge: 'FOREIGN_TEMPLATE',
        config: { variantBy: 'PERFORMANCE_TYPE', variants: ['YEARLY', 'TOTAL'] },
        templates: [
          { variant: 'YEARLY', capacity: null },
          { variant: 'TOTAL',  capacity: null },
        ],
      },
    ]

    let menuInserted = 0
    let ruleInserted = 0
    let tplInserted  = 0
    let compInserted = 0

    for (const m of MENUS) {
      const parentId = SEC[m.parentKey] ?? null

      // 메뉴 upsert
      await exec(`
        INSERT INTO ppt_menus (parent_id, menu_code, menu_name, menu_number, sort_order, is_enabled)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (menu_code) DO UPDATE
          SET parent_id=$1, menu_name=$3, menu_number=$4, sort_order=$5, updated_at=NOW()
      `, [parentId, m.code, m.name, m.number, m.sort, m.enabled])
      menuInserted++

      const menu = await queryOne<{ id: number }>(`SELECT id FROM ppt_menus WHERE menu_code=$1`, [m.code])
      if (!menu) continue

      // 생성규칙 upsert
      await exec(`
        INSERT INTO ppt_generation_rules
          (menu_id, generation_mode, template_strategy, calculator_code, renderer_code,
           pagination_mode, postprocess_mode, merge_strategy, rule_config)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (menu_id) DO UPDATE
          SET generation_mode=$2, template_strategy=$3, calculator_code=$4, renderer_code=$5,
              pagination_mode=$6, postprocess_mode=$7, merge_strategy=$8, rule_config=$9, updated_at=NOW()
      `, [menu.id, m.mode, m.strategy, m.calc, m.renderer,
          m.pagination, m.postprocess, m.merge, JSON.stringify(m.config)])
      ruleInserted++

      // 템플릿 upsert (variant별)
      for (const t of (m.templates ?? [])) {
        await exec(`
          INSERT INTO ppt_templates
            (menu_id, template_name, variant_code, capacity, version, is_default, is_active)
          VALUES ($1,$2,$3,$4,1,$5,1)
          ON CONFLICT (menu_id, variant_code, version) DO NOTHING
        `, [menu.id, `${m.name} [${t.variant}]`, t.variant, t.capacity ?? null,
            (m.templates?.indexOf(t) === 0) ? 1 : 0])
        tplInserted++
      }

      // ppt_compositions upsert
      await exec(`
        INSERT INTO ppt_compositions (proposal_type, menu_id, sort_order, is_required, is_enabled)
        VALUES ('DEFAULT', $1, $2, $3, $4)
        ON CONFLICT (proposal_type, menu_id) DO UPDATE
          SET sort_order=$2, is_required=$3, is_enabled=$4, updated_at=NOW()
      `, [menu.id, m.sort, m.enabled, m.enabled])
      compInserted++
    }

    return c.json({
      ok: true,
      message: `시드 완료 — 섹션 ${SECTIONS.length}개, 메뉴 ${menuInserted}개, 규칙 ${ruleInserted}개, 템플릿 ${tplInserted}개, 구성순서 ${compInserted}개`,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ ok: false, error: msg }, 500)
  }
})

// ═══════════════════════════════════════════════════════════════════
// [3] 메뉴 CRUD
// ═══════════════════════════════════════════════════════════════════

/** GET /api/ppt-menus — 전체 메뉴 트리 (rule, templates 포함) */
app.get('/', async (c) => {
  try {
    const menus = await query<{
      id: number; parent_id: number | null; menu_code: string; menu_name: string
      menu_number: string | null; sort_order: number; is_enabled: number
    }>(`SELECT * FROM ppt_menus ORDER BY sort_order ASC, id ASC`)

    const rules = await query<{
      menu_id: number; generation_mode: string; template_strategy: string
      calculator_code: string; renderer_code: string; pagination_mode: string
      postprocess_mode: string; merge_strategy: string; rule_config: string
    }>(`SELECT * FROM ppt_generation_rules`)

    const tplCounts = await query<{ menu_id: number; cnt: string }>(
      `SELECT menu_id, COUNT(*) AS cnt FROM ppt_templates WHERE is_active=1 GROUP BY menu_id`
    )

    const ruleMap  = Object.fromEntries(rules.map(r => [r.menu_id, r]))
    const tplMap   = Object.fromEntries(tplCounts.map(r => [r.menu_id, Number(r.cnt)]))

    const enriched = menus.map(m => ({
      ...m,
      rule: ruleMap[m.id] ?? null,
      template_count: tplMap[m.id] ?? 0,
    }))

    // 트리 변환
    const nodeMap: Record<number, typeof enriched[0] & { children: unknown[] }> = {}
    const roots: (typeof enriched[0] & { children: unknown[] })[] = []
    enriched.forEach(m => { nodeMap[m.id] = { ...m, children: [] } })
    enriched.forEach(m => {
      if (m.parent_id && nodeMap[m.parent_id]) nodeMap[m.parent_id].children.push(nodeMap[m.id])
      else roots.push(nodeMap[m.id])
    })

    return c.json({ ok: true, data: roots })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ ok: false, error: msg }, 500)
  }
})

/** POST /api/ppt-menus */
app.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const { parent_id, menu_code, menu_name, menu_number, sort_order, is_enabled } = body
    const row = await queryOne<{ id: number }>(`
      INSERT INTO ppt_menus (parent_id, menu_code, menu_name, menu_number, sort_order, is_enabled)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING id
    `, [parent_id ?? null, menu_code, menu_name, menu_number ?? null, sort_order ?? 0, is_enabled ?? 1])
    return c.json({ ok: true, id: row?.id })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ ok: false, error: msg }, 400)
  }
})

/** PUT /api/ppt-menus/:id */
app.put('/:id', async (c) => {
  try {
    const id = Number(c.req.param('id'))
    const body = await c.req.json()
    const { menu_name, menu_number, sort_order, is_enabled, parent_id } = body
    await exec(`
      UPDATE ppt_menus
      SET menu_name=$1, menu_number=$2, sort_order=$3, is_enabled=$4, parent_id=$5, updated_at=NOW()
      WHERE id=$6
    `, [menu_name, menu_number ?? null, sort_order ?? 0, is_enabled ?? 1, parent_id ?? null, id])
    return c.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ ok: false, error: msg }, 400)
  }
})

/** DELETE /api/ppt-menus/:id */
app.delete('/:id', async (c) => {
  try {
    const id = Number(c.req.param('id'))
    await exec(`DELETE FROM ppt_menus WHERE id=$1`, [id])
    return c.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ ok: false, error: msg }, 500)
  }
})

// ═══════════════════════════════════════════════════════════════════
// [4] 생성 규칙 CRUD
// ═══════════════════════════════════════════════════════════════════

/** GET /api/ppt-menus/:id/rule */
app.get('/:id/rule', async (c) => {
  try {
    const id = Number(c.req.param('id'))
    const row = await queryOne(`SELECT * FROM ppt_generation_rules WHERE menu_id=$1`, [id])
    return c.json({ ok: true, data: row ?? null })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ ok: false, error: msg }, 500)
  }
})

/** PUT /api/ppt-menus/:id/rule — upsert */
app.put('/:id/rule', async (c) => {
  try {
    const id = Number(c.req.param('id'))
    const body = await c.req.json()
    const {
      generation_mode, template_strategy, calculator_code, renderer_code,
      pagination_mode, postprocess_mode, merge_strategy, rule_config,
    } = body
    await exec(`
      INSERT INTO ppt_generation_rules
        (menu_id, generation_mode, template_strategy, calculator_code, renderer_code,
         pagination_mode, postprocess_mode, merge_strategy, rule_config)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (menu_id) DO UPDATE
        SET generation_mode=$2, template_strategy=$3, calculator_code=$4, renderer_code=$5,
            pagination_mode=$6, postprocess_mode=$7, merge_strategy=$8, rule_config=$9, updated_at=NOW()
    `, [id, generation_mode, template_strategy, calculator_code, renderer_code,
        pagination_mode, postprocess_mode, merge_strategy,
        typeof rule_config === 'object' ? JSON.stringify(rule_config) : rule_config])
    return c.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ ok: false, error: msg }, 400)
  }
})

// ═══════════════════════════════════════════════════════════════════
// [5] 템플릿 CRUD
// ═══════════════════════════════════════════════════════════════════

/** GET /api/ppt-menus/:id/templates */
app.get('/:id/templates', async (c) => {
  try {
    const id = Number(c.req.param('id'))
    const rows = await query(`
      SELECT t.*, COUNT(e.id) AS element_count
      FROM ppt_templates t
      LEFT JOIN ppt_template_elements e ON e.template_id = t.id
      WHERE t.menu_id=$1
      GROUP BY t.id
      ORDER BY t.variant_code, t.version DESC
    `, [id])
    return c.json({ ok: true, data: rows })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ ok: false, error: msg }, 500)
  }
})

/** POST /api/ppt-menus/:id/templates — multipart/form-data 파일 업로드 */
app.post('/:id/templates', async (c) => {
  try {
    const menuId = Number(c.req.param('id'))
    const contentType = c.req.header('content-type') || ''

    let template_name: string
    let variant_code: string
    let capacity: number | null
    let pptx_b64_key: string | null = null
    let pptx_file_path: string | null = null

    if (contentType.includes('multipart/form-data')) {
      // ── 파일 업로드 경로 ──────────────────────────────────────
      const form = await c.req.formData()
      template_name = String(form.get('template_name') ?? '')
      variant_code  = String(form.get('variant_code')  ?? 'DEFAULT') || 'DEFAULT'
      capacity      = form.get('capacity') ? Number(form.get('capacity')) : null
      const file = form.get('pptx_file') as File | null
      if (file && file.size > 0) {
        // 파일을 ArrayBuffer → Base64로 인코딩하여 pptx_b64_key 컬럼에 저장
        const buf    = await file.arrayBuffer()
        const bytes  = new Uint8Array(buf)
        let binary   = ''
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
        const b64 = btoa(binary)
        // 저장 키: "FILE:<원본파일명>:<업로드타임스탬프>"
        pptx_b64_key  = b64
        pptx_file_path = file.name
      }
    } else {
      // ── JSON 경로 (하위 호환) ─────────────────────────────────
      const body = await c.req.json()
      template_name  = body.template_name
      variant_code   = body.variant_code ?? 'DEFAULT'
      capacity       = body.capacity ?? null
      pptx_b64_key   = body.pptx_b64_key ?? null
      pptx_file_path = body.pptx_file_path ?? null
    }

    if (!template_name) return c.json({ ok: false, error: '템플릿 이름은 필수입니다' }, 400)

    const row = await queryOne<{ id: number }>(`
      INSERT INTO ppt_templates
        (menu_id, template_name, variant_code, pptx_b64_key, pptx_file_path, capacity, is_default, is_active)
      VALUES ($1,$2,$3,$4,$5,$6,1,1) RETURNING id
    `, [menuId, template_name, variant_code, pptx_b64_key, pptx_file_path, capacity ?? null])
    return c.json({ ok: true, id: row?.id, file_name: pptx_file_path })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ ok: false, error: msg }, 400)
  }
})

/** PUT /api/ppt-templates/:tid */
app.put('/templates/:tid', async (c) => {
  try {
    const tid = Number(c.req.param('tid'))
    const body = await c.req.json()
    const { template_name, variant_code, pptx_b64_key, capacity, slide_count, is_default, is_active, metadata } = body
    await exec(`
      UPDATE ppt_templates
      SET template_name=$1, variant_code=$2, pptx_b64_key=$3, capacity=$4,
          slide_count=$5, is_default=$6, is_active=$7, metadata=$8, updated_at=NOW()
      WHERE id=$9
    `, [template_name, variant_code, pptx_b64_key ?? null, capacity ?? null,
        slide_count ?? null, is_default ?? 1, is_active ?? 1,
        metadata ? JSON.stringify(metadata) : null, tid])
    return c.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ ok: false, error: msg }, 400)
  }
})

/** DELETE /api/ppt-templates/:tid */
app.delete('/templates/:tid', async (c) => {
  try {
    const tid = Number(c.req.param('tid'))
    await exec(`DELETE FROM ppt_templates WHERE id=$1`, [tid])
    return c.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ ok: false, error: msg }, 500)
  }
})

// ═══════════════════════════════════════════════════════════════════
// [6] 구성순서 (ppt_compositions) CRUD
// ═══════════════════════════════════════════════════════════════════

/** GET /api/ppt-compositions?type=DEFAULT */
app.get('/compositions', async (c) => {
  try {
    const type = c.req.query('type') ?? 'DEFAULT'
    const rows = await query(`
      SELECT pc.*, m.menu_code, m.menu_name, m.menu_number, m.sort_order AS menu_sort
      FROM ppt_compositions pc
      JOIN ppt_menus m ON m.id = pc.menu_id
      WHERE pc.proposal_type = $1
      ORDER BY pc.sort_order ASC
    `, [type])
    return c.json({ ok: true, data: rows })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ ok: false, error: msg }, 500)
  }
})

/** POST /api/ppt-compositions */
app.post('/compositions', async (c) => {
  try {
    const body = await c.req.json()
    const { proposal_type, menu_id, sort_order, is_required, condition_code, is_enabled } = body
    const row = await queryOne<{ id: number }>(`
      INSERT INTO ppt_compositions
        (proposal_type, menu_id, sort_order, is_required, condition_code, is_enabled)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (proposal_type, menu_id) DO UPDATE
        SET sort_order=$3, is_required=$4, condition_code=$5, is_enabled=$6, updated_at=NOW()
      RETURNING id
    `, [proposal_type ?? 'DEFAULT', menu_id, sort_order ?? 0,
        is_required ?? 1, condition_code ?? null, is_enabled ?? 1])
    return c.json({ ok: true, id: row?.id })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ ok: false, error: msg }, 400)
  }
})

/** PUT /api/ppt-compositions/:cid */
app.put('/compositions/:cid', async (c) => {
  try {
    const cid = Number(c.req.param('cid'))
    const body = await c.req.json()
    const { sort_order, is_required, condition_code, is_enabled } = body
    await exec(`
      UPDATE ppt_compositions
      SET sort_order=$1, is_required=$2, condition_code=$3, is_enabled=$4, updated_at=NOW()
      WHERE id=$5
    `, [sort_order ?? 0, is_required ?? 1, condition_code ?? null, is_enabled ?? 1, cid])
    return c.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ ok: false, error: msg }, 400)
  }
})

/** DELETE /api/ppt-compositions/:cid */
app.delete('/compositions/:cid', async (c) => {
  try {
    const cid = Number(c.req.param('cid'))
    await exec(`DELETE FROM ppt_compositions WHERE id=$1`, [cid])
    return c.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ ok: false, error: msg }, 500)
  }
})

/** POST /api/ppt-compositions/reorder — [{id, sort_order}, …] 일괄 변경 */
app.post('/compositions/reorder', async (c) => {
  try {
    const body = await c.req.json() as Array<{ id: number; sort_order: number }>
    for (const item of body) {
      await exec(
        `UPDATE ppt_compositions SET sort_order=$1, updated_at=NOW() WHERE id=$2`,
        [item.sort_order, item.id]
      )
    }
    return c.json({ ok: true, updated: body.length })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ ok: false, error: msg }, 400)
  }
})

export default app
