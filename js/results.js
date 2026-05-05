// ============================================================
// 試験結果・結果一覧
// ============================================================

let _resSpecies     = 'cat';
let _resFilterState = {};   // フィルタ状態
let _resSortKey     = 'trial_date_start';
let _resSortAsc     = false;
let _editResultId   = null; // 編集中の trial_id

// ── 結果一覧 ─────────────────────────────────────────────
async function renderResultList(species) {
  _resSpecies = species;
  const spLabel = species === 'cat' ? '猫 結果一覧' : '犬 結果一覧';
  setTitle(spLabel);
  loading();

  const [columns, allTrials, analyses] = await Promise.all([
    dbSelect('result_list_columns', { eq: { species }, order: { col: 'sort_order', asc: true } }),
    dbSelect('pal_trials',  { eq: { species }, order: { col: 'trial_date_start', asc: false } }),
    dbSelect('pal_analysis',{ eq: { species } }),
  ]);

  window._resAllTrials  = allTrials;
  window._resAnalyses   = analyses;
  window._resColumns    = columns;

  const analysisMap = {};
  analyses.forEach(a => { if (!analysisMap[a.trial_id]) analysisMap[a.trial_id] = a; });
  window._resAnalysisMap = analysisMap;

  // フィルタ値収集用のユニーク選択肢
  const purposes   = [...new Set(allTrials.map(t=>t.purpose).filter(Boolean))].sort();
  const suppliers  = [...new Set(allTrials.map(t=>t.supplier).filter(Boolean))].sort();
  const statuses   = [...new Set(allTrials.map(t=>t.status||'計画中'))].sort();
  const locations  = [...new Set(allTrials.map(t=>t.location))].sort();
  const foodTypes  = [...new Set(allTrials.map(t=>t.food_type).filter(Boolean))].sort();

  // trial_date_label を除外（重複防止）
  const visibleCols = columns.filter(c => c.visible && c.column_key !== 'trial_date_label');

  setContent(`
    <!-- 表示列設定パネル -->
    <div class="card" style="margin-bottom:12px">
      <div class="card-header" style="cursor:pointer" onclick="toggleColSettings()">
        <span class="card-title">表示列設定</span>
        <span id="colSettingsToggle" style="font-size:12px;color:var(--gray-400)">▼ 展開</span>
      </div>
      <div id="colSettingsPanel" style="display:none">
        <div class="col-toggle-grid" style="padding:12px">
          ${columns.filter(c => c.column_key !== 'trial_date_label').map(c => `
            <label class="col-toggle-item">
              <input type="checkbox" ${c.visible?'checked':''} onchange="toggleResultColumn('${c.id}',this.checked)">
              ${escHtml(c.label)}
            </label>`).join('')}
        </div>
      </div>
    </div>

    <!-- フィルタバー -->
    <div class="card" style="margin-bottom:12px">
      <div class="card-header" style="cursor:pointer" onclick="toggleFilterPanel()">
        <span class="card-title">絞り込み・ソート</span>
        <span id="filterToggle" style="font-size:12px;color:var(--gray-400)">▼ 展開</span>
      </div>
      <div id="filterPanel" style="display:none;padding:14px">
        <div class="form-grid form-grid-3" style="gap:12px">
          <div class="form-group">
            <label>試験日（開始）</label>
            <input type="date" class="form-control" id="f-date-from" value="${_resFilterState.dateFrom||''}">
          </div>
          <div class="form-group">
            <label>試験日（終了）</label>
            <input type="date" class="form-control" id="f-date-to" value="${_resFilterState.dateTo||''}">
          </div>
          <div class="form-group">
            <label>フリーワード（目的・レシピ）</label>
            <input class="form-control" id="f-keyword" placeholder="キーワード" value="${escHtml(_resFilterState.keyword||'')}">
          </div>
        </div>
        <div style="display:flex;gap:24px;flex-wrap:wrap;margin-top:10px">
          <div>
            <label style="font-size:12px;font-weight:600;color:var(--gray-600);display:block;margin-bottom:4px">場所</label>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              ${locations.map(l => `
                <label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer">
                  <input type="checkbox" value="${escHtml(l)}" class="f-location"
                    ${(_resFilterState.locations||[]).includes(l)?'checked':''}
                    onchange="applyResFilter()">
                  ${escHtml(l||'RDC')}
                </label>`).join('')}
            </div>
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:var(--gray-600);display:block;margin-bottom:4px">状態</label>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              ${statuses.map(s => `
                <label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer">
                  <input type="checkbox" value="${escHtml(s)}" class="f-status"
                    ${(_resFilterState.statuses||[]).includes(s)?'checked':''}
                    onchange="applyResFilter()">
                  ${escHtml(s)}
                </label>`).join('')}
            </div>
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:var(--gray-600);display:block;margin-bottom:4px">種別</label>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              ${foodTypes.map(f => `
                <label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer">
                  <input type="checkbox" value="${escHtml(f)}" class="f-foodtype"
                    ${(_resFilterState.foodTypes||[]).includes(f)?'checked':''}
                    onchange="applyResFilter()">
                  ${escHtml(foodTypeLabel(f))}
                </label>`).join('')}
            </div>
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:var(--gray-600);display:block;margin-bottom:4px">サプライヤー</label>
            <div style="display:flex;gap:8px;flex-wrap:wrap;max-height:80px;overflow-y:auto">
              ${suppliers.map(s => `
                <label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer">
                  <input type="checkbox" value="${escHtml(s)}" class="f-supplier"
                    ${(_resFilterState.suppliers||[]).includes(s)?'checked':''}
                    onchange="applyResFilter()">
                  ${escHtml(s)}
                </label>`).join('')}
            </div>
          </div>
        </div>
        <div style="margin-top:10px;display:flex;gap:8px">
          <button class="btn btn-primary btn-sm" onclick="applyResFilter()">適用</button>
          <button class="btn btn-secondary btn-sm" onclick="clearResFilter()">クリア</button>
        </div>
      </div>
    </div>

    <!-- 結果テーブル -->
    <div class="card">
      <div class="card-header">
        <span class="card-title" id="resTotalLabel">${allTrials.length} 件</span>
        <div style="display:flex;gap:6px;align-items:center">
          <label style="font-size:12px;color:var(--gray-500)">ソート:</label>
          <select class="form-control" style="width:auto;padding:4px 8px;font-size:12px" onchange="_resSortKey=this.value;applyResFilter()">
            <option value="trial_date_start" ${_resSortKey==='trial_date_start'?'selected':''}>試験日</option>
            <option value="purpose"          ${_resSortKey==='purpose'?'selected':''}>目的</option>
            <option value="supplier"         ${_resSortKey==='supplier'?'selected':''}>サプライヤー</option>
            <option value="person_in_charge" ${_resSortKey==='person_in_charge'?'selected':''}>担当者</option>
            <option value="status"           ${_resSortKey==='status'?'selected':''}>状態</option>
          </select>
          <button class="btn btn-xs btn-secondary" onclick="_resSortAsc=!_resSortAsc;applyResFilter()">
            ${_resSortAsc ? '↑ 昇順' : '↓ 降順'}
          </button>
        </div>
      </div>
      <div class="table-wrap">
        <table class="data-table resizable-table table-with-sticky-cols" id="resTable">
          <thead>
            <tr>
              <th style="width:130px">試験日</th>
              <th style="width:160px;text-align:center">結果入力</th>
              ${visibleCols.filter(c => c.column_key !== 'trial_date_label').map(c => `<th>${escHtml(c.label)}</th>`).join('')}
            </tr>
          </thead>
          <tbody id="resTbody">
            ${buildResRows(allTrials, analysisMap, visibleCols)}
          </tbody>
        </table>
      </div>
    </div>

    ${renderResultEditModal()}
    ${renderResultDetailModal()}
  `);

  initResizableTable('resTable');
}

