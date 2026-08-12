/**
 * PPT 목차/메뉴/템플릿/생성규칙 관리 API
 *
 * GET    /api/ppt-menus                  — 전체 메뉴 트리
 * POST   /api/ppt-menus                  — 메뉴 생성
 * PUT    /api/ppt-menus/:id              — 메뉴 수정
 * DELETE /api/ppt-menus/:id              — 메뉴 삭제
 *
 * GET    /api/ppt-menus/:id/rule         — 생성규칙 조회
 * PUT    /api/ppt-menus/:id/rule         — 생성규칙 저장 (upsert)
 *
 * GET    /api/ppt-menus/:id/templates    — 템플릿 목록
 * POST   /api/ppt-menus/:id/templates    — 템플릿 생성
 * PUT    /api/ppt-templates/:tid         — 템플릿 수정
 * DELETE /api/ppt-templates/:tid         — 템플릿 삭제
 *
 * POST   /api/ppt-menus/seed             — 초기 4개 메뉴 + 규칙 시드 (멱등)
 * POST   /api/ppt-menus/migrate          — PPT 관련 테이블 생성 (멱등)
 */

import { Hono } from 'hono'
import { query, queryOne } from '../db/client.js'

const app = new Hono()

// ─────────────────────────────────────────────────
// 헬퍼: 공통 SQL 실행
// ─────────────────────────────────────────────────
async function exec(sql: string, params: unknown[] = []) {
  return query(sql, params)
}

// ─────────────────────────────────────────────────
// [1] PPT 테이블 마이그레이션 (멱등)
// ─────────────────────────────────────────────────
app.post('/migrate', async (c) => {
  try {
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
    // 인덱스
    await exec(`CREATE INDEX IF NOT EXISTS idx_ppt_menus_parent      ON ppt_menus(parent_id)`)
    await exec(`CREATE INDEX IF NOT EXISTS idx_ppt_menus_sort        ON ppt_menus(sort_order)`)
    await exec(`CREATE INDEX IF NOT EXISTS idx_ppt_templates_menu    ON ppt_templates(menu_id)`)
    await exec(`CREATE INDEX IF NOT EXISTS idx_ppt_gen_rules_menu    ON ppt_generation_rules(menu_id)`)
    await exec(`CREATE INDEX IF NOT EXISTS idx_ppt_elements_template ON ppt_template_elements(template_id)`)

    return c.json({ ok: true, message: 'PPT 테이블 마이그레이션 완료' })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ ok: false, error: msg }, 500)
  }
})

