// ============================================================
// 試験計画セクション
// ============================================================

let _trialSortKey  = 'trial_date_start';
let _trialSortAsc  = false;
let _trialSpecies  = 'cat';
let _trialLocation = 'R';
let _editTrialId   = null;
let _trialsList    = [];   // 現在表示中の試験一覧
let _ingredientEditors = {}; // { 'A': [...rows], 'B': [...rows] }

// ── 試験計画 メイン描画 ──────────────────────────────────
async function renderTrialPlan(species, location) {
  _trialSpecies  = species;
  _trialLocation = location;

  const locLabel = locationLabel(species, location);
  const spLabel  = species === 'cat' ? '猫' : '犬';
  setTitle(`試験計画 ${locLabel} (${spLabel})`);

  loading();

  const [trials, ingredients] = await Promise.all([
    dbSelect('pal_trials', {
      eq: { species, location },
      order: { col: _trialSortKey, asc: _trialSortAsc }
    }),
    dbSelect('pal_trial_ingredients', { order: { col: 'sort_order', asc: true } })
  ]);

  _trialsList = trials;

  // 試験ごとに内訳をグループ化
  const ingMap = {};
  ingredients.forEach(ing => {
    if (!ingMap[ing.trial_id]) ingMap[ing.trial_id] = { A: [], B: [] };
    ingMap[ing.trial_id][ing.side].push(ing);
  });

  const html = `
    <div class="sort-bar">
      <label>ソート:</label>
      ${sortBtn('trial_date_start','試験日')}
      ${sortBtn('purpose','目的')}
      ${sortBtn('notes','備考')}
      ${sortBtn('supplier','サプライヤー')}
      <div style="flex:1"></div>
      <button class="btn btn-primary btn-sm" onclick="openTrialModal()">＋ 新規試験登録</button>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">試験一覧</span>
        <span style="font-size:12px;color:var(--gray-400)">${trials.length} 件</span>
      </div>
      <div class="table-wrap">
        <table class="data-table" id="trialTable">
          <thead>
            <tr>
              <th>試験日</th>
              <th>種別</th>
              <th>〇 レシピ / 内訳</th>
              <th>〇重量</th>
              <th>● レシピ / 内訳</th>
              <th>●重量</th>
              <th>担当者</th>
              <th>目的</th>
              <th>備考</th>
              <th>頭数</th>
              <th>選択率</th>
              <th>状態</th>
              <th style="width:120px"></th>
            </tr>
          </thead>
          <tbody>
            ${trials.length === 0 ? `<tr><td colspan="13" style="text-align:center;color:var(--gray-400);padding:32px">登録された試験はありません</td></tr>` :
              trials.map(t => renderTrialRows(t, ingMap[t.id] || { A:[], B:[] })).join('')
            }
          </tbody>
        </table>
      </div>
    </div>

    ${renderTrialModal()}
    ${renderIngredientSearchModal()}
  `;

  setContent(html);
}

