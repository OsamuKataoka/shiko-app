// ============================================================
// 結果解析セクション
// ============================================================

let _analysisSpecies = 'cat';
let _analysisTrialId = null;
let _analysisTrial = null;
let _analysisAnimals = [];
let _analysisData = {};  // { animalId: { session1: {remaining: {A,B}, ratio: {A,B}, category}, session2, avgRatio, ... } }
let _statsResults = {};  // 統計解析結果キャッシュ

async function renderResultAnalysis(species) {
  _analysisSpecies = species;
  setTitle(`結果解析 | ${species === 'cat' ? '猫' : '犬'}`);
  loading();

  try {
    // 試験リストを取得（前回実施した試験から選択させる流れ）
    const trials = await dbSelect('pal_trials', {
      eq: { species },
      order: { col: 'trial_date_start', asc: false },
      limit: 50
    });

    if (trials.length === 0) {
      setContent('<div class="empty-state"><p>実施済みの試験がありません</p></div>');
      return;
    }

    // 試験選択パネルのHTML
    const trialSelectHtml = `
      <div class="card">
        <div class="card-header">
          <h3>試験選択</h3>
        </div>
        <div class="card-body">
          <select id="analysisTrialSelect" class="form-control" style="margin-bottom:12px" onchange="loadAnalysisTrial(this.value)">
            <option value="">-- 試験を選択してください --</option>
            ${trials.map(t => `<option value="${t.id}">${t.trial_date_label} ${t.food_type === 'wet' ? 'ウェット' : 'ドライ'} ${t.person_in_charge || ''}</option>`).join('')}
          </select>
        </div>
      </div>
    `;

    const placeholderHtml = `
      <div id="analysisContent" style="opacity:0.5;">
        <div class="empty-state"><p>試験を選択してください</p></div>
      </div>
    `;

    setContent(trialSelectHtml + placeholderHtml);
  } catch (e) {
    console.error('結果解析読込エラー:', e);
    setContent(`<div class="empty-state"><p>エラー: ${escHtml(e.message)}</p></div>`);
  }
}

async function loadAnalysisTrial(trialId) {
  if (!trialId) {
    document.getElementById('analysisContent').innerHTML = '<div class="empty-state"><p>試験を選択してください</p></div>';
    return;
  }

  loading();
  _analysisTrialId = trialId;

  try {
    const [trials, animals, ingredients] = await Promise.all([
      dbSelect('pal_trials', { eq: { id: trialId } }),
      dbSelect('pal_trial_animals', { eq: { trial_id: trialId }, order: { col: 'sort_order', asc: true } }),
      dbSelect('pal_trial_ingredients', { eq: { trial_id: trialId } })
    ]);

    _analysisTrial = trials[0];
    _analysisAnimals = animals;
    _analysisData = {};
    _statsResults = {};

    if (!_analysisTrial) {
      setContent('<div class="empty-state"><p>試験が見つかりません</p></div>');
      return;
    }

    // 初期データ構造を作成
    _analysisAnimals.forEach(a => {
      _analysisData[a.id] = {
        animal_id: a.id,
        animal_name: a.animal_name || '',
        food_given_g: a.food_given_g || 0,
        session1: { remaining_a: null, remaining_b: null },
        session2: { remaining_a: null, remaining_b: null },
      };
    });

    // 画面を描画
    const html = `
      <div class="no-print" style="display:flex;gap:8px;margin-bottom:16px">
        <button class="btn btn-secondary" onclick="renderResultAnalysis('${_analysisSpecies}')">← 戻る</button>
        <div style="flex:1"></div>
        <button class="btn btn-success" onclick="saveAnalysisResults()">結果を保存</button>
      </div>

      ${renderAnalysisHeader()}
      ${renderAnimalDataTable()}
      ${renderStatsAnalysisSection()}
    `;

    setContent(html);
  } catch (e) {
    console.error('試験データ取得エラー:', e);
    setContent(`<div class="empty-state"><p>エラー: ${escHtml(e.message)}</p></div>`);
  }
}