// ─────────────────────────────────────────────────
// [2] 초기 시드 — 기존 4개 장표를 메뉴로 등록 (멱등)
// ─────────────────────────────────────────────────
app.post('/seed', async (c) => {
  try {
    // 부모 메뉴 — "감리 일정 및 절차"
    await exec(`
      INSERT INTO ppt_menus (menu_code, menu_name, menu_number, sort_order, is_enabled)
      VALUES ('SECTION_SCHEDULE', '감리 일정 및 절차', '다', 100, 1)
      ON CONFLICT (menu_code) DO NOTHING
    `)
    // 부모 메뉴 — "감리 인력"
    await exec(`
      INSERT INTO ppt_menus (menu_code, menu_name, menu_number, sort_order, is_enabled)
      VALUES ('SECTION_MANPOWER', '감리 인력', '라', 200, 1)
      ON CONFLICT (menu_code) DO NOTHING
    `)

    // 자식: 세부감리일정 (다 하위)
    const sectionSchedule = await queryOne<{ id: number }>(
      `SELECT id FROM ppt_menus WHERE menu_code = 'SECTION_SCHEDULE'`
    )
    const sectionManpower = await queryOne<{ id: number }>(
      `SELECT id FROM ppt_menus WHERE menu_code = 'SECTION_MANPOWER'`
    )

    const children: Array<{
      code: string; name: string; number: string; sort: number
      parent: number | null
      mode: string; strategy: string; calc: string; renderer: string
      pagination: string; postprocess: string; merge: string; config: string
    }> = [
      {
        code: 'DETAIL_SCHEDULE',
        name: '세부 감리 일정',
        number: '다-2',
        sort: 110,
        parent: sectionSchedule?.id ?? null,
        mode: 'BUILD_TABLE',
        strategy: 'FRAME_TEMPLATE',
        calc: 'computeDetailSchedule1Rows',
        renderer: 'renderDetailScheduleTable',
        pagination: 'SINGLE',
        postprocess: 'NONE',
        merge: 'STANDARD',
        config: JSON.stringify({ fontBold: 'KoPub돋움체 Bold', fontMedium: 'KoPub돋움체 Medium' }),
      },
      {
        code: 'ASSIGN_TABLE',
        name: '감리원/전문가 표장표',
        number: '라-1',
        sort: 210,
        parent: sectionManpower?.id ?? null,
        mode: 'BUILD_TABLE',
        strategy: 'FRAME_TEMPLATE',
        calc: 'computeAssignRows',
        renderer: 'renderAssignTable',
        pagination: 'MAX_ROWS',
        postprocess: 'NONE',
        merge: 'STANDARD',
        config: JSON.stringify({ maxRowsPerSlide: 20 }),
      },
      {
        code: 'PHOTO_ASSIGN',
        name: '감리원/전문가 사진 장표',
        number: '라-2',
        sort: 220,
        parent: sectionManpower?.id ?? null,
        mode: 'CLONE_SLIDE',
        strategy: 'VARIANT_TEMPLATE',
        calc: 'buildPhotoAssignCache',
        renderer: 'buildPhotoPptxFromTemplate',
        pagination: 'VARIANT_OVERFLOW',
        postprocess: 'NONE',
        merge: 'FOREIGN_TEMPLATE',
        config: JSON.stringify({
          variants: [2, 4, 6, 9],
          fillOrder: 'COLUMN_MAJOR',
          overflow: 'NEW_SLIDE',
          slotRemoval: true,
          b64Key: 'PHOTO_TEMPLATE_PPTX_B64',
        }),
      },
      {
        code: 'SUMMARY_TABLE',
        name: '감리 요약표',
        number: '다-1',
        sort: 105,
        parent: sectionSchedule?.id ?? null,
        mode: 'BUILD_TABLE',
        strategy: 'FRAME_TEMPLATE',
        calc: 'computeSummaryTableData',
        renderer: 'renderSummaryTable',
        pagination: 'SINGLE',
        postprocess: 'NONE',
        merge: 'STANDARD',
        config: JSON.stringify({}),
      },
    ]

    for (const ch of children) {
      // 메뉴 upsert
      await exec(`
        INSERT INTO ppt_menus (parent_id, menu_code, menu_name, menu_number, sort_order, is_enabled)
        VALUES ($1, $2, $3, $4, $5, 1)
        ON CONFLICT (menu_code) DO UPDATE
          SET menu_name   = EXCLUDED.menu_name,
              menu_number = EXCLUDED.menu_number,
              sort_order  = EXCLUDED.sort_order,
              updated_at  = NOW()
      `, [ch.parent, ch.code, ch.name, ch.number, ch.sort])

      const menu = await queryOne<{ id: number }>(`SELECT id FROM ppt_menus WHERE menu_code = $1`, [ch.code])
      if (!menu) continue

      // 기본 템플릿 (코드 생성형은 file_path = null)
      await exec(`
        INSERT INTO ppt_templates (menu_id, template_name, variant_code, capacity, version, is_default, is_active)
        VALUES ($1, $2, 'DEFAULT', NULL, 1, 1, 1)
        ON CONFLICT (menu_id, variant_code, version) DO NOTHING
      `, [menu.id, ch.name + ' 기본 템플릿'])

      // 사진장표: 4종 variant 추가
      if (ch.code === 'PHOTO_ASSIGN') {
        for (const [vCode, cap] of [['PERSON_2', 2], ['PERSON_4', 4], ['PERSON_6', 6], ['PERSON_9', 9]]) {
          await exec(`
            INSERT INTO ppt_templates (menu_id, template_name, variant_code, pptx_b64_key, capacity, version, is_default, is_active)
            VALUES ($1, $2, $3, 'PHOTO_TEMPLATE_PPTX_B64', $4, 1, 0, 1)
            ON CONFLICT (menu_id, variant_code, version) DO NOTHING
          `, [menu.id, `사진장표 ${cap}인 템플릿`, vCode, cap])
        }
      }

      // 생성 규칙 upsert
      await exec(`
        INSERT INTO ppt_generation_rules
          (menu_id, generation_mode, template_strategy, calculator_code, renderer_code,
           pagination_mode, postprocess_mode, merge_strategy, rule_config)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (menu_id) DO UPDATE
          SET generation_mode   = EXCLUDED.generation_mode,
              template_strategy = EXCLUDED.template_strategy,
              calculator_code   = EXCLUDED.calculator_code,
              renderer_code     = EXCLUDED.renderer_code,
              pagination_mode   = EXCLUDED.pagination_mode,
              postprocess_mode  = EXCLUDED.postprocess_mode,
              merge_strategy    = EXCLUDED.merge_strategy,
              rule_config       = EXCLUDED.rule_config,
              updated_at        = NOW()
      `, [menu.id, ch.mode, ch.strategy, ch.calc, ch.renderer, ch.pagination, ch.postprocess, ch.merge, ch.config])
    }

    return c.json({ ok: true, message: '초기 시드 완료 (기존 항목 유지)' })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ ok: false, error: msg }, 500)
  }
})

// ─────────────────────────────────────────────────
// [3] 메뉴 CRUD
// ─────────────────────────────────────────────────