// ── 試験行 HTML (概要行 + 内訳行) ───────────────────────
function renderTrialRows(t, ings) {
  const hasA = ings.A.length > 0;
  const hasB = ings.B.length > 0;
  const maxRows = Math.max(ings.A.length, ings.B.length, 1);

  const rows = [];

  // 概要行
  rows.push(`
    <tr class="trial-row-summary" data-trial-id="${t.id}">
      <td style="white-space:nowrap;font-weight:700">${escHtml(t.trial_date_label || formatDate(t.trial_date_start))}</td>
      <td>${escHtml(foodTypeLabel(t.food_type))}</td>
      <td style="max-width:180px">${escHtml(t.food_a_overview || '-')}</td>
      <td style="text-align:right">${t.food_a_weight_total_g != null ? fmtNum(t.food_a_weight_total_g,0)+'g' : '-'}</td>
      <td style="max-width:180px">${escHtml(t.food_b_overview || '-')}</td>
      <td style="text-align:right">${t.food_b_weight_total_g != null ? fmtNum(t.food_b_weight_total_g,0)+'g' : '-'}</td>
      <td>${escHtml(t.person_in_charge || '')}</td>
      <td>${escHtml(t.purpose || '')}</td>
      <td style="max-width:120px;font-size:11px">${escHtml(t.notes || '')}</td>
      <td style="text-align:center">${t.animal_count ?? '-'}</td>
      <td>${prefBar(t.preference_rate_a, t.preference_rate_b)}</td>
      <td>${statusBadge(t.status || '計画中')}</td>
      <td class="col-actions">
        <button class="btn btn-sm btn-secondary" onclick="openTrialModal('${t.id}')">編集</button>
        <button class="btn btn-sm btn-success" onclick="openPrepSheet('${t.id}')">調製</button>
        <button class="btn btn-sm btn-danger" onclick="deleteTrial('${t.id}')">削除</button>
      </td>
    </tr>`);

  // 内訳行 (A/B を並べる)
  for (let i = 0; i < maxRows; i++) {
    const a = ings.A[i];
    const b = ings.B[i];
    rows.push(`
      <tr class="trial-row-ingredient">
        <td></td>
        <td></td>
        <td style="padding-left:28px">
          ${a ? `<span class="side-badge side-a">○</span> ${escHtml(a.recipe_name || '')}${a.material_no ? ` <span style="font-size:10px;color:var(--gray-400)">(${escHtml(a.material_no)})</span>` : ''}` : ''}
        </td>
        <td style="text-align:right;font-size:12px">
          ${a ? `${a.blend_rate != null ? fmtNum(a.blend_rate,1)+'%' : ''} / ${a.weight_g != null ? fmtNum(a.weight_g,0)+'g' : ''}` : ''}
        </td>
        <td style="padding-left:28px">
          ${b ? `<span class="side-badge side-b">●</span> ${escHtml(b.recipe_name || '')}${b.material_no ? ` <span style="font-size:10px;color:var(--gray-400)">(${escHtml(b.material_no)})</span>` : ''}` : ''}
        </td>
        <td style="text-align:right;font-size:12px">
          ${b ? `${b.blend_rate != null ? fmtNum(b.blend_rate,1)+'%' : ''} / ${b.weight_g != null ? fmtNum(b.weight_g,0)+'g' : ''}` : ''}
        </td>
        <td></td><td></td><td></td><td></td><td></td><td></td><td></td>
      </tr>`);
  }

  return rows.join('');
}

// ── ソートボタン ─────────────────────────────────────────
function sortBtn(key, label) {
  const active = _trialSortKey === key;
  const arrow  = active ? (_trialSortAsc ? ' ↑' : ' ↓') : '';
  return `<button class="sort-btn${active?' active':''}" onclick="sortTrials('${key}')">${label}${arrow}</button>`;
}

async function sortTrials(key) {
  if (_trialSortKey === key) _trialSortAsc = !_trialSortAsc;
  else { _trialSortKey = key; _trialSortAsc = true; }
  await renderTrialPlan(_trialSpecies, _trialLocation);
}