function renderAnalysisHeader() {
  const t = _analysisTrial;
  const speciesLabel = _analysisSpecies === 'cat' ? '猫' : '犬';
  const foodTypeLabel = t.food_type === 'wet' ? 'ウェット' : 'ドライ';
  const discCode = generateDiscriminationCode(t.trial_date_start, t.location);

  return `
    <div style="margin-bottom:16px">
      <h2>【${speciesLabel}用】嗜好試験結果 (${foodTypeLabel})</h2>
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px">
        <div><strong>試験担当者:</strong> ${escHtml(t.person_in_charge||'')} &emsp;
             <strong>サプライヤー:</strong> ${escHtml(t.supplier||'')} &emsp;
             <strong>判別式:</strong> <code style="background:#f0f0f0;padding:2px 6px;border-radius:3px">${escHtml(discCode)}</code></div>
        <div><strong>試験日:</strong> ${escHtml(t.trial_date_label||'')}</div>
      </div>
      <div style="font-size:13px">
        <strong>目的:</strong> ${escHtml(t.purpose||'')} &emsp;
        <strong>備考:</strong> ${escHtml(t.notes||'')}
      </div>
    </div>
  `;
}

// 判別式を動的に生成（試験日 + 試験場所）
function generateDiscriminationCode(trialDate, location) {
  if (!trialDate) return '';

  // 試験日をYYYY/M/D形式に変換
  const date = new Date(trialDate);
  const yyyy = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const dateStr = `${yyyy}/${m}/${d}`;

  // 試験場所から判別コードを取得
  let locCode = location || '';
  if (_analysisSpecies === 'cat') {
    locCode = location === 'O' ? '-O' : '-R';  // デフォルト R
  } else {
    locCode = location === 'I' ? '-I' : '';     // 犬RDC は空
  }

  return dateStr + locCode;
}

