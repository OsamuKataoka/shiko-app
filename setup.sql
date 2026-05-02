-- ============================================================
-- PAW Lab 嗜好試験管理システム - Supabase セットアップSQL
-- 既存の猫管理日誌DBに追加するテーブル群
-- Supabase SQL Editor で実行してください
-- ============================================================

-- ============================================================
-- 1. 試験マスター (このアプリが管理, neko-appが参照)
-- ============================================================
CREATE TABLE IF NOT EXISTS pal_trials (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  species       TEXT NOT NULL CHECK (species IN ('cat','dog')),
  location      TEXT NOT NULL,        -- 猫:'R'/'O'  犬:''/'I'
  food_type     TEXT NOT NULL CHECK (food_type IN ('dry','wet')),
  trial_date_start DATE,
  trial_date_end   DATE,
  trial_date_label TEXT,              -- 表示用 "20240528-29" など
  purpose       TEXT,                 -- 目的
  notes         TEXT,                 -- 備考
  person_in_charge TEXT,              -- 試験担当者
  supplier      TEXT,                 -- サプライヤー
  food_a_overview TEXT,               -- 〇レシピ概要（概要行表示用）
  food_b_overview TEXT,               -- ●レシピ概要
  food_a_weight_total_g NUMERIC,      -- 〇合計重量(g)
  food_b_weight_total_g NUMERIC,      -- ●合計重量(g)
  animal_count  INTEGER,              -- 試験頭数
  statistical_test TEXT,              -- 検定手法（解析後に自動セット）
  preference_rate_a NUMERIC,          -- 〇選択率% (解析後に自動セット)
  preference_rate_b NUMERIC,          -- ●選択率%
  result_date   TEXT,                 -- 試験No./結果入力日
  status        TEXT DEFAULT '計画中' CHECK (status IN ('計画中','進行中','完了','中止')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. 試験内訳行 (〇/● 各原料の詳細)
-- ============================================================
CREATE TABLE IF NOT EXISTS pal_trial_ingredients (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_id    UUID NOT NULL REFERENCES pal_trials(id) ON DELETE CASCADE,
  side        TEXT NOT NULL CHECK (side IN ('A','B')),  -- A=〇, B=●
  material_no TEXT,        -- 原料No. (NULL=手打ち)
  recipe_name TEXT,        -- レシピ名
  blend_rate  NUMERIC,     -- 配合率(%)
  weight_g    NUMERIC,     -- 重量(g)
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. 試験参加個体 (neko-app animals テーブルにリンク)
-- ============================================================
CREATE TABLE IF NOT EXISTS pal_trial_animals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_id     UUID NOT NULL REFERENCES pal_trials(id) ON DELETE CASCADE,
  animal_id    UUID REFERENCES animals(id) ON DELETE SET NULL,
  animal_name  TEXT,        -- animal_id がない場合の手打ち名
  food_given_g NUMERIC,     -- 1皿の給与量(g) ドライ用
  tare_g       NUMERIC,     -- 風袋(g) ウェット用
  sort_order   INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(trial_id, animal_id)
);

-- ============================================================
-- 4. 試験結果 (個体別残餌量)
-- ============================================================
CREATE TABLE IF NOT EXISTS pal_results (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_id     UUID NOT NULL REFERENCES pal_trials(id) ON DELETE CASCADE,
  animal_id    UUID REFERENCES animals(id) ON DELETE SET NULL,
  animal_name  TEXT,
  -- 1回目 (○先)
  remaining_a_1st NUMERIC,   -- 〇残餌量1回目
  remaining_b_1st NUMERIC,   -- ●残餌量1回目
  total_a_1st     NUMERIC,   -- 〇総量1回目 (ウェット用)
  total_b_1st     NUMERIC,   -- ●総量1回目 (ウェット用)
  -- 2回目 (●先)
  remaining_b_2nd NUMERIC,   -- ●残餌量2回目
  remaining_a_2nd NUMERIC,   -- 〇残餌量2回目
  total_b_2nd     NUMERIC,   -- ●総量2回目 (ウェット用)
  total_a_2nd     NUMERIC,   -- 〇総量2回目 (ウェット用)
  -- 解析除外
  excluded         BOOLEAN DEFAULT FALSE,
  exclusion_reason TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(trial_id, animal_id)
);

-- ============================================================
-- 5. 統計解析結果 (全項目保存 / 表示列は別設定)
-- ============================================================
CREATE TABLE IF NOT EXISTS pal_analysis (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_id            UUID NOT NULL REFERENCES pal_trials(id) ON DELETE CASCADE,
  species             TEXT NOT NULL CHECK (species IN ('cat','dog')),
  computed_at         TIMESTAMPTZ DEFAULT NOW(),
  -- 解析対象頭数
  n_total             INTEGER,
  n_excluded          INTEGER,
  n_used              INTEGER,
  -- 採食比 (1回目)
  mean_a_ratio_1st    NUMERIC,
  mean_b_ratio_1st    NUMERIC,
  median_a_ratio_1st  NUMERIC,
  median_b_ratio_1st  NUMERIC,
  -- 採食比 (2回目)
  mean_a_ratio_2nd    NUMERIC,
  mean_b_ratio_2nd    NUMERIC,
  median_a_ratio_2nd  NUMERIC,
  median_b_ratio_2nd  NUMERIC,
  -- 採食比 (平均)
  mean_a_ratio_avg    NUMERIC,
  mean_b_ratio_avg    NUMERIC,
  median_a_ratio_avg  NUMERIC,
  median_b_ratio_avg  NUMERIC,
  -- 正規性検定
  normality_test      TEXT,       -- 'shapiro'
  normality_p_a       NUMERIC,
  normality_p_b       NUMERIC,
  is_normal           BOOLEAN,
  -- 有意差検定
  stat_test_used      TEXT,       -- 't-test' or 'wilcoxon'
  p_value             NUMERIC,
  is_significant      BOOLEAN,
  significance_label  TEXT,       -- 'p<0.05' など
  -- 効果量
  effect_size_method  TEXT,       -- 'cohen_dz' or 'rank_biserial'
  effect_size_value   NUMERIC,
  effect_size_label   TEXT,       -- 'small'/'medium'/'large'
  -- 最終判定
  winner              TEXT,       -- 'A','B','tie','inconclusive'
  conclusion          TEXT,       -- 自然言語サマリー
  -- 生データ (JSON配列)
  raw_a_ratios        JSONB,      -- 各個体の〇採食比
  raw_b_ratios        JSONB,      -- 各個体の●採食比
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 6. RDC 原料在庫管理
-- ============================================================
CREATE TABLE IF NOT EXISTS raw_materials (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status           TEXT,           -- '90日以上','期限切れ',NULL(在庫あり)
  category         TEXT,           -- 嗜好性原料/機能性原料/ノンコート粒 等
  material_no      TEXT,           -- PM_xxx / FM_xxx / NC_xxx 等
  name             TEXT NOT NULL,
  classification   TEXT,           -- 類別
  origin           TEXT,           -- 由来
  unit_price       NUMERIC,        -- 参考単価(円/kg)
  supply_volume_kg NUMERIC,        -- 供給量kg/月
  manufacturer     TEXT,           -- 製造会社
  trading_company  TEXT,           -- 仕入(商社)会社
  other_company    TEXT,
  expiry_date      DATE,           -- 賞味期限
  sample_location  TEXT,           -- サンプル保管場所
  disposal_date    DATE,           -- 廃棄日
  info_location    TEXT,           -- 情報保管場所
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 7. 選択肢一覧 (試験区分/サプライヤー/類別/由来 等)
-- ============================================================
CREATE TABLE IF NOT EXISTS dropdown_options (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category   TEXT NOT NULL,   -- '試験区分','サプライヤー','類別','由来','目的','場所' 等
  value      TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(category, value)
);

-- ============================================================
-- 8. 調製用紙チェックリスト
-- ============================================================
CREATE TABLE IF NOT EXISTS prep_checklist (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  species    TEXT NOT NULL CHECK (species IN ('cat','dog','both')),
  location   TEXT NOT NULL,   -- 'R','O','','I','all'
  food_type  TEXT NOT NULL CHECK (food_type IN ('dry','wet','both')),
  item_text  TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 9. 統計解析設定 (猫/犬それぞれ)
-- ============================================================
CREATE TABLE IF NOT EXISTS stat_settings (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  species                 TEXT NOT NULL CHECK (species IN ('cat','dog')),
  -- 正規性検定
  normality_test          TEXT DEFAULT 'shapiro',
  normality_alpha         NUMERIC DEFAULT 0.05,
  -- 有意差検定
  significance_alpha      NUMERIC DEFAULT 0.05,
  -- 除外基準
  exclusion_min_ratio     NUMERIC DEFAULT 10,    -- 摂食率10%未満で除外
  exclusion_max_ratio     NUMERIC DEFAULT 130,   -- 摂食率130%超で警告
  -- 集計方法
  aggregate_method        TEXT DEFAULT 'average', -- 'average','day1','day2'
  -- 効果量
  effect_size_method      TEXT DEFAULT 'auto',   -- 'auto','cohen_dz','rank_biserial'
  effect_small_threshold  NUMERIC DEFAULT 0.2,
  effect_medium_threshold NUMERIC DEFAULT 0.5,
  effect_large_threshold  NUMERIC DEFAULT 0.8,
  -- メモ
  notes                   TEXT,
  updated_at              TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(species)
);

-- ============================================================
-- 10. 結果一覧の表示列設定 (猫/犬それぞれ)
-- ============================================================
CREATE TABLE IF NOT EXISTS result_list_columns (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  species     TEXT NOT NULL CHECK (species IN ('cat','dog')),
  column_key  TEXT NOT NULL,   -- pal_analysis の列名
  label       TEXT NOT NULL,   -- 表示ラベル
  visible     BOOLEAN DEFAULT TRUE,
  sort_order  INTEGER DEFAULT 0,
  UNIQUE(species, column_key)
);

-- ============================================================
-- トリガー: updated_at 自動更新
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pal_trials_updated_at ON pal_trials;
CREATE TRIGGER pal_trials_updated_at
  BEFORE UPDATE ON pal_trials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS pal_results_updated_at ON pal_results;
CREATE TRIGGER pal_results_updated_at
  BEFORE UPDATE ON pal_results
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS raw_materials_updated_at ON raw_materials;
CREATE TRIGGER raw_materials_updated_at
  BEFORE UPDATE ON raw_materials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS stat_settings_updated_at ON stat_settings;
CREATE TRIGGER stat_settings_updated_at
  BEFORE UPDATE ON stat_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================
ALTER TABLE pal_trials          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pal_trial_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE pal_trial_animals   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pal_results         ENABLE ROW LEVEL SECURITY;
ALTER TABLE pal_analysis        ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_materials       ENABLE ROW LEVEL SECURITY;
ALTER TABLE dropdown_options    ENABLE ROW LEVEL SECURITY;
ALTER TABLE prep_checklist      ENABLE ROW LEVEL SECURITY;
ALTER TABLE stat_settings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE result_list_columns ENABLE ROW LEVEL SECURITY;

-- 全テーブル: ログイン済みユーザーは読み書き可
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pal_trials','pal_trial_ingredients','pal_trial_animals',
    'pal_results','pal_analysis','raw_materials',
    'dropdown_options','prep_checklist','stat_settings','result_list_columns'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_select" ON %s', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_insert" ON %s', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_update" ON %s', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_delete" ON %s', t, t);
    EXECUTE format('CREATE POLICY "%s_select" ON %s FOR SELECT TO authenticated USING (true)', t, t);
    EXECUTE format('CREATE POLICY "%s_insert" ON %s FOR INSERT TO authenticated WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY "%s_update" ON %s FOR UPDATE TO authenticated USING (true)', t, t);
    EXECUTE format('CREATE POLICY "%s_delete" ON %s FOR DELETE TO authenticated USING (true)', t, t);
  END LOOP;
END $$;

-- ============================================================
-- 初期データ
-- ============================================================

-- 統計設定 (猫/犬)
INSERT INTO stat_settings (species, normality_test, normality_alpha, significance_alpha,
  exclusion_min_ratio, exclusion_max_ratio, aggregate_method, effect_size_method,
  effect_small_threshold, effect_medium_threshold, effect_large_threshold)
VALUES
  ('cat','shapiro',0.05,0.05,10,130,'average','auto',0.2,0.5,0.8),
  ('dog','shapiro',0.05,0.05,10,130,'average','auto',0.2,0.5,0.8)
ON CONFLICT (species) DO NOTHING;

-- 結果一覧の表示列設定 (猫)
INSERT INTO result_list_columns (species, column_key, label, visible, sort_order) VALUES
  ('cat','trial_date_label',     '試験日',         true,  1),
  ('cat','location',             '場所',           true,  2),
  ('cat','food_type',            '種別',           true,  3),
  ('cat','purpose',              '目的',           true,  4),
  ('cat','supplier',             'サプライヤー',   false, 5),
  ('cat','food_a_overview',      '〇レシピ',       true,  6),
  ('cat','food_b_overview',      '●レシピ',       true,  7),
  ('cat','n_used',               '解析頭数',       true,  8),
  ('cat','mean_a_ratio_avg',     '〇平均選択率',   true,  9),
  ('cat','mean_b_ratio_avg',     '●平均選択率',   true,  10),
  ('cat','stat_test_used',       '検定手法',       true,  11),
  ('cat','p_value',              'p値',            true,  12),
  ('cat','is_significant',       '有意差',         true,  13),
  ('cat','effect_size_value',    '効果量',         false, 14),
  ('cat','effect_size_label',    '効果量判定',     false, 15),
  ('cat','winner',               '勝者',           true,  16),
  ('cat','person_in_charge',     '担当者',         false, 17),
  ('cat','status',               'ステータス',     true,  18)
ON CONFLICT (species, column_key) DO NOTHING;

-- 結果一覧の表示列設定 (犬)
INSERT INTO result_list_columns (species, column_key, label, visible, sort_order) VALUES
  ('dog','trial_date_label',     '試験日',         true,  1),
  ('dog','location',             '場所',           true,  2),
  ('dog','food_type',            '種別',           true,  3),
  ('dog','purpose',              '目的',           true,  4),
  ('dog','supplier',             'サプライヤー',   false, 5),
  ('dog','food_a_overview',      '〇レシピ',       true,  6),
  ('dog','food_b_overview',      '●レシピ',       true,  7),
  ('dog','n_used',               '解析頭数',       true,  8),
  ('dog','mean_a_ratio_avg',     '〇平均選択率',   true,  9),
  ('dog','mean_b_ratio_avg',     '●平均選択率',   true,  10),
  ('dog','stat_test_used',       '検定手法',       true,  11),
  ('dog','p_value',              'p値',            true,  12),
  ('dog','is_significant',       '有意差',         true,  13),
  ('dog','effect_size_value',    '効果量',         false, 14),
  ('dog','effect_size_label',    '効果量判定',     false, 15),
  ('dog','winner',               '勝者',           true,  16),
  ('dog','person_in_charge',     '担当者',         false, 17),
  ('dog','status',               'ステータス',     true,  18)
ON CONFLICT (species, column_key) DO NOTHING;

-- 選択肢一覧 初期データ
INSERT INTO dropdown_options (category, value, sort_order) VALUES
  ('試験区分','スクリーニング',         1),
  ('試験区分','本評価',                 2),
  ('試験区分','再現性確認',             3),
  ('試験区分','現行品比較',             4),
  ('試験区分','妥当性評価',             5),
  ('試験区分','自社比較',               6),
  ('試験区分','他社比較',               7),
  ('試験区分','中止',                   8),
  ('cat_location','R',                  1),
  ('cat_location','O',                  2),
  ('dog_location','',                   1),
  ('dog_location','I',                  2),
  ('food_type','dry',                   1),
  ('food_type','wet',                   2),
  ('status','計画中',                   1),
  ('status','進行中',                   2),
  ('status','完了',                     3),
  ('status','中止',                     4)
ON CONFLICT (category, value) DO NOTHING;

-- 調製用紙チェックリスト 初期データ
INSERT INTO prep_checklist (species, location, food_type, item_text, sort_order) VALUES
  ('cat','O','dry','調整後のフードはアルミ蒸着袋に入れてください。',1),
  ('cat','O','dry','フードの重量は5kg/袋以内でいれてください。',2),
  ('cat','O','dry','調整後のフードをいれる袋には「〇_試験日」「●_試験日」のラベルを貼ってください。',3),
  ('cat','O','dry','調製日を書いてください。',4),
  ('cat','O','dry','調製実施者名を書いてください。',5),
  ('cat','O','dry','調整用紙の上から順番に混ぜてください。',6),
  ('cat','O','dry','フードを入れたアルミ蒸着袋チャックを閉じシーリングしてください。',7),
  ('cat','R','dry','調製日を書いてください。',1),
  ('cat','R','dry','調製実施者名を書いてください。',2),
  ('cat','R','dry','調整用紙の上から順番に混ぜてください。',3),
  ('cat','R','dry','調整終了後、クリーンストックの残りの避妊去勢粒ncがある場合は返却してください。',4),
  ('cat','O','wet','調製日を書いてください。',1),
  ('cat','O','wet','調製実施者名を書いてください。',2),
  ('cat','O','wet','調整用紙の上から順番に混ぜてください。',3),
  ('dog','','dry','調製日を書いてください。',1),
  ('dog','','dry','調製実施者名を書いてください。',2),
  ('dog','','dry','調整用紙の上から順番に混ぜてください。',3),
  ('dog','I','dry','調製日を書いてください。',1),
  ('dog','I','dry','調製実施者名を書いてください。',2),
  ('dog','I','dry','調整用紙の上から順番に混ぜてください。',3)
ON CONFLICT DO NOTHING;