// ── 試験モーダル ─────────────────────────────────────────
function renderTrialModal() {
  return `
  <div class="modal-overlay" id="trialModal">
    <div class="modal-box modal-xl">
      <div class="modal-header">
        <span class="modal-title" id="trialModalTitle">試験を登録</span>
        <button class="modal-close" onclick="closeModal('trialModal')">✕</button>
      </div>
      <div class="modal-body">
        <!-- 基本情報 -->
        <div class="form-grid form-grid-3" style="margin-bottom:16px">
          <div class="form-group">
            <label>試験日（表示用）<span style="color:red">*</span></label>
            <input class="form-control" id="t-date-label" placeholder="例: 20240528-29">
          </div>
          <div class="form-group">
            <label>開始日</label>
            <input type="date" class="form-control" id="t-date-start">
          </div>
          <div class="form-group">
            <label>終了日</label>
            <input type="date" class="form-control" id="t-date-end">
          </div>
          <div class="form-group">
            <label>種別<span style="color:red">*</span></label>
            <select class="form-control" id="t-food-type">
              <option value="dry">ドライ</option>
              <option value="wet">ウェット</option>
            </select>
          </div>
          <div class="form-group">
            <label>試験担当者</label>
            <input class="form-control" id="t-person" placeholder="担当者名">
          </div>
          <div class="form-group">
            <label>サプライヤー</label>
            <input class="form-control" id="t-supplier" placeholder="サプライヤー名" list="supplier-list">
            <datalist id="supplier-list"></datalist>
          </div>
          <div class="form-group">
            <label>目的</label>
            <input class="form-control" id="t-purpose" placeholder="例: 25春メディファス" list="purpose-list">
            <datalist id="purpose-list"></datalist>
          </div>
          <div class="form-group">
            <label>試験頭数</label>
            <input type="number" class="form-control" id="t-animal-count" min="1">
          </div>
          <div class="form-group">
            <label>ステータス</label>
            <select class="form-control" id="t-status">
              <option>計画中</option><option>進行中</option><option>完了</option><option>中止</option>
            </select>
          </div>
        </div>
        <div class="form-group" style="margin-bottom:16px">
          <label>備考</label>
          <textarea class="form-control" id="t-notes" rows="2"></textarea>
        </div>

        <!-- 内訳エディタ -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div>
            <div style="font-weight:700;margin-bottom:8px">
              <span class="side-badge side-a">○</span> フード A の内訳
              <span id="t-a-total" style="font-size:11px;color:var(--gray-400);margin-left:8px"></span>
            </div>
            <div class="ingredient-editor" id="ing-editor-A"></div>
            <button class="btn-add-row" onclick="addIngredientRow('A')">＋ 行を追加</button>
          </div>
          <div>
            <div style="font-weight:700;margin-bottom:8px">
              <span class="side-badge side-b">●</span> フード B の内訳
              <span id="t-b-total" style="font-size:11px;color:var(--gray-400);margin-left:8px"></span>
            </div>
            <div class="ingredient-editor" id="ing-editor-B"></div>
            <button class="btn-add-row" onclick="addIngredientRow('B')">＋ 行を追加</button>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('trialModal')">キャンセル</button>
        <button class="btn btn-primary" onclick="saveTrial()">保存</button>
      </div>
    </div>
  </div>`;
}

function renderIngredientSearchModal() {
  return `
  <div class="modal-overlay" id="ingSearchModal">
    <div class="modal-box">
      <div class="modal-header">
        <span class="modal-title">原料を検索</span>
        <button class="modal-close" onclick="closeModal('ingSearchModal')">✕</button>
      </div>
      <div class="modal-body">
        <input class="form-control" id="ingSearchInput" placeholder="原料No. または原料名で検索" oninput="filterIngSearch()">
        <div style="margin-top:10px;max-height:320px;overflow-y:auto" id="ingSearchResults"></div>
      </div>
    </div>
  </div>`;
}

// ── モーダル開閉 / データ読み込み ─────────────────────────
let _ingSearchCallback = null;

async function openTrialModal(id = null) {
  _editTrialId = id;
  document.getElementById('trialModalTitle').textContent = id ? '試験を編集' : '試験を登録';

  // 選択肢を datalist にセット
  await fillDatalistFromDropdown('supplier-list', 'サプライヤー');
  await fillDatalistFromDropdown('purpose-list', '試験区分');

  _ingredientEditors = { A: [], B: [] };

  if (id) {
    // 既存データ読み込み
    const [trials, ings] = await Promise.all([
      dbSelect('pal_trials', { eq: { id } }),
      dbSelect('pal_trial_ingredients', { eq: { trial_id: id }, order: { col: 'sort_order', asc: true } })
    ]);
    const t = trials[0];
    if (!t) return;

    document.getElementById('t-date-label').value    = t.trial_date_label || '';
    document.getElementById('t-date-start').value    = t.trial_date_start || '';
    document.getElementById('t-date-end').value      = t.trial_date_end   || '';
    document.getElementById('t-food-type').value     = t.food_type        || 'dry';
    document.getElementById('t-person').value        = t.person_in_charge || '';
    document.getElementById('t-supplier').value      = t.supplier         || '';
    document.getElementById('t-purpose').value       = t.purpose          || '';
    document.getElementById('t-notes').value         = t.notes            || '';
    document.getElementById('t-animal-count').value  = t.animal_count     || '';
    document.getElementById('t-status').value        = t.status           || '計画中';

    _ingredientEditors.A = ings.filter(i => i.side === 'A').map(i => ({ ...i }));
    _ingredientEditors.B = ings.filter(i => i.side === 'B').map(i => ({ ...i }));
  } else {
    document.getElementById('t-date-label').value    = '';
    document.getElementById('t-date-start').value    = '';
    document.getElementById('t-date-end').value      = '';
    document.getElementById('t-food-type').value     = 'dry';
    document.getElementById('t-person').value        = '';
    document.getElementById('t-supplier').value      = '';
    document.getElementById('t-purpose').value       = '';
    document.getElementById('t-notes').value         = '';
    document.getElementById('t-animal-count').value  = '';
    document.getElementById('t-status').value        = '計画中';
    _ingredientEditors = { A: [newIngRow()], B: [newIngRow()] };
  }

  renderIngEditors();
  openModal('trialModal');
}