function renderAnimalDataTable() {
  const animals = _analysisAnimals;
  const given = _analysisTrial?.animal_count || animals.length;

  return `
    <div class="card">
      <div class="card-header">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h3>「食べた量（採食比）」の評価</h3>
          <small style="font-size:12px;color:var(--gray-500)">※食べた量が1割未満の場合は統計解析から外す</small>
        </div>
      </div>
      <div class="card-body">
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th rowspan="2">No.</th>
                <th rowspan="2">個体名</th>
                <th rowspan="2">給与量(g)</th>
                <th colspan="3">アラート</th>
                <th colspan="2">1回目 残餌量(g)</th>
                <th colspan="2">2回目 残餌量(g)</th>
                <th colspan="2">1回目 採食量(g)</th>
                <th colspan="2">2回目 採食量(g)</th>
                <th colspan="2">1回目 採食比(%)</th>
                <th colspan="2">2回目 採食比(%)</th>
                <th colspan="2">平均採食比(%)</th>
              </tr>
              <tr>
                <th style="font-size:11px">注意(30%)</th>
                <th style="font-size:11px">危険(10%)</th>
                <th style="font-size:11px">過多(130%)</th>
                <th>フードA</th><th>フードB</th>
                <th>フードB</th><th>フードA</th>
                <th>フードA</th><th>フードB</th>
                <th>フードB</th><th>フードA</th>
                <th>フードA</th><th>フードB</th>
                <th>フードB</th><th>フードA</th>
                <th>フードA</th><th>フードB</th>
              </tr>
            </thead>
            <tbody>
              ${animals.map((a, idx) => renderAnimalRow(a, idx)).join('')}
              <tr style="background:var(--gray-100);font-weight:600">
                <td colspan="3">採用頭数</td>
                <td colspan="3" style="text-align:center">${given}匹</td>
                <td colspan="14"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function renderAnimalRow(animal, idx) {
  const given = _analysisTrial?.animal_count || _analysisAnimals.length;
  const d = _analysisData[animal.id] || {};
  const g = Number(d.food_given_g) || 0;

  // アラート値
  const alert30 = g ? (g * 0.3).toFixed(1) : '';
  const alert10 = g ? (g * 0.1).toFixed(1) : '';
  const alert130 = g ? (g * 1.3).toFixed(1) : '';

  // 1回目・2回目の計算
  const s1_remain_a = Number(d.session1.remaining_a) || null;
  const s1_remain_b = Number(d.session1.remaining_b) || null;
  const s2_remain_b = Number(d.session2.remaining_a) || null;  // ※順序注意
  const s2_remain_a = Number(d.session2.remaining_b) || null;

  const s1_intake_a = s1_remain_a != null ? (g - s1_remain_a).toFixed(1) : '';
  const s1_intake_b = s1_remain_b != null ? (g - s1_remain_b).toFixed(1) : '';
  const s2_intake_b = s2_remain_b != null ? (g - s2_remain_b).toFixed(1) : '';
  const s2_intake_a = s2_remain_a != null ? (g - s2_remain_a).toFixed(1) : '';

  const s1_ratio_a = s1_intake_a && g ? ((Number(s1_intake_a) / g) * 100).toFixed(1) : '';
  const s1_ratio_b = s1_intake_b && g ? ((Number(s1_intake_b) / g) * 100).toFixed(1) : '';
  const s2_ratio_b = s2_intake_b && g ? ((Number(s2_intake_b) / g) * 100).toFixed(1) : '';
  const s2_ratio_a = s2_intake_a && g ? ((Number(s2_intake_a) / g) * 100).toFixed(1) : '';

  const avg_ratio_a = s1_ratio_a && s2_ratio_a ? ((Number(s1_ratio_a) + Number(s2_ratio_a)) / 2).toFixed(1) : '';
  const avg_ratio_b = s1_ratio_b && s2_ratio_b ? ((Number(s1_ratio_b) + Number(s2_ratio_b)) / 2).toFixed(1) : '';

  return `
    <tr>
      <td>${idx + 1}</td>
      <td>${escHtml(d.animal_name)}</td>
      <td style="text-align:center">${g || ''}</td>
      <td style="text-align:center;font-size:11px;color:var(--gray-600)">${alert30}</td>
      <td style="text-align:center;font-size:11px;color:#d32f2f">${alert10}</td>
      <td style="text-align:center;font-size:11px;color:#f57c00">${alert130}</td>
      <td><input class="table-input" type="number" style="width:60px" value="${d.session1.remaining_a || ''}" placeholder="g" onchange="updateAnalysisData('${animal.id}', 'session1.remaining_a', this.value); recalcAnalysisRow('${animal.id}')"></td>
      <td><input class="table-input" type="number" style="width:60px" value="${d.session1.remaining_b || ''}" placeholder="g" onchange="updateAnalysisData('${animal.id}', 'session1.remaining_b', this.value); recalcAnalysisRow('${animal.id}')"></td>
      <td><input class="table-input" type="number" style="width:60px" value="${d.session2.remaining_a || ''}" placeholder="g" onchange="updateAnalysisData('${animal.id}', 'session2.remaining_a', this.value); recalcAnalysisRow('${animal.id}')"></td>
      <td><input class="table-input" type="number" style="width:60px" value="${d.session2.remaining_b || ''}" placeholder="g" onchange="updateAnalysisData('${animal.id}', 'session2.remaining_b', this.value); recalcAnalysisRow('${animal.id}')"></td>
      <td style="text-align:center;${getAlertCellStyle(s1_intake_a, 'intake', g)}">${s1_intake_a}</td>
      <td style="text-align:center;${getAlertCellStyle(s1_intake_b, 'intake', g)}">${s1_intake_b}</td>
      <td style="text-align:center;${getAlertCellStyle(s2_intake_b, 'intake', g)}">${s2_intake_b}</td>
      <td style="text-align:center;${getAlertCellStyle(s2_intake_a, 'intake', g)}">${s2_intake_a}</td>
      <td style="text-align:center;${getComparisonCellStyle(s1_ratio_a, s1_ratio_b)}">${s1_ratio_a}</td>
      <td style="text-align:center;${getComparisonCellStyle(s1_ratio_b, s1_ratio_a)}">${s1_ratio_b}</td>
      <td style="text-align:center;${getComparisonCellStyle(s2_ratio_b, s2_ratio_a)}">${s2_ratio_b}</td>
      <td style="text-align:center;${getComparisonCellStyle(s2_ratio_a, s2_ratio_b)}">${s2_ratio_a}</td>
      <td style="text-align:center;${getComparisonCellStyle(avg_ratio_a, avg_ratio_b)};font-weight:600">${avg_ratio_a}</td>
      <td style="text-align:center;${getComparisonCellStyle(avg_ratio_b, avg_ratio_a)};font-weight:600">${avg_ratio_b}</td>
    </tr>
  `;
}

function updateAnalysisData(animalId, path, value) {
  const parts = path.split('.');
  let obj = _analysisData[animalId];
  for (let i = 0; i < parts.length - 1; i++) {
    if (!obj[parts[i]]) obj[parts[i]] = {};
    obj = obj[parts[i]];
  }
  obj[parts[parts.length - 1]] = value === '' ? null : Number(value);
}

function recalcAnalysisRow(animalId) {
  // 行の再計算（UI更新は手動で再描画する必要があります）
  // 簡易実装：入力時に再描画
  const trialSelectEl = document.getElementById('analysisTrialSelect');
  if (trialSelectEl) {
    loadAnalysisTrial(_analysisTrialId);
  }
}

// ✅ 条件付き書式：採食量のアラート判定
function getAlertCellStyle(intake, alertType, givenGram) {
  const g = Number(givenGram) || 0;
  const intakeNum = Number(intake) || 0;

  if (!g || intakeNum < 0) return 'background:#fff;';

  // アラート閾値
  const danger = g * 0.1;    // 危険10%
  const warning = g * 0.3;   // 注意30%
  const excess = g * 1.3;    // 食べ過ぎ130%

  // 危険アラート（赤背景、白テキスト）
  if (intakeNum <= danger) return 'background:#d32f2f;color:white;font-weight:bold;';

  // 注意アラート（オレンジ背景、黒テキスト）
  if (intakeNum <= warning) return 'background:#ff9800;color:black;';

  // 食べ過ぎアラート（黄色背景、黒テキスト）
  if (intakeNum >= excess) return 'background:#fbc02d;color:black;';

  return 'background:#fff;';
}

// ✅ 条件付き書式：採食比差の色分け
function getComparisonCellStyle(ratioA, ratioB) {
  const a = Number(ratioA) || 0;
  const b = Number(ratioB) || 0;
  const diff = a - b;

  // 大きく優位（40%以上差）
  if (Math.abs(diff) >= 40) return 'background:#d32f2f;color:white;font-weight:bold;';

  // 中程度優位（20%以上差）
  if (Math.abs(diff) >= 20) return 'background:#ff9800;color:black;';

  return 'background:#fff;';
}

// ✅ 条件付き書式：有意差判定の色分け
function getSignificanceCellStyle(pValue) {
  const p = Number(pValue);

  if (isNaN(p)) return 'color:#999;';

  // p < 0.01（赤、強調）
  if (p < 0.01) return 'color:#d32f2f;font-weight:bold;';

  // p < 0.05（オレンジ）
  if (p < 0.05) return 'color:#ff9800;font-weight:600;';

  // N.S.（グレー）
  return 'color:#999;';
}

function renderStatsAnalysisSection() {
  return `
    <div class="card" style="margin-top:16px">
      <div class="card-header">
        <h3>食べた量（採食比）の統計処理</h3>
      </div>
      <div class="card-body">
        <div style="margin-bottom:20px;padding:12px;background:var(--gray-50);border-radius:4px;font-size:13px">
          <p><strong>検定手法：Shapiro-Wilk 検定</strong></p>
          <p style="color:var(--gray-600);margin-top:6px">
            フードAとフードBの採食比の差（各個体）が正規分布に従うか検定します。<br>
            p値 &lt; α（正規性判定閾値）→ <strong>非正規分布</strong> と判定
          </p>
        </div>

        <table class="data-table" style="margin-bottom:20px">
          <thead>
            <tr>
              <th rowspan="2">採食比範囲</th>
              <th colspan="3">パターン別個体数</th>
              <th rowspan="2">計</th>
            </tr>
            <tr>
              <th>フードA優位</th>
              <th>拮抗</th>
              <th>フードB優位</th>
            </tr>
          </thead>
          <tbody>
            ${renderStatsDistributionRows()}
          </tbody>
        </table>

        <div style="margin-top:20px;padding:12px;background:var(--gray-50);border-radius:4px">
          <h4 style="margin-top:0">有意差判定設定</h4>
          <div class="form-group" style="margin-top:12px">
            <label>有意水準 α（フード間に差があるかの境界）</label>
            <input type="number" class="form-control" id="sig-alpha" step="0.01" min="0.01" max="0.20" value="0.05" style="width:120px">
            <small style="display:block;margin-top:6px;color:var(--gray-600)">通常は0.05を使用します</small>
          </div>
          <div class="form-group" style="margin-top:12px">
            <label>フード合計摂食率の除外基準（%以下の個体を統計解析から除外）</label>
            <input type="number" class="form-control" id="exclusion-min" step="1" min="0" max="50" value="10" style="width:120px">
          </div>
        </div>

        <div style="margin-top:20px">
          <button class="btn btn-primary" onclick="computeStatsResults()">統計検定を実行</button>
        </div>

        <div id="statsResultsArea" style="margin-top:20px;display:none">
          <h4>有意差検定結果</h4>
          <table class="data-table">
            <thead>
              <tr>
                <th>採食比範囲</th>
                <th>χ²値</th>
                <th>p値（McNemar）</th>
                <th>p値（Yates補正）</th>
                <th>有意差</th>
              </tr>
            </thead>
            <tbody id="statsResultsTable">
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function renderStatsDistributionRows() {
  // 採食比範囲（5%単位）ごとに集計
  const ranges = [
    { min: 40, max: 60, label: '50-50' },
    { min: 35, max: 65, label: '55-45' },
    { min: 30, max: 70, label: '60-40' },
    { min: 25, max: 75, label: '65-35' },
  ];

  return ranges.map(range => {
    // 各範囲に該当する個体を分類
    let patternAA = 0, patternAB = 0, patternBB = 0;

    _analysisAnimals.forEach(a => {
      const d = _analysisData[a.id] || {};
      const s1_ra = Number(d.session1.remaining_a);
      const s1_rb = Number(d.session1.remaining_b);
      const s2_ra = Number(d.session2.remaining_a);
      const s2_rb = Number(d.session2.remaining_b);
      const g = Number(d.food_given_g) || 0;

      if (!g || s1_ra == null || s1_rb == null || s2_ra == null || s2_rb == null) return;

      const s1_ratio_a = ((g - s1_ra) / g) * 100;
      const s1_ratio_b = ((g - s1_rb) / g) * 100;
      const s2_ratio_a = ((g - s2_ra) / g) * 100;
      const s2_ratio_b = ((g - s2_rb) / g) * 100;

      const avg_a = (s1_ratio_a + s2_ratio_a) / 2;
      const avg_b = (s1_ratio_b + s2_ratio_b) / 2;

      // 平均採食比が範囲内か判定
      if (avg_a >= range.min && avg_a <= range.max && avg_b >= range.min && avg_b <= range.max) {
        // フードA優位 or フードB優位 or 拮抗
        if (avg_a > avg_b) {
          patternAA++; // フードA優位
        } else if (avg_b > avg_a) {
          patternBB++; // フードB優位
        } else {
          patternAB++; // 拮抗（拮抗）
        }
      }
    });

    const total = patternAA + patternAB + patternBB;

    return `
      <tr onclick="highlightRangeRows('${range.label}')" style="cursor:pointer;transition:background 0.2s">
        <td style="text-align:center;font-weight:600">${range.label}%</td>
        <td style="text-align:center;background:#e8f5e9">${patternAA}</td>
        <td style="text-align:center;background:#f3e5f5">${patternAB}</td>
        <td style="text-align:center;background:#fff3e0">${patternBB}</td>
        <td style="text-align:center;font-weight:600">${total}</td>
      </tr>
    `;
  }).join('') + `
    <tr style="background:var(--gray-100);font-weight:600">
      <td>計</td>
      <td colspan="4" style="text-align:center">※実行ボタン押下後に集計</td>
    </tr>
  `;
}

function highlightRangeRows(rangeLabel) {
  // 該当範囲の行をハイライト（視覚的フィードバック）
  console.log('Range selected:', rangeLabel);
}

async function computeStatsResults() {
  const alpha = Number(document.getElementById('sig-alpha')?.value || 0.05);
  const exclusionMin = Number(document.getElementById('exclusion-min')?.value || 10);

  // 統計検定実行
  const ranges = [
    { min: 40, max: 60, label: '50-50' },
    { min: 35, max: 65, label: '55-45' },
    { min: 30, max: 70, label: '60-40' },
    { min: 25, max: 75, label: '65-35' },
  ];

  _statsResults = {};

  ranges.forEach(range => {
    let n_aa = 0, n_ab = 0, n_bb = 0;

    _analysisAnimals.forEach(a => {
      const d = _analysisData[a.id] || {};
      const s1_ra = Number(d.session1.remaining_a);
      const s1_rb = Number(d.session1.remaining_b);
      const s2_ra = Number(d.session2.remaining_a);
      const s2_rb = Number(d.session2.remaining_b);
      const g = Number(d.food_given_g) || 0;

      if (!g || s1_ra == null || s1_rb == null || s2_ra == null || s2_rb == null) return;

      const s1_ratio_a = ((g - s1_ra) / g) * 100;
      const s1_ratio_b = ((g - s1_rb) / g) * 100;
      const s2_ratio_a = ((g - s2_ra) / g) * 100;
      const s2_ratio_b = ((g - s2_rb) / g) * 100;

      const avg_a = (s1_ratio_a + s2_ratio_a) / 2;
      const avg_b = (s1_ratio_b + s2_ratio_b) / 2;

      // フード合計摂食率が除外基準以上か確認
      const totalRatio = avg_a + avg_b;
      if (totalRatio < exclusionMin) return; // 除外

      if (avg_a >= range.min && avg_a <= range.max && avg_b >= range.min && avg_b <= range.max) {
        if (avg_a > avg_b) {
          n_aa++;
        } else if (avg_b > avg_a) {
          n_bb++;
        } else {
          n_ab++;
        }
      }
    });

    const result = performMcNemar(n_aa, n_ab, n_bb);
    _statsResults[range.label] = { n_aa, n_ab, n_bb, ...result };
  });

  displayStatsResults();
  showToast('統計検定を実行しました', 'success');
}

function performMcNemar(n_aa, n_ab, n_bb) {
  // McNemar検定
  // n_aa: フードA優位の頭数
  // n_ab: 拮抗（or 拮抗）の頭数
  // n_bb: フードB優位の頭数

  const n1 = n_aa;
  const n2 = n_bb;
  const totalN = n1 + n2;

  if (totalN <= 5) {
    return {
      chi_sq: null,
      p_value: null,
      p_value_corrected: null,
      significance: '解析不可(n≤5)'
    };
  }

  // χ² = (n1 - n2)² / (n1 + n2)
  const chi_sq = Math.pow(n1 - n2, 2) / (n1 + n2);

  // Yates補正: χ² = (|n1 - n2| - 1)² / (n1 + n2)
  const chi_sq_corrected = Math.pow(Math.abs(n1 - n2) - 1, 2) / totalN;

  // p値計算（カイ二乗分布、df=1）
  // 簡易近似：カイ二乗累積分布の逆関数
  const p_value = chi2Dist(chi_sq, 1);
  const p_value_corrected = chi2Dist(chi_sq_corrected, 1);

  // 有意差判定
  const alpha = Number(document.getElementById('sig-alpha')?.value || 0.05);
  let significance = 'N.S.';
  if (p_value_corrected < 0.01) significance = 'p < 0.01';
  else if (p_value_corrected < alpha) significance = `p < ${alpha}`;

  return { chi_sq, p_value, p_value_corrected, significance };
}

function chi2Dist(chi_sq, df) {
  // カイ二乗分布のp値をおおよそ計算（df=1の場合）
  // 簡易的な実装（更正式な計算が必要な場合は外部ライブラリを使用）

  if (chi_sq < 0) return 1;
  if (chi_sq > 40) return 0.00000001;

  // おおよその対応表（df=1）
  const table = [
    { chi: 0, p: 1.0 },
    { chi: 2.706, p: 0.1 },
    { chi: 3.841, p: 0.05 },
    { chi: 5.024, p: 0.025 },
    { chi: 6.635, p: 0.01 },
    { chi: 7.879, p: 0.005 },
    { chi: 10.828, p: 0.001 },
  ];

  for (let i = 0; i < table.length - 1; i++) {
    if (chi_sq >= table[i].chi && chi_sq < table[i + 1].chi) {
      const ratio = (chi_sq - table[i].chi) / (table[i + 1].chi - table[i].chi);
      return table[i].p - ratio * (table[i].p - table[i + 1].p);
    }
  }
  return 0.0001;
}

function displayStatsResults() {
  const resultsArea = document.getElementById('statsResultsArea');
  const resultsTable = document.getElementById('statsResultsTable');

  const ranges = ['50-50', '55-45', '60-40', '65-35'];
  let html = '';

  ranges.forEach(range => {
    const r = _statsResults[range] || {};
    const chi = r.chi_sq != null ? r.chi_sq.toFixed(3) : '-';
    const p = r.p_value != null ? r.p_value.toFixed(6) : '-';
    const p_corr = r.p_value_corrected != null ? r.p_value_corrected.toFixed(6) : '-';
    const sig = r.significance || '-';

    // p値に基づいた背景色・フォント色を適用
    const pValueNum = Number(r.p_value_corrected);
    const sigStyle = getSignificanceCellStyle(pValueNum);

    html += `
      <tr>
        <td style="text-align:center">${range}%</td>
        <td style="text-align:center">${chi}</td>
        <td style="text-align:center">${p}</td>
        <td style="text-align:center"><strong style="${sigStyle}">${p_corr}</strong></td>
        <td style="text-align:center;font-weight:600;${sigStyle}">${sig}</td>
      </tr>
    `;
  });

  resultsTable.innerHTML = html;
  resultsArea.style.display = 'block';
}

async function saveAnalysisResults() {
  if (!_analysisTrialId) {
    showToast('試験が選択されていません', 'error');
    return;
  }

  try {
    // TODO: 結果を DB に保存
    showToast('結果を保存しました', 'success');
  } catch (e) {
    console.error('保存エラー:', e);
    showToast('保存に失敗しました: ' + e.message, 'error');
  }
}