/** GET /api/ppt-menus — 전체 메뉴 트리 (rule, templates 포함) */
app.get('/', async (c) => {
  try {
    const menus = await query<{
      id: number; parent_id: number | null; menu_code: string; menu_name: string
      menu_number: string | null; sort_order: number; is_enabled: number
    }>(`SELECT * FROM ppt_menus ORDER BY sort_order ASC, id ASC`)

    // rule, template 수 병합
    const rules = await query<{ menu_id: number; generation_mode: string; template_strategy: string; calculator_code: string; renderer_code: string; pagination_mode: string; postprocess_mode: string; merge_strategy: string; rule_config: string }>(
      `SELECT * FROM ppt_generation_rules`
    )
    const tplCounts = await query<{ menu_id: number; cnt: string }>(
      `SELECT menu_id, COUNT(*) AS cnt FROM ppt_templates WHERE is_active = 1 GROUP BY menu_id`
    )
    const ruleMap = Object.fromEntries(rules.map(r => [r.menu_id, r]))
    const tplMap = Object.fromEntries(tplCounts.map(r => [r.menu_id, Number(r.cnt)]))

    const enriched = menus.map(m => ({
      ...m,
      rule: ruleMap[m.id] ?? null,
      template_count: tplMap[m.id] ?? 0,
    }))

    // 트리 변환
    const map: Record<number, typeof enriched[0] & { children: unknown[] }> = {}
    const roots: (typeof enriched[0] & { children: unknown[] })[] = []
    enriched.forEach(m => { map[m.id] = { ...m, children: [] } })
    enriched.forEach(m => {
      if (m.parent_id && map[m.parent_id]) map[m.parent_id].children.push(map[m.id])
      else roots.push(map[m.id])
    })

    return c.json({ ok: true, data: roots })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ ok: false, error: msg }, 500)
  }
})

/** POST /api/ppt-menus — 메뉴 생성 */
app.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const { parent_id, menu_code, menu_name, menu_number, sort_order, is_enabled } = body
    const row = await queryOne<{ id: number }>(`
      INSERT INTO ppt_menus (parent_id, menu_code, menu_name, menu_number, sort_order, is_enabled)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [parent_id ?? null, menu_code, menu_name, menu_number ?? null, sort_order ?? 0, is_enabled ?? 1])
    return c.json({ ok: true, id: row?.id })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ ok: false, error: msg }, 400)
  }
})

/** PUT /api/ppt-menus/:id — 메뉴 수정 */
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

/** DELETE /api/ppt-menus/:id — 메뉴 삭제 */
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

// ─────────────────────────────────────────────────
// [4] 생성 규칙 CRUD
// ─────────────────────────────────────────────────

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
        SET generation_mode   = EXCLUDED.generation_mode,
            template_strategy = EXCLUDED.template_strategy,
            calculator_code   = EXCLUDED.calculator_code,
            renderer_code     = EXCLUDED.renderer_code,
            pagination_mode   = EXCLUDED.pagination_mode,
            postprocess_mode  = EXCLUDED.postprocess_mode,
            merge_strategy    = EXCLUDED.merge_strategy,
            rule_config       = EXCLUDED.rule_config,
            updated_at        = NOW()
    `, [id, generation_mode, template_strategy, calculator_code, renderer_code,
        pagination_mode, postprocess_mode, merge_strategy,
        typeof rule_config === 'object' ? JSON.stringify(rule_config) : rule_config])
    return c.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ ok: false, error: msg }, 400)
  }
})

// ─────────────────────────────────────────────────
// [5] 템플릿 CRUD
// ─────────────────────────────────────────────────

/** GET /api/ppt-menus/:id/templates */
app.get('/:id/templates', async (c) => {
  try {
    const id = Number(c.req.param('id'))
    const rows = await query(`
      SELECT t.*, COUNT(e.id) AS element_count
      FROM ppt_templates t
      LEFT JOIN ppt_template_elements e ON e.template_id = t.id
      WHERE t.menu_id = $1
      GROUP BY t.id
      ORDER BY t.variant_code, t.version DESC
    `, [id])
    return c.json({ ok: true, data: rows })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ ok: false, error: msg }, 500)
  }
})

/** POST /api/ppt-menus/:id/templates */
app.post('/:id/templates', async (c) => {
  try {
    const menuId = Number(c.req.param('id'))
    const body = await c.req.json()
    const { template_name, variant_code, pptx_b64_key, capacity, slide_count, is_default, metadata } = body
    const row = await queryOne<{ id: number }>(`
      INSERT INTO ppt_templates
        (menu_id, template_name, variant_code, pptx_b64_key, capacity, slide_count, is_default, is_active, metadata)
      VALUES ($1,$2,$3,$4,$5,$6,$7,1,$8)
      RETURNING id
    `, [menuId, template_name, variant_code ?? 'DEFAULT', pptx_b64_key ?? null,
        capacity ?? null, slide_count ?? null, is_default ?? 1,
        metadata ? JSON.stringify(metadata) : null])
    return c.json({ ok: true, id: row?.id })
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

export default app