function newIngRow() {
  return { _id: Math.random().toString(36).slice(2), material_no: '', recipe_name: '', blend_rate: '', weight_g: '', sort_order: 0 };
}

// ── 内訳エディタ描画 ─────────────────────────────────────
function renderIngEditors() {
  ['A','B'].forEach(side => {
    const wrap = document.getElementById(`ing-editor-${side}`);
    if (!wrap) return;
    wrap.innerHTML = _ingredientEditors[side].map((row, idx) => `
      <div class="ingredient-row" id="ing-row-${side}-${row._id || idx}">
        <div style="display:flex;gap:4px">
          <input class="table-input" style="width:70px" placeholder="原料No."
            value="${escHtml(row.material_no || '')}"
            oninput="updateIngField('${side}','${row._id || idx}','material_no',this.value)">
          <button class="btn btn-xs btn-secondary" onclick="openIngSearch('${side}','${row._id || idx}')" title="検索">🔍</button>
        </div>
        <input class="table-input" placeholder="レシピ名（手打ちも可）"
          value="${escHtml(row.recipe_name || '')}"
          oninput="updateIngField('${side}','${row._id || idx}','recipe_name',this.value)">
        <input class="table-input" type="number" placeholder="配合%" step="0.1"
          value="${row.blend_rate ?? ''}"
          oninput="updateIngField('${side}','${row._id || idx}','blend_rate',parseFloat(this.value)||null);calcIngTotal('${side}')">
        <input class="table-input" type="number" placeholder="重量g" step="1"
          value="${row.weight_g ?? ''}"
          oninput="updateIngField('${side}','${row._id || idx}','weight_g',parseFloat(this.value)||null);calcIngTotal('${side}')">
        <button class="btn-remove-row" onclick="removeIngRow('${side}','${row._id || idx}')">✕</button>
      </div>`).join('');
    calcIngTotal(side);
  });
}

function addIngredientRow(side) {
  _ingredientEditors[side].push(newIngRow());
  renderIngEditors();
}

function removeIngRow(side, rid) {
  _ingredientEditors[side] = _ingredientEditors[side].filter(r => (r._id || '') !== rid);
  renderIngEditors();
}

function updateIngField(side, rid, field, val) {
  const row = _ingredientEditors[side].find(r => (r._id || '') === rid);
  if (row) row[field] = val;
}

function calcIngTotal(side) {
  const rows = _ingredientEditors[side];
  const totalPct = rows.reduce((s, r) => s + (Number(r.blend_rate) || 0), 0);
  const totalG   = rows.reduce((s, r) => s + (Number(r.weight_g)   || 0), 0);
  const el = document.getElementById(`t-${side.toLowerCase()}-total`);
  if (el) el.textContent = `合計: ${totalPct.toFixed(1)}% / ${totalG.toFixed(0)}g`;
}

// ── 原料検索 ─────────────────────────────────────────────
let _ingSearchSide = null;
let _ingSearchRid  = null;
let _allMaterials  = [];

async function openIngSearch(side, rid) {
  _ingSearchSide = side;
  _ingSearchRid  = rid;
  _allMaterials  = await getMaterials();
  document.getElementById('ingSearchInput').value = '';
  filterIngSearch();
  openModal('ingSearchModal');
}

function filterIngSearch() {
  const q = document.getElementById('ingSearchInput').value.toLowerCase();
  const results = _allMaterials.filter(m =>
    (m.material_no || '').toLowerCase().includes(q) ||
    (m.name || '').toLowerCase().includes(q)
  ).slice(0, 50);

  document.getElementById('ingSearchResults').innerHTML = results.length === 0
    ? '<p style="color:var(--gray-400);font-size:13px;padding:12px">見つかりませんでした</p>'
    : results.map(m => `
        <div onclick="selectMaterial('${escHtml(m.material_no || '')}','${escHtml(m.name || '')}')"
          style="padding:8px 10px;border-bottom:1px solid var(--gray-100);cursor:pointer;font-size:13px;"
          onmouseover="this.style.background='var(--gray-50)'" onmouseout="this.style.background=''">
          <strong>${escHtml(m.material_no || '')}</strong>
          <span style="margin-left:8px">${escHtml(m.name || '')}</span>
          ${materialStatusBadge(m.status)}
        </div>`).join('');
}