function buildResRows(trials, analysisMap, visibleCols) {
  if (!trials.length) {
    return `<tr><td colspan="${visibleCols.length+2}" style="text-align:center;color:var(--gray-400);padding:32px">データがありません</td></tr>`;
  }
  return trials.map(t => {
    const a = (analysisMap || {})[t.id] || {};
    return `<tr>
      <td style="white-space:nowrap;font-weight:600">${escHtml(t.trial_date_label || formatDate(t.trial_date_start))}</td>
      <td class="col-actions" style="white-space:nowrap;text-align:center">
        <button class="btn btn-xs btn-secondary" title="結果入力" onclick="openResultEdit('${t.id}')">✎</button>
        ${a.id ? `<button class="btn btn-xs btn-success" title="詳細表示" onclick="openResultDetail('${t.id}')">◆</button>` : ''}
      </td>
      ${visibleCols.map(c => `<td>${renderResultCell(c.column_key, t, a)}</td>`).join('')}
    </tr>`;
  }).join('');
}

// ── フィルタ ─────────────────────────────────────────────
function toggleColSettings() {
  const p = document.getElementById('colSettingsPanel');
  const t = document.getElementById('colSettingsToggle');
  if (!p) return;
  const open = p.style.display !== 'none';
  p.style.display = open ? 'none' : 'block';
  t.textContent   = open ? '▼ 展開' : '▲ 閉じる';
}
function toggleFilterPanel() {
  const p = document.getElementById('filterPanel');
  const t = document.getElementById('filterToggle');
  if (!p) return;
  const open = p.style.display !== 'none';
  p.style.display = open ? 'none' : 'block';
  t.textContent   = open ? '▼ 展開' : '▲ 閉じる';
}

