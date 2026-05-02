// ============================================================
// 試験結果入力・統計解析・結果一覧
// ============================================================

let _resTrialId  = null;
let _resTrial    = null;
let _resSpecies  = 'cat';

// ── 結果一覧 (トップレベルメニュー) ──────────────────────
async function renderResultList(species) {
  _resSpecies = species;
  const spLabel = species === 'cat' ? '猫' : '犬';
  setTitle(`結果一覧 (${spLabel})`);
  loading();

  const [columns, allTrials, analyses] = await Promise.all([
    dbSelect('result_list_columns', { eq: { species }, order: { col: 'sort_order', asc: true } }),
    dbSelect('pal_trials', { eq: { species }, order: { col: 'trial_date_start', asc: false } }),
    dbSelect('pal_analysis', { eq: { species }, order: { col: 'computed_at', asc: false } }),
  ]);

  const visibleCols = columns.filter(c => c.visible);
  const analysisMap = {};
  analyses.forEach(a => { if (!analysisMap[a.trial_id]) analysisMap[a.trial_id] = a; });

  const html = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
      <span style="font-size:13px;font-weight:600">${allTrials.length} 試験</span>
      <div style="flex:1"></div>
      <button class="btn btn-secondary btn-sm" onclick="renderResultColumns()">📋 表示列設定</button>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              ${visibleCols.map(c => `<th>${escHtml(c.label)}</th>`).join('')}
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${allTrials.map(t => {
              const a = analysisMap[t.id] || {};
              return `<tr>
                ${visibleCols.map(c => `<td>${renderResultCell(c.column_key, t, a)}</td>`).join('')}
                <td class="col-actions">
                  <button class="btn btn-xs btn-secondary" onclick="openResultEntry('${t.id}')">結果入力</button>
                  ${a.id ? `<button class="btn btn-xs btn-success" onclick="openResultDetail('${t.id}')">解析詳細</button>` : ''}
                </td>
              </tr>`;
            }).join('') || `<tr><td colspan="${visibleCols.length+1}" style="text-align:center;color:var(--gray-400);padding:32px">データがありません</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>

    ${renderResultEntryModal()}
    ${renderResultDetailModal()}
  `;

  setContent(html);
}

// ── 結果セル値の描画 ─────────────────────────────────────
function renderResultCell(key, trial, analysis) {
  switch (key) {
    case 'trial_date_label':   return escHtml(trial.trial_date_label || formatDate(trial.trial_date_start));
    case 'location':           return escHtml(locationLabel(trial.species, trial.location));
    case 'food_type':          return escHtml(foodTypeLabel(trial.food_type));
    case 'purpose':            return escHtml(trial.purpose || '');
    case 'supplier':           return escHtml(trial.supplier || '');
    case 'food_a_overview':    return `<span style="color:#1d4ed8">○</span> ${escHtml(trial.food_a_overview||'')}`;
    case 'food_b_overview':    return `<span style="color:#b45309">●</span> ${escHtml(trial.food_b_overview||'')}`;
    case 'person_in_charge':   return escHtml(trial.person_in_charge || '');
    case 'status':             return statusBadge(trial.status || '計画中');
    case 'n_total':            return analysis.n_total ?? '-';
    case 'n_excluded':         return analysis.n_excluded ?? '-';
    case 'n_used':             return analysis.n_used ?? '-';
    case 'mean_a_ratio_avg':   return analysis.mean_a_ratio_avg != null ? `<span style="color:#1d4ed8;font-weight:700">${fmtPct(analysis.mean_a_ratio_avg)}</span>` : '-';
    case 'mean_b_ratio_avg':   return analysis.mean_b_ratio_avg != null ? `<span style="color:#b45309;font-weight:700">${fmtPct(analysis.mean_b_ratio_avg)}</span>` : '-';
    case 'median_a_ratio_avg': return fmtPct(analysis.median_a_ratio_avg);
    case 'median_b_ratio_avg': return fmtPct(analysis.median_b_ratio_avg);
    case 'stat_test_used':     return escHtml(analysis.stat_test_used || '-');
    case 'p_value':            return analysis.p_value != null ? fmtNum(analysis.p_value, 4) : '-';
    case 'is_significant':
      if (analysis.is_significant == null) return '-';
      return analysis.is_significant
        ? '<span style="color:var(--success);font-weight:700">有意差あり</span>'
        : '<span style="color:var(--gray-400)">n.s.</span>';
    case 'effect_size_value':  return analysis.effect_size_value != null ? fmtNum(analysis.effect_size_value, 3) : '-';
    case 'effect_size_label':  return escHtml(analysis.effect_size_label || '-');
    case 'winner':
      if (!analysis.winner) return '-';
      const winnerMap = { A: '<span style="color:#1d4ed8;font-weight:700">○ 勝</span>', B: '<span style="color:#b45309;font-weight:700">● 勝</span>', tie: '引き分け', inconclusive: '判定不能' };
      return winnerMap[analysis.winner] || analysis.winner;
    default: return '';
  }
}

// ── 結果入力モーダル ─────────────────────────────────────
function renderResultEntryModal() {
  return `
  <div class="modal-overlay" id="resultEntryModal">
    <div class="modal-box modal-xl">
      <div class="modal-header">
        <span class="modal-title" id="resultEntryTitle">結果入力</span>
        <button class="modal-close" onclick="closeModal('resultEntryModal')">✕</button>
      </div>
      <div class="modal-body" id="resultEntryBody">
        <div class="loading-wrap"><div class="spinner"></div>読込中...</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('resultEntryModal')">キャンセル</button>
        <button class="btn btn-primary" onclick="saveResults()">保存</button>
        <button class="btn btn-success" onclick="saveAndAnalyze()">保存して統計解析を実行</button>
      </div>
    </div>
  </div>`;
}

function renderResultDetailModal() {
  return `
  <div class="modal-overlay" id="resultDetailModal">
    <div class="modal-box modal-lg">
      <div class="modal-header">
        <span class="modal-title">統計解析結果</span>
        <button class="modal-close" onclick="closeModal('resultDetailModal')">✕</button>
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

// ── 結果入力フォーム ─────────────────────────────────────
async function openResultEntry(trialId) {
  _resTrialId = trialId;
  openModal('resultEntryModal');
  document.getElementById('resultEntryBody').innerHTML =
    '<div class="loading-wrap"><div class="spinner"></div>読込中...</div>';

  const [trials, palAnimals, existingResults] = await Promise.all([
    dbSelect('pal_trials',        { eq: { id: trialId } }),
    dbSelect('pal_trial_animals', { eq: { trial_id: trialId }, order: { col: 'sort_order', asc: true } }),
    dbSelect('pal_results',       { eq: { trial_id: trialId } }),
  ]);

  _resTrial = trials[0];
  if (!_resTrial) return;
  document.getElementById('resultEntryTitle').textContent =
    `結果入力: ${_resTrial.trial_date_label||''} ${foodTypeLabel(_resTrial.food_type)}`;

  const resultMap = {};
  existingResults.forEach(r => { resultMap[r.animal_id || r.animal_name] = r; });

  const foodType = _resTrial.food_type;
  const isWet    = foodType === 'wet';

  const animalRows = palAnimals.length > 0 ? palAnimals : [];

  const header = isWet ? `
    <tr>
      <th rowspan="2">No.</th><th rowspan="2">個体名</th><th rowspan="2">給与量(g)</th>
      <th colspan="4">1回目 (○先)</th>
      <th colspan="4">2回目 (●先)</th>
      <th rowspan="2">除外</th>
    </tr>
    <tr>
      <th>○総量</th><th>○残餌</th><th>●総量</th><th>●残餌</th>
      <th>●総量</th><th>●残餌</th><th>○総量</th><th>○残餌</th>
    </tr>` : `
    <tr>
      <th>No.</th><th>個体名</th><th>給与量(g)</th>
      <th>1回目 ○残餌(g)</th><th>1回目 ●残餌(g)</th>
      <th>2回目 ●残餌(g)</th><th>2回目 ○残餌(g)</th>
      <th>除外</th>
    </tr>`;

  const rows = animalRows.map((pa, i) => {
    const key = pa.animal_id || pa.animal_name;
    const r   = resultMap[key] || {};
    const name = pa.animal_name || '';

    if (isWet) {
      return `<tr>
        <td>${i+1}</td>
        <td>${escHtml(name)}</td>
        <td>${pa.food_given_g ?? ''}</td>
        <td><input class="table-input" type="number" style="width:60px" data-field="total_a_1st" data-idx="${i}" value="${r.total_a_1st ?? ''}"></td>
        <td><input class="table-input" type="number" style="width:60px" data-field="remaining_a_1st" data-idx="${i}" value="${r.remaining_a_1st ?? ''}"></td>
        <td><input class="table-input" type="number" style="width:60px" data-field="total_b_1st" data-idx="${i}" value="${r.total_b_1st ?? ''}"></td>
        <td><input class="table-input" type="number" style="width:60px" data-field="remaining_b_1st" data-idx="${i}" value="${r.remaining_b_1st ?? ''}"></td>
        <td><input class="table-input" type="number" style="width:60px" data-field="total_b_2nd" data-idx="${i}" value="${r.total_b_2nd ?? ''}"></td>
        <td><input class="table-input" type="number" style="width:60px" data-field="remaining_b_2nd" data-idx="${i}" value="${r.remaining_b_2nd ?? ''}"></td>
        <td><input class="table-input" type="number" style="width:60px" data-field="total_a_2nd" data-idx="${i}" value="${r.total_a_2nd ?? ''}"></td>
        <td><input class="table-input" type="number" style="width:60px" data-field="remaining_a_2nd" data-idx="${i}" value="${r.remaining_a_2nd ?? ''}"></td>
        <td style="text-align:center">
          <input type="checkbox" data-field="excluded" data-idx="${i}" ${r.excluded ? 'checked' : ''}>
        </td>
      </tr>`;
    } else {
      return `<tr>
        <td>${i+1}</td>
        <td>${escHtml(name)}</td>
        <td>${pa.food_given_g ?? ''}</td>
        <td><input class="table-input" type="number" style="width:70px" data-field="remaining_a_1st" data-idx="${i}" value="${r.remaining_a_1st ?? ''}"></td>
        <td><input class="table-input" type="number" style="width:70px" data-field="remaining_b_1st" data-idx="${i}" value="${r.remaining_b_1st ?? ''}"></td>
        <td><input class="table-input" type="number" style="width:70px" data-field="remaining_b_2nd" data-idx="${i}" value="${r.remaining_b_2nd ?? ''}"></td>
        <td><input class="table-input" type="number" style="width:70px" data-field="remaining_a_2nd" data-idx="${i}" value="${r.remaining_a_2nd ?? ''}"></td>
        <td style="text-align:center">
          <input type="checkbox" data-field="excluded" data-idx="${i}" ${r.excluded ? 'checked' : ''}>
        </td>
      </tr>`;
    }
  }).join('');

  document.getElementById('resultEntryBody').innerHTML = `
    <p style="font-size:12px;color:var(--gray-500);margin-bottom:10px">
      ○=フードA（1回目先）/ ●=フードB （2回目先）<br>
      ウェット: 残餌 = 総量 - 風袋 は自動計算します
    </p>
    <div class="table-wrap">
      <table class="data-table" id="resultTable">
        <thead>${header}</thead>
        <tbody>${rows || '<tr><td colspan="12" style="text-align:center;color:var(--gray-400)">個体が登録されていません（調製用紙から個体を登録してください）</td></tr>'}</tbody>
      </table>
    </div>
  `;

  // 保存対象を記録
  window._resultPalAnimals = animalRows;
  window._resultExistingMap = resultMap;
}

function collectResultRows() {
  const table    = document.getElementById('resultTable');
  const rows     = [];
  const palAnims = window._resultPalAnimals || [];

  palAnims.forEach((pa, idx) => {
    const cells = table.querySelectorAll(`[data-idx="${idx}"]`);
    const row   = { animal_id: pa.animal_id || null, animal_name: pa.animal_name || null };
    cells.forEach(c => {
      const f = c.dataset.field;
      row[f] = c.type === 'checkbox' ? c.checked : (c.value !== '' ? parseFloat(c.value) : null);
    });
    rows.push(row);
  });
  return rows;
}

async function saveResults() {
  if (!_resTrialId) return;
  try {
    const rows = collectResultRows();
    // Upsert: trial_id + animal_id でユニーク
    await sb.from('pal_results').delete().eq('trial_id', _resTrialId);
    const inserts = rows.map(r => ({ ...r, trial_id: _resTrialId }));
    if (inserts.length > 0) await dbInsert('pal_results', inserts);
    showToast('結果を保存しました', 'success');
  } catch (e) {
    showToast('保存に失敗しました: ' + e.message, 'error');
  }
}

async function saveAndAnalyze() {
  await saveResults();
  await runStatAnalysis(_resTrialId, _resTrial?.species || _resSpecies);
}

// ── 統計解析の実行 (Netlify Function: stats.py を呼ぶ) ───
async function runStatAnalysis(trialId, species) {
  showToast('統計解析を実行中...', 'info');
  try {
    const response = await fetch('/.netlify/functions/stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trial_id: trialId, species }),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText);
    }
    const result = await response.json();
    showToast('統計解析が完了しました', 'success');
    closeModal('resultEntryModal');
    await renderResultList(species);
    return result;
  } catch (e) {
    showToast('統計解析に失敗しました: ' + e.message, 'error');
    console.error(e);
  }
}

// ── 解析詳細表示 ─────────────────────────────────────────
async function openResultDetail(trialId) {
  openModal('resultDetailModal');
  document.getElementById('resultDetailBody').innerHTML =
    '<div class="loading-wrap"><div class="spinner"></div>読込中...</div>';

  const [analyses, trials] = await Promise.all([
    dbSelect('pal_analysis', { eq: { trial_id: trialId }, order: { col: 'computed_at', asc: false } }),
    dbSelect('pal_trials', { eq: { id: trialId } }),
  ]);
  const a = analyses[0];
  const t = trials[0];
  if (!a) {
    document.getElementById('resultDetailBody').innerHTML =
      '<div class="empty-state"><p>統計解析結果がありません</p></div>';
    return;
  }

  const winnerLabel = { A:'○フード(A)が優位', B:'●フード(B)が優位', tie:'引き分け', inconclusive:'判定不能' };

  document.getElementById('resultDetailBody').innerHTML = `
    <div class="stat-result-card">
      <div class="stat-winner">${winnerLabel[a.winner] || '-'}</div>
      <div class="pref-display">
        <div class="pref-block side-a">
          <div class="pref-label">○ フードA 平均選択率</div>
          <div class="pref-value">${fmtPct(a.mean_a_ratio_avg)}</div>
          <div class="pref-label">中央値: ${fmtPct(a.median_a_ratio_avg)}</div>
        </div>
        <div class="pref-block side-b">
          <div class="pref-label">● フードB 平均選択率</div>
          <div class="pref-value">${fmtPct(a.mean_b_ratio_avg)}</div>
          <div class="pref-label">中央値: ${fmtPct(a.median_b_ratio_avg)}</div>
        </div>
      </div>
    </div>

    <table class="data-table">
      <tr><th>解析頭数</th><td>${a.n_used} / ${a.n_total} (除外: ${a.n_excluded})</td></tr>
      <tr><th>正規性検定</th><td>${a.normality_test} (A: p=${fmtNum(a.normality_p_a,4)}, B: p=${fmtNum(a.normality_p_b,4)})</td></tr>
      <tr><th>採用した検定</th><td>${a.stat_test_used === 't-test' ? 'T検定 (パラメトリック)' : 'ウィルコクソン符号順位和検定 (ノンパラメトリック)'}</td></tr>
      <tr><th>p値</th><td><strong>${fmtNum(a.p_value,4)}</strong> → ${a.is_significant ? '<span style="color:var(--success);font-weight:700">有意差あり</span>' : '<span style="color:var(--gray-400)">n.s. (有意差なし)</span>'}</td></tr>
      <tr><th>効果量</th><td>${a.effect_size_method} = ${fmtNum(a.effect_size_value,3)} (${a.effect_size_label})</td></tr>
      <tr><th>解析メモ</th><td style="font-size:12px">${escHtml(a.conclusion||'')}</td></tr>
      <tr><th>解析日時</th><td style="font-size:12px">${a.computed_at ? new Date(a.computed_at).toLocaleString('ja-JP') : ''}</td></tr>
    </table>

    <div style="margin-top:12px">
      <button class="btn btn-primary btn-sm" onclick="reRunAnalysis('${trialId}','${a.species}')">再解析</button>
    </div>
  `;
}

async function reRunAnalysis(trialId, species) {
  closeModal('resultDetailModal');
  await runStatAnalysis(trialId, species);
}