function selectMaterial(no, name) {
  const row = _ingredientEditors[_ingSearchSide].find(r => (r._id || '') === _ingSearchRid);
  if (row) { row.material_no = no; row.recipe_name = name; }
  renderIngEditors();
  closeModal('ingSearchModal');
}

// ── 保存 ─────────────────────────────────────────────────
async function saveTrial() {
  const dateLabel = document.getElementById('t-date-label').value.trim();
  if (!dateLabel) { showToast('試験日（表示用）は必須です', 'error'); return; }

  const allIngA = _ingredientEditors.A;
  const allIngB = _ingredientEditors.B;

  // 概要行の自動計算
  const overviewA = allIngA.find(r => r.recipe_name)?.recipe_name || '';
  const overviewB = allIngB.find(r => r.recipe_name)?.recipe_name || '';
  const totalGa   = allIngA.reduce((s,r) => s + (Number(r.weight_g) || 0), 0) || null;
  const totalGb   = allIngB.reduce((s,r) => s + (Number(r.weight_g) || 0), 0) || null;

  const trialData = {
    species:               _trialSpecies,
    location:              _trialLocation,
    food_type:             document.getElementById('t-food-type').value,
    trial_date_label:      dateLabel,
    trial_date_start:      document.getElementById('t-date-start').value  || null,
    trial_date_end:        document.getElementById('t-date-end').value    || null,
    person_in_charge:      document.getElementById('t-person').value.trim()   || null,
    supplier:              document.getElementById('t-supplier').value.trim() || null,
    purpose:               document.getElementById('t-purpose').value.trim()  || null,
    notes:                 document.getElementById('t-notes').value.trim()    || null,
    animal_count:          parseInt(document.getElementById('t-animal-count').value) || null,
    status:                document.getElementById('t-status').value,
    food_a_overview:       overviewA || null,
    food_b_overview:       overviewB || null,
    food_a_weight_total_g: totalGa,
    food_b_weight_total_g: totalGb,
  };

  try {
    let trialId;
    if (_editTrialId) {
      await dbUpdate('pal_trials', _editTrialId, trialData);
      trialId = _editTrialId;
      // 内訳を一旦削除して再挿入
      await sb.from('pal_trial_ingredients').delete().eq('trial_id', trialId);
    } else {
      const res = await dbInsert('pal_trials', [trialData]);
      trialId = res[0].id;
    }

    // 内訳行を保存
    const ingRows = [];
    ['A','B'].forEach(side => {
      _ingredientEditors[side].forEach((row, idx) => {
        if (!row.recipe_name && !row.material_no) return;
        ingRows.push({
          trial_id:    trialId,
          side,
          material_no: row.material_no || null,
          recipe_name: row.recipe_name || null,
          blend_rate:  row.blend_rate  || null,
          weight_g:    row.weight_g    || null,
          sort_order:  idx,
        });
      });
    });
    if (ingRows.length > 0) await dbInsert('pal_trial_ingredients', ingRows);

    showToast('保存しました', 'success');
    closeModal('trialModal');
    await renderTrialPlan(_trialSpecies, _trialLocation);
  } catch (e) {
    console.error(e);
    showToast('保存に失敗しました: ' + e.message, 'error');
  }
}

// ── 削除 ─────────────────────────────────────────────────
async function deleteTrial(id) {
  if (!confirm('この試験（内訳・結果を含む）を削除しますか？')) return;
  try {
    await dbDelete('pal_trials', id);
    showToast('削除しました', 'success');
    await renderTrialPlan(_trialSpecies, _trialLocation);
  } catch (e) {
    showToast('削除に失敗しました: ' + e.message, 'error');
  }
}

// ── datalist 補完 ─────────────────────────────────────────
async function fillDatalistFromDropdown(listId, category) {
  const opts = await getDropdowns(category);
  const dl = document.getElementById(listId);
  if (dl) dl.innerHTML = opts.map(o => `<option value="${escHtml(o.value)}">`).join('');
}