function getChecked(cls) {
  return [...document.querySelectorAll(`.${cls}:checked`)].map(el => el.value);
}

function applyResFilter() {
  const dateFrom  = document.getElementById('f-date-from')?.value || '';
  const dateTo    = document.getElementById('f-date-to')?.value   || '';
  const keyword   = (document.getElementById('f-keyword')?.value   || '').toLowerCase();
  const locations = getChecked('f-location');
  const statuses  = getChecked('f-status');
  const foodTypes = getChecked('f-foodtype');
  const suppliers = getChecked('f-supplier');

  _resFilterState = { dateFrom, dateTo, keyword, locations, statuses, foodTypes, suppliers };

  let trials = (window._resAllTrials || []).filter(t => {
    if (dateFrom && (t.trial_date_start||'') < dateFrom) return false;
    if (dateTo   && (t.trial_date_start||'') > dateTo)   return false;
    if (keyword  && !`${t.purpose||''} ${t.food_a_overview||''} ${t.food_b_overview||''} ${t.notes||''} ${t.supplier||''}`.toLowerCase().includes(keyword)) return false;
    if (locations.length && !locations.includes(t.location)) return false;
    if (statuses.length  && !statuses.includes(t.status||'計画中')) return false;
    if (foodTypes.length && !foodTypes.includes(t.food_type)) return false;
    if (suppliers.length && !suppliers.includes(t.supplier||'')) return false;
    return true;
  });

  // ソート
  trials = trials.sort((a, b) => {
    const av = (a[_resSortKey]||'').toString();
    const bv = (b[_resSortKey]||'').toString();
    return _resSortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  const visibleCols = (window._resColumns||[]).filter(c => c.visible);
  document.getElementById('resTbody').innerHTML = buildResRows(trials, window._resAnalysisMap, visibleCols);
  document.getElementById('resTotalLabel').textContent = `${trials.length} 件`;
}

function clearResFilter() {
  _resFilterState = {};
  document.querySelectorAll('.f-location,.f-status,.f-foodtype,.f-supplier').forEach(el => { el.checked = false; });
  const kw = document.getElementById('f-keyword'); if (kw) kw.value = '';
  const df = document.getElementById('f-date-from'); if (df) df.value = '';
  const dt = document.getElementById('f-date-to');   if (dt) dt.value = '';
  applyResFilter();
}

// ── 表示列トグル ─────────────────────────────────────────
async function toggleResultColumn(id, visible) {
  try {
    await dbUpdate('result_list_columns', id, { visible });
    // UI を即座に再描画
    await renderResultList(_resSpecies);
  } catch (e) {
    console.error('列設定更新エラー:', e);
    showToast('列設定の更新に失敗しました', 'error');
  }
}

// ── 結果セル ─────────────────────────────────────────────
function renderResultCell(key, trial, analysis) {
  switch (key) {
    case 'trial_date_label':   return escHtml(trial.trial_date_label || formatDate(trial.trial_date_start));
    case 'location':           return escHtml(locationLabel(trial.species, trial.location));
    case 'food_type':          return escHtml(foodTypeLabel(trial.food_type));
    case 'purpose':            return escHtml(trial.purpose || '');
    case 'notes':              return `<span style="font-size:11px">${escHtml(trial.notes || '')}</span>`;
    case 'supplier':           return escHtml(trial.supplier || '');
    case 'person_in_charge':   return escHtml(trial.person_in_charge || '');
    case 'food_a_overview':    return `<span style="color:#1d4ed8;font-weight:600">フードA:</span> ${escHtml(trial.food_a_overview||'')}`;
    case 'food_b_overview':    return `<span style="color:#b45309;font-weight:600">フードB:</span> ${escHtml(trial.food_b_overview||'')}`;
    case 'status':             return statusBadge(trial.status || '計画中');
    case 'n_total':            return analysis.n_total ?? '-';
    case 'n_excluded':         return analysis.n_excluded ?? '-';
    case 'n_used':             return analysis.n_used ?? '-';
    case 'mean_a_ratio_avg':   return analysis.mean_a_ratio_avg != null ? `<span style="color:#1d4ed8;font-weight:700">${fmtPct(analysis.mean_a_ratio_avg)}</span>` : '-';
    case 'mean_b_ratio_avg':   return analysis.mean_b_ratio_avg != null ? `<span style="color:#b45309;font-weight:700">${fmtPct(analysis.mean_b_ratio_avg)}</span>` : '-';
    case 'median_a_ratio_avg': return fmtPct(analysis.median_a_ratio_avg);
    case 'median_b_ratio_avg': return fmtPct(analysis.median_b_ratio_avg);
    case 'stat_test_used':     return escHtml(analysis.stat_test_used || '-');
    case 'is_significant':
      if (analysis.is_significant == null) return '-';
      return analysis.is_significant
        ? '<span style="color:var(--success);font-weight:700">有意差あり</span>'
        : '<span style="color:var(--gray-400)">n.s.</span>';
    case 'effect_size_value':  return analysis.effect_size_value != null ? fmtNum(analysis.effect_size_value, 3) : '-';
    case 'effect_size_label':  return escHtml(analysis.effect_size_label || '-');
    case 'winner': {
      if (!analysis.winner) return '-';
      const m = { A:'<span style="color:#1d4ed8;font-weight:700">フードA勝</span>', B:'<span style="color:#b45309;font-weight:700">フードB勝</span>', tie:'引き分け', inconclusive:'判定不能' };
      return m[analysis.winner] || escHtml(analysis.winner);
    }
    default: return '';
  }
}

// ── 結果入力モーダル（手動入力） ─────────────────────────
function renderResultEditModal() {
  return `
  <div class="modal-overlay" id="resultEditModal">
    <div class="modal-box modal-lg">
      <div class="modal-header">
        <span class="modal-title" id="resultEditTitle">結果入力</span>
        <button class="modal-close" onclick="closeModal('resultEditModal')">x</button>
      </div>
      <div class="modal-body" id="resultEditBody">
        <div class="loading-wrap"><div class="spinner"></div>読込中...</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('resultEditModal')">キャンセル</button>
        <button class="btn btn-primary" onclick="saveResultEdit()">保存</button>
      </div>
    </div>
  </div>`;
}

function renderResultDetailModal() {
  return `
  <div class="modal-overlay" id="resultDetailModal">
    <div class="modal-box modal-lg">
      <div class="modal-header">
        <span class="modal-title">統計解析結果 詳細</span>
        <button class="modal-close" onclick="closeModal('resultDetailModal')">x</button>
      </div>
      <div class="modal-body" id="resultDetailBody">
        <div class="loading-wrap"><div class="spinner"></div>読込中...</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('resultDetailModal')">閉じる</button>
      </div>
    </div>
  </div>`;
}

// ── 結果入力（手動）────────────────────────────────────────
async function openResultEdit(trialId) {
  _editResultId = trialId;
  openModal('resultEditModal');
  document.getElementById('resultEditBody').innerHTML =
    '<div class="loading-wrap"><div class="spinner"></div>読込中...</div>';

  const [trials, analyses] = await Promise.all([
    dbSelect('pal_trials',  { eq: { id: trialId } }),
    dbSelect('pal_analysis',{ eq: { trial_id: trialId } }),
  ]);
  const t = trials[0];
  const a = analyses[0] || {};

  if (!t) return;
  document.getElementById('resultEditTitle').textContent =
    `結果入力: ${t.trial_date_label || ''} ${locationLabel(t.species, t.location)}`;

  document.getElementById('resultEditBody').innerHTML = `
    <p style="font-size:12px;color:var(--gray-500);margin-bottom:14px">
      統計解析後の数値・文字列を手動で入力してください。
    </p>
    <div class="form-grid form-grid-2">
      <div class="form-group">
        <label>総数（試験参加頭数）</label>
        <input type="number" class="form-control" id="re-n-total" value="${a.n_total??''}">
      </div>
      <div class="form-group">
        <label>解析頭数（統計解析に用いた頭数）</label>
        <input type="number" class="form-control" id="re-n-used" value="${a.n_used??''}">
      </div>
      <div class="form-group">
        <label>使用した検定</label>
        <select class="form-control" id="re-test">
          <option value="" ${!a.stat_test_used?'selected':''}>-- 未選択 --</option>
          <option value="t-test"    ${a.stat_test_used==='t-test'?'selected':''}>T検定（対応あり）</option>
          <option value="wilcoxon" ${a.stat_test_used==='wilcoxon'?'selected':''}>ウィルコクソン符号順位和検定</option>
        </select>
      </div>
      <div class="form-group">
        <label>採食比(%)_フードA 平均値</label>
        <input type="number" class="form-control" id="re-mean-a" step="0.01" value="${a.mean_a_ratio_avg??''}">
      </div>
      <div class="form-group">
        <label>採食比(%)_フードB 平均値</label>
        <input type="number" class="form-control" id="re-mean-b" step="0.01" value="${a.mean_b_ratio_avg??''}">
      </div>
      <div class="form-group">
        <label>採食比(%)_フードA 中央値</label>
        <input type="number" class="form-control" id="re-med-a" step="0.01" value="${a.median_a_ratio_avg??''}">
      </div>
      <div class="form-group">
        <label>採食比(%)_フードB 中央値</label>
        <input type="number" class="form-control" id="re-med-b" step="0.01" value="${a.median_b_ratio_avg??''}">
      </div>
      <div class="form-group">
        <label>有意差判定</label>
        <select class="form-control" id="re-significant">
          <option value="" ${a.is_significant==null && !a.p_value_category?'selected':''}>-- 未選択 --</option>
          <option value="p<0.01" ${a.p_value_category==='p<0.01'?'selected':''}>p &lt; 0.01 （有意差あり）</option>
          <option value="p<0.05" ${a.p_value_category==='p<0.05'?'selected':''}>p &lt; 0.05 （有意差あり）</option>
          <option value="N.S."   ${a.p_value_category==='N.S.'?'selected':''}>N.S. （有意差なし）</option>
        </select>
      </div>
      <div class="form-group">
        <label>効果量 手法</label>
        <select class="form-control" id="re-ef-method">
          <option value="" ${!a.effect_size_method?'selected':''}>-- 未選択 --</option>
          <option value="cohen_dz"      ${a.effect_size_method==='cohen_dz'?'selected':''}>Cohen's dz</option>
          <option value="rank_biserial" ${a.effect_size_method==='rank_biserial'?'selected':''}>rank-biserial</option>
        </select>
      </div>
      <div class="form-group">
        <label>効果量 値</label>
        <input type="number" class="form-control" id="re-ef-value" step="0.001" value="${a.effect_size_value??''}">
      </div>
      <div class="form-group">
        <label>効果量 評価</label>
        <select class="form-control" id="re-ef-label">
          <option value="" ${!a.effect_size_label?'selected':''}>-- 未選択 --</option>
          <option value="negligible (無視できる)" ${a.effect_size_label?.startsWith('negligible')?'selected':''}>negligible (無視できる)</option>
          <option value="small (小)"   ${a.effect_size_label?.startsWith('small')?'selected':''}>small (小)</option>
          <option value="medium (中)"  ${a.effect_size_label?.startsWith('medium')?'selected':''}>medium (中)</option>
          <option value="large (大)"   ${a.effect_size_label?.startsWith('large')?'selected':''}>large (大)</option>
        </select>
      </div>
      <div class="form-group">
        <label>結果判定</label>
        <select class="form-control" id="re-winner">
          <option value=""    ${!a.winner?'selected':''}>-- 未選択 --</option>
          <option value="A"   ${a.winner==='A'?'selected':''}>フードA が優位</option>
          <option value="B"   ${a.winner==='B'?'selected':''}>フードB が優位</option>
          <option value="tie" ${a.winner==='tie'?'selected':''}>差なし（引き分け）</option>
          <option value="inconclusive" ${a.winner==='inconclusive'?'selected':''}>判定不能</option>
        </select>
      </div>
    </div>
    <div class="form-group" style="margin-top:12px">
      <label>結論テキスト（自由記述）</label>
      <textarea class="form-control" id="re-conclusion" rows="3">${escHtml(a.conclusion||'')}</textarea>
    </div>
    <input type="hidden" id="re-analysis-id" value="${a.id||''}">
    <input type="hidden" id="re-trial-species" value="${t.species||''}">
  `;
}

async function saveResultEdit() {
  if (!_editResultId) return;
  const analysisId = document.getElementById('re-analysis-id').value;
  const species    = document.getElementById('re-trial-species').value || _resSpecies;

  const sigCategory = document.getElementById('re-significant').value;  // p<0.01, p<0.05, N.S., or empty

  const data = {
    trial_id:           _editResultId,
    species,
    n_total:            parseInt(document.getElementById('re-n-total').value)  || null,
    n_used:             parseInt(document.getElementById('re-n-used').value)   || null,
    stat_test_used:     document.getElementById('re-test').value                || null,
    mean_a_ratio_avg:   parseFloat(document.getElementById('re-mean-a').value) || null,
    mean_b_ratio_avg:   parseFloat(document.getElementById('re-mean-b').value) || null,
    median_a_ratio_avg: parseFloat(document.getElementById('re-med-a').value)  || null,
    median_b_ratio_avg: parseFloat(document.getElementById('re-med-b').value)  || null,
    p_value_category:   sigCategory || null,
    is_significant:     sigCategory && sigCategory !== 'N.S.' ? true : sigCategory === 'N.S.' ? false : null,
    effect_size_method: document.getElementById('re-ef-method').value || null,
    effect_size_value:  parseFloat(document.getElementById('re-ef-value').value) || null,
    effect_size_label:  document.getElementById('re-ef-label').value || null,
    winner:             document.getElementById('re-winner').value    || null,
    conclusion:         document.getElementById('re-conclusion').value.trim() || null,
    computed_at:        new Date().toISOString(),
  };

  try {
    if (analysisId) {
      await dbUpdate('pal_analysis', analysisId, data);
    } else {
      await dbInsert('pal_analysis', [data]);
    }
    // pal_trials の選択率も更新
    const trialPatch = {};
    if (data.mean_a_ratio_avg != null) trialPatch.preference_rate_a = data.mean_a_ratio_avg;
    if (data.mean_b_ratio_avg != null) trialPatch.preference_rate_b = data.mean_b_ratio_avg;
    if (data.stat_test_used)           trialPatch.statistical_test  = data.stat_test_used;
    if (Object.keys(trialPatch).length) await dbUpdate('pal_trials', _editResultId, trialPatch);

    showToast('結果を保存しました', 'success');
    closeModal('resultEditModal');
    await renderResultList(species);
  } catch (e) {
    showToast('保存に失敗しました: ' + e.message, 'error');
  }
}

// ── 解析詳細表示 ─────────────────────────────────────────
async function openResultDetail(trialId) {
  openModal('resultDetailModal');
  document.getElementById('resultDetailBody').innerHTML =
    '<div class="loading-wrap"><div class="spinner"></div>読込中...</div>';

  const [analyses, trials] = await Promise.all([
    dbSelect('pal_analysis', { eq: { trial_id: trialId } }),
    dbSelect('pal_trials',   { eq: { id: trialId } }),
  ]);
  const a = analyses[0];
  const t = trials[0];

  if (!a) {
    document.getElementById('resultDetailBody').innerHTML =
      '<div class="empty-state"><p>統計解析結果がありません。「結果入力」から入力してください。</p></div>';
    return;
  }

  const winnerLabel = { A:'フード(A)が優位', B:'フード(B)が優位', tie:'引き分け', inconclusive:'判定不能' };

  document.getElementById('resultDetailBody').innerHTML = `
    <div class="stat-result-card">
      <div class="stat-winner">${winnerLabel[a.winner] || a.winner || '-'}</div>
      <div class="pref-display">
        <div class="pref-block side-a">
          <div class="pref-label">採食比(%)_フードA</div>
          <div class="pref-value">${fmtPct(a.mean_a_ratio_avg)}</div>
          <div class="pref-label">中央値: ${fmtPct(a.median_a_ratio_avg)}</div>
        </div>
        <div class="pref-block side-b">
          <div class="pref-label">採食比(%)_フードB</div>
          <div class="pref-value">${fmtPct(a.mean_b_ratio_avg)}</div>
          <div class="pref-label">中央値: ${fmtPct(a.median_b_ratio_avg)}</div>
        </div>
      </div>
    </div>

    <table class="data-table">
      <tr><th>総数</th><td>${a.n_total??'-'} （試験参加頭数）</td></tr>
      <tr><th>解析頭数</th><td>${a.n_used??'-'} （統計解析に用いた頭数）</td></tr>
      <tr><th>使用した検定</th><td>${a.stat_test_used==='t-test'?'T検定（対応あり）':a.stat_test_used==='wilcoxon'?'ウィルコクソン符号順位和検定':a.stat_test_used||'-'}</td></tr>
      <tr><th>有意差判定</th><td><strong>${a.p_value_category||'-'}</strong></td></tr>
      <tr><th>効果量</th><td>${escHtml(a.effect_size_method||'-')} = ${a.effect_size_value!=null?fmtNum(a.effect_size_value,3):'-'} (${escHtml(a.effect_size_label||'-')})</td></tr>
      <tr><th>結論</th><td style="font-size:12px">${escHtml(a.conclusion||'')}</td></tr>
      <tr><th>入力日時</th><td style="font-size:12px">${a.computed_at?new Date(a.computed_at).toLocaleString('ja-JP'):''}</td></tr>
    </table>

    <div style="margin-top:12px">
      <button class="btn btn-secondary btn-sm" onclick="closeModal('resultDetailModal');openResultEdit('${trialId}')">編集</button>
    </div>
  `;
}
