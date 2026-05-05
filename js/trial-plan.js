// ============================================================
// 試験計画セクション
// ============================================================

let _trialSortKey      = 'trial_date_start';
let _trialSortAsc      = false;
let _trialSpecies      = 'cat';
let _trialLocation     = 'R';          // 現在表示中のタブ
let _editTrialId       = null;
let _trialsList        = [];
let _trialFilterState  = {};           // フィルタ状態
let _trialShowFilter   = false;        // フィルタパネル表示状態
let _trialShowColSel   = false;        // 列設定パネル表示状態
let _trialVisibleCols  = ['status','food_type','food_a','food_b','person','purpose'];  // デフォルト表示列
let _ingredientEditors = {};           // { A: [...], B: [...] }
let _trialTotalWeight  = { A: 0, B: 0 }; // 調製総重量

// 猫/犬それぞれのタブ定義
const TRIAL_TABS = {
  cat: [
    { location: 'R', label: '猫 R (RDC)' },
    { location: 'O', label: '猫 O (大阪)' },
  ],
  dog: [
    { location: '',  label: '犬 (RDC)' },
    { location: 'I', label: '犬 I (専門学校)' },
  ],
};

// ── メイン描画 ────────────────────────────────────────────
async function renderTrialPlan(species) {
  _trialSpecies = species;
  if (!_trialLocation && species === 'cat') _trialLocation = 'R';
  if (species === 'dog' && _trialLocation !== '' && _trialLocation !== 'I') _trialLocation = '';

  const spLabel = species === 'cat' ? '猫 試験計画' : '犬 試験計画';
  setTitle(spLabel);
  loading();
  await _renderTrialTab();
}

async function switchTrialTab(location) {
  _trialLocation = location;
  await _renderTrialTab();
}

async function _renderTrialTab() {
  const species  = _trialSpecies;
  const location = _trialLocation;
  const tabs     = TRIAL_TABS[species] || [];

  const [allTrials, locations] = await Promise.all([
    dbSelect('pal_trials', {
      eq:    { species, location },
      order: { col: 'trial_date_start', asc: false }
    }),
    getDropdowns('場所_' + species),
  ]);

  // フィルタを適用
  let trials = [...allTrials];
  const dateFrom = _trialFilterState.dateFrom || '';
  const dateTo   = _trialFilterState.dateTo || '';
  const keyword  = (_trialFilterState.keyword || '').toLowerCase();
  const statuses = _trialFilterState.statuses || [];
  const foodTypes = _trialFilterState.foodTypes || [];

  trials = trials.filter(t => {
    if (dateFrom && (t.trial_date_start||'') < dateFrom) return false;
    if (dateTo   && (t.trial_date_start||'') > dateTo)   return false;
    if (keyword  && !`${t.purpose||''} ${t.food_a_overview||''} ${t.food_b_overview||''} ${t.notes||''}`.toLowerCase().includes(keyword)) return false;
    if (statuses.length && !statuses.includes(t.status||'計画中')) return false;
    if (foodTypes.length && !foodTypes.includes(t.food_type)) return false;
    return true;
  });

  // ソート
  trials = trials.sort((a, b) => {
    const av = (a[_trialSortKey]||'').toString();
    const bv = (b[_trialSortKey]||'').toString();
    return _trialSortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  _trialsList = trials;

  // フィルタ値の収集
  const statusOpts   = [...new Set(allTrials.map(t=>t.status||'計画中'))].sort();
  const foodTypeOpts = [...new Set(allTrials.map(t=>t.food_type).filter(Boolean))].sort();

  const tabBar = `
    <div class="tab-bar" style="margin-bottom:0">
      ${tabs.map(t => `
        <button class="tab-btn${t.location===location?' active':''}"
          onclick="switchTrialTab('${escHtml(t.location)}')">${escHtml(t.label)}</button>
      `).join('')}
    </div>`;

  // コントロールバー：ボタンのみ表示（パネルは折りたたまれた状態）
  const controlBar = `
    <div class="panel-toggle-bar" style="margin-top:12px">
      <button class="panel-toggle-btn${_trialShowFilter?' active':''}" onclick="toggleTrialFilter()">
        フィルタ・ソート ${_trialShowFilter ? '▲' : '▼'}
      </button>
      <button class="panel-toggle-btn${_trialShowColSel?' active':''}" onclick="toggleTrialColSel()">
        表示列設定 ${_trialShowColSel ? '▲' : '▼'}
      </button>
      <div style="flex:1"></div>
      <button class="btn btn-primary btn-sm" onclick="openTrialModal()">+ 新規試験登録</button>
    </div>`;

  // フィルタ・ソートパネル
  const filterPanel = `
    <div id="trialFilterPanel" class="card" style="margin-top:12px;${_trialShowFilter?'':'display:none'}">
      <div class="card-body" style="padding:12px">
        <div class="form-grid form-grid-3" style="gap:10px;margin-bottom:10px">
          <div class="form-group">
            <label style="font-size:11px;font-weight:600">試験日（開始）</label>
            <input type="date" class="form-control" id="f-trial-date-from" value="${_trialFilterState.dateFrom||''}" onchange="applyTrialFilter()">
          </div>
          <div class="form-group">
            <label style="font-size:11px;font-weight:600">試験日（終了）</label>
            <input type="date" class="form-control" id="f-trial-date-to" value="${_trialFilterState.dateTo||''}" onchange="applyTrialFilter()">
          </div>
          <div class="form-group">
            <label style="font-size:11px;font-weight:600">キーワード</label>
            <input class="form-control" id="f-trial-keyword" placeholder="目的・レシピ等..." value="${escHtml(_trialFilterState.keyword||'')}" oninput="applyTrialFilter()">
          </div>
        </div>
        <div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:10px">
          <div>
            <label style="font-size:11px;font-weight:600;color:var(--gray-600);display:block;margin-bottom:4px">状態</label>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${statusOpts.map(s => `<label style="display:flex;align-items:center;gap:3px;font-size:12px;cursor:pointer"><input type="checkbox" value="${escHtml(s)}" class="f-trial-status" ${(_trialFilterState.statuses||[]).includes(s)?'checked':''} onchange="applyTrialFilter()">${escHtml(s)}</label>`).join('')}
            </div>
          </div>
          <div>
            <label style="font-size:11px;font-weight:600;color:var(--gray-600);display:block;margin-bottom:4px">種別</label>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${foodTypeOpts.map(ft => `<label style="display:flex;align-items:center;gap:3px;font-size:12px;cursor:pointer"><input type="checkbox" value="${escHtml(ft)}" class="f-trial-foodtype" ${(_trialFilterState.foodTypes||[]).includes(ft)?'checked':''} onchange="applyTrialFilter()">${foodTypeLabel(ft)}</label>`).join('')}
            </div>
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <label style="font-size:11px;font-weight:600">ソート:</label>
          ${sortBtn('trial_date_start','試験日')}
          ${sortBtn('purpose','目的')}
          ${sortBtn('supplier','サプライヤー')}
          <button class="btn btn-secondary btn-xs" onclick="clearTrialFilter()">リセット</button>
        </div>
      </div>
    </div>`;

  // 表示列設定パネル
  const allCols = ['status','food_type','food_a','food_b','person','purpose','notes','supplier','count'];
  const colLabels = { status:'状態', food_type:'種別', food_a:'フードA', food_b:'フードB', person:'担当者', purpose:'目的', notes:'備考', supplier:'サプライヤー', count:'頭数' };
  const colPanel = `
    <div id="trialColSelPanel" class="card" style="margin-top:12px;${_trialShowColSel?'':'display:none'}">
      <div class="card-body" style="padding:12px">
        <label style="font-size:11px;font-weight:600;color:var(--gray-600);display:block;margin-bottom:8px">テーブルに表示する列</label>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px">
          ${allCols.map(col => `
            <label class="col-toggle-item" style="padding:6px 8px">
              <input type="checkbox" ${_trialVisibleCols.includes(col)?'checked':''} onchange="toggleTrialCol('${col}',this.checked)">
              ${colLabels[col]}
            </label>`).join('')}
        </div>
      </div>
    </div>`;

  const sortBar = controlBar + filterPanel + colPanel;

  const tableHtml = `
    <div class="card" style="margin-top:0">
      <div class="card-header">
        <span class="card-title">${tabs.find(t=>t.location===location)?.label || ''} 試験一覧</span>
        <span style="font-size:12px;color:var(--gray-400)">${trials.length} 件</span>
      </div>
      <div class="table-wrap" id="trialTableWrap">
        <table class="data-table resizable-table table-with-sticky-cols" id="trialTable">
          <thead>
            <tr>
              <th data-col="date" style="width:120px">試験日</th>
              <th data-col="actions" style="width:130px;text-align:center">編集・調製・削除</th>
              ${_trialVisibleCols.map(col => {
                const labels = { status:'状態', food_type:'種別', food_a:'フードA', food_b:'フードB', person:'担当者', purpose:'目的', notes:'備考', supplier:'サプライヤー', count:'頭数' };
                return `<th data-col="${col}">${labels[col]}</th>`;
              }).join('')}
            </tr>
          </thead>
          <tbody>
            ${trials.length === 0
              ? `<tr><td colspan="${_trialVisibleCols.length + 2}" style="text-align:center;color:var(--gray-400);padding:32px">登録された試験はありません</td></tr>`
              : trials.map(t => renderTrialRow(t, _trialVisibleCols)).join('')
            }
          </tbody>
        </table>
      </div>
    </div>
    ${renderTrialModal()}
    ${renderIngredientSearchModal()}`;

  setContent(tabBar + sortBar + tableHtml);
  initResizableTable('trialTable');
}

// ── 試験行（選択列のみ）──────────────────────────────────
function renderTrialRow(t, visibleCols) {
  const cellMap = {
    status: () => statusBadge(t.status || '計画中'),
    food_type: () => escHtml(foodTypeLabel(t.food_type)),
    food_a: () => `<span style="color:#1d4ed8;font-weight:600">A:</span> ${escHtml(t.food_a_overview || '-')}`,
    food_b: () => `<span style="color:#b45309;font-weight:600">B:</span> ${escHtml(t.food_b_overview || '-')}`,
    person: () => escHtml(t.person_in_charge || ''),
    purpose: () => escHtml(t.purpose || ''),
    notes: () => `<span style="font-size:11px">${escHtml(t.notes || '')}</span>`,
    supplier: () => escHtml(t.supplier || ''),
    count: () => t.animal_count ?? '-',
  };

  return `
    <tr class="trial-row-summary" data-trial-id="${t.id}">
      <td style="white-space:nowrap;font-weight:700">${escHtml(t.trial_date_label || formatDate(t.trial_date_start))}</td>
      <td class="col-actions" style="white-space:nowrap;text-align:center">
        <button class="btn btn-xs btn-secondary" title="編集" onclick="openTrialModal('${t.id}')">✎</button>
        <button class="btn btn-xs btn-success" title="調製" onclick="openPrepSheet('${t.id}')">準</button>
        <button class="btn btn-xs btn-danger" title="削除" onclick="deleteTrial('${t.id}')">✕</button>
      </td>
      ${(visibleCols || []).map(col => `<td>${cellMap[col]?.() || ''}</td>`).join('')}
    </tr>`;
}

// ── ソート ────────────────────────────────────────────────
function sortBtn(key, label) {
  const active = _trialSortKey === key;
  const arrow  = active ? (_trialSortAsc ? ' ↑' : ' ↓') : '';
  return `<button class="sort-btn${active?' active':''}" onclick="sortTrials('${key}')">${label}${arrow}</button>`;
}

async function sortTrials(key) {
  if (_trialSortKey === key) _trialSortAsc = !_trialSortAsc;
  else { _trialSortKey = key; _trialSortAsc = true; }
  await _renderTrialTab();
}

// ── 試験モーダル ─────────────────────────────────────────
function renderTrialModal() {
  const tabs = TRIAL_TABS[_trialSpecies] || [];
  const locOptions = tabs.map(t =>
    `<option value="${escHtml(t.location)}" ${t.location===_trialLocation?'selected':''}>${escHtml(t.label)}</option>`
  ).join('');

  return `
  <div class="modal-overlay" id="trialModal">
    <div class="modal-box modal-xl">
      <div class="modal-header">
        <span class="modal-title" id="trialModalTitle">試験を登録</span>
        <button class="modal-close" onclick="closeModal('trialModal')">x</button>
      </div>
      <div class="modal-body">
        <!-- 基本情報 -->
        <div class="form-grid form-grid-3" style="margin-bottom:14px">
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
            <label>試験場所</label>
            <div style="display:flex;gap:6px">
              <select class="form-control" id="t-location" style="flex:1">${locOptions}</select>
            </div>
          </div>
          <div class="form-group">
            <label>種別<span style="color:red">*</span></label>
            <select class="form-control" id="t-food-type">
              <option value="dry">ドライ</option>
              <option value="wet">ウェット</option>
            </select>
          </div>
          <div class="form-group">
            <label>ステータス</label>
            <select class="form-control" id="t-status">
              <option>計画中</option><option>進行中</option><option>完了</option><option>中止</option>
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
        </div>
        <div class="form-group" style="margin-bottom:14px">
          <label>備考</label>
          <textarea class="form-control" id="t-notes" rows="2"></textarea>
        </div>

        <!-- 内訳エディタ (A/B 並列) -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          ${['A','B'].map(side => `
          <div>
            <div style="font-weight:700;margin-bottom:6px;display:flex;align-items:center;gap:8px">
              <span class="side-badge side-${side.toLowerCase()}">${side==='A'?'A':'B'}</span>
              フード ${side}
            </div>
            <div class="form-group" style="margin-bottom:8px">
              <label>調製総重量 (g)</label>
              <input type="number" class="form-control" id="t-total-weight-${side}" min="0" step="1"
                placeholder="例: 4000"
                oninput="onTotalWeightChange('${side}')">
            </div>
            <!-- 合計表示行 -->
            <div id="ing-sum-${side}" style="display:flex;gap:16px;font-size:12px;color:var(--gray-500);
              background:var(--gray-50);border:1px solid var(--gray-200);border-radius:6px;
              padding:6px 10px;margin-bottom:6px">
              配合率合計: <b id="ing-sum-rate-${side}">0.0</b>%
              重量合計: <b id="ing-sum-weight-${side}">0</b> g
            </div>
            <!-- 内訳テーブル -->
            <table class="data-table" style="font-size:12px" id="ing-table-${side}">
              <thead>
                <tr>
                  <th style="width:90px">原料No.</th>
                  <th>原料名</th>
                  <th style="width:80px">配合率(%)</th>
                  <th style="width:80px">重量(g)</th>
                  <th style="width:30px"></th>
                </tr>
              </thead>
              <tbody id="ing-tbody-${side}"></tbody>
            </table>
            <button class="btn-add-row" style="margin-top:6px" onclick="addIngredientRow('${side}')">+ 行を追加</button>
          </div>`).join('')}
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
        <button class="modal-close" onclick="closeModal('ingSearchModal')">x</button>
      </div>
      <div class="modal-body">
        <input class="form-control" id="ingSearchInput" placeholder="原料No. または原料名で検索" oninput="filterIngSearch()">
        <div style="margin-top:10px;max-height:320px;overflow-y:auto" id="ingSearchResults"></div>
      </div>
    </div>
  </div>`;
}

// ── モーダル開閉 ─────────────────────────────────────────
async function openTrialModal(id = null) {
  _editTrialId = id;

  // DOM 生成（setContent 後にある想定のため確認）
  const existing = document.getElementById('trialModal');
  if (!existing) {
    const wrap = document.getElementById('modal-container');
    wrap.innerHTML = renderTrialModal() + renderIngredientSearchModal();
  }

  document.getElementById('trialModalTitle').textContent = id ? '試験を編集' : '試験を登録';

  await Promise.all([
    fillDatalistFromDropdown('supplier-list', 'サプライヤー'),
    fillDatalistFromDropdown('purpose-list', '試験区分'),
  ]);

  _ingredientEditors = { A: [], B: [] };
  _trialTotalWeight  = { A: 0, B: 0 };

  if (id) {
    const [trials, ings] = await Promise.all([
      dbSelect('pal_trials', { eq: { id } }),
      dbSelect('pal_trial_ingredients', { eq: { trial_id: id }, order: { col: 'sort_order', asc: true } }),
    ]);
    const t = trials[0];
    if (!t) return;

    document.getElementById('t-date-label').value         = t.trial_date_label    || '';
    document.getElementById('t-date-start').value         = t.trial_date_start    || '';
    document.getElementById('t-date-end').value           = t.trial_date_end      || '';
    document.getElementById('t-location').value           = t.location            ?? _trialLocation;
    document.getElementById('t-food-type').value          = t.food_type           || 'dry';
    document.getElementById('t-person').value             = t.person_in_charge    || '';
    document.getElementById('t-supplier').value           = t.supplier            || '';
    document.getElementById('t-purpose').value            = t.purpose             || '';
    document.getElementById('t-notes').value              = t.notes               || '';
    document.getElementById('t-animal-count').value       = t.animal_count        || '';
    document.getElementById('t-status').value             = t.status              || '計画中';
    document.getElementById('t-total-weight-A').value     = t.food_a_weight_total_g || '';
    document.getElementById('t-total-weight-B').value     = t.food_b_weight_total_g || '';
    _trialTotalWeight.A = Number(t.food_a_weight_total_g) || 0;
    _trialTotalWeight.B = Number(t.food_b_weight_total_g) || 0;

    _ingredientEditors.A = ings.filter(i => i.side === 'A').map(i => ({ ...i, _id: i.id || randId() }));
    _ingredientEditors.B = ings.filter(i => i.side === 'B').map(i => ({ ...i, _id: i.id || randId() }));
  } else {
    ['t-date-label','t-date-start','t-date-end','t-person','t-supplier','t-purpose','t-notes'].forEach(id => {
      document.getElementById(id).value = '';
    });
    document.getElementById('t-location').value       = _trialLocation;
    document.getElementById('t-food-type').value      = 'dry';
    document.getElementById('t-animal-count').value   = '';
    document.getElementById('t-status').value         = '計画中';
    document.getElementById('t-total-weight-A').value = '';
    document.getElementById('t-total-weight-B').value = '';
    _ingredientEditors = { A: [newIngRow()], B: [newIngRow()] };
  }

  renderIngEditors();
  openModal('trialModal');
}

function randId() { return Math.random().toString(36).slice(2); }
function newIngRow() {
  return { _id: randId(), material_no: '', recipe_name: '', blend_rate: null, weight_g: null, sort_order: 0 };
}

// ── 内訳テーブル描画 ─────────────────────────────────────
function renderIngEditors() {
  ['A','B'].forEach(side => renderIngSide(side));
}

function renderIngSide(side) {
  const tbody = document.getElementById(`ing-tbody-${side}`);
  if (!tbody) return;
  const rows = _ingredientEditors[side];

  tbody.innerHTML = rows.map((row, idx) => {
    const isFirst = idx === 0;
    const rateVal  = isFirst ? '' : (row.blend_rate ?? '');
    const rateAttr = isFirst ? 'readonly style="background:var(--gray-50);color:var(--gray-500)"' : '';
    const wgAttr   = 'readonly style="background:var(--gray-50);color:var(--gray-500)"';

    return `<tr id="ing-row-${side}-${row._id}">
      <td>
        <div style="display:flex;gap:3px">
          <input class="table-input" style="width:70px" placeholder="No."
            value="${escHtml(row.material_no||'')}"
            oninput="updateIngField('${side}','${row._id}','material_no',this.value)">
          <button class="btn btn-xs btn-secondary" onclick="openIngSearch('${side}','${row._id}')" title="検索">...</button>
        </div>
      </td>
      <td>
        <input class="table-input" placeholder="原料名"
          value="${escHtml(row.recipe_name||'')}"
          oninput="updateIngField('${side}','${row._id}','recipe_name',this.value)">
      </td>
      <td>
        <input class="table-input" type="number" placeholder="%" step="0.01"
          id="ing-rate-${side}-${row._id}"
          value="${rateVal}" ${rateAttr}
          oninput="onIngRateChange('${side}','${row._id}',this.value)">
      </td>
      <td>
        <input class="table-input" type="number" placeholder="g" step="0.01"
          id="ing-weight-${side}-${row._id}"
          value="${row.weight_g ?? ''}" ${wgAttr}>
      </td>
      <td>
        <button class="btn-remove-row" onclick="removeIngRow('${side}','${row._id}')">x</button>
      </td>
    </tr>`;
  }).join('');

  recalcIngAll(side);
}

function onTotalWeightChange(side) {
  _trialTotalWeight[side] = parseFloat(document.getElementById(`t-total-weight-${side}`).value) || 0;
  recalcIngAll(side);
}

function onIngRateChange(side, rid, val) {
  updateIngField(side, rid, 'blend_rate', parseFloat(val) || null);
  recalcIngAll(side);
}

function recalcIngAll(side) {
  const rows   = _ingredientEditors[side];
  const total  = _trialTotalWeight[side];

  // 2行目以降の配合率合計
  const sumOthers = rows.slice(1).reduce((s, r) => s + (Number(r.blend_rate) || 0), 0);
  const firstRate = Math.max(0, 100 - sumOthers);

  // 1行目の blend_rate を自動セット
  if (rows.length > 0) {
    rows[0].blend_rate = parseFloat(firstRate.toFixed(2));
    const el = document.getElementById(`ing-rate-${side}-${rows[0]._id}`);
    if (el) el.value = rows[0].blend_rate;
  }

  // 全行の重量を自動計算
  let sumRate = 0, sumWeight = 0;
  rows.forEach(row => {
    const rate = Number(row.blend_rate) || 0;
    const wg   = total > 0 ? (total * rate / 100) : null;
    row.weight_g = wg != null ? parseFloat(wg.toFixed(2)) : null;
    const wel = document.getElementById(`ing-weight-${side}-${row._id}`);
    if (wel) wel.value = row.weight_g ?? '';
    sumRate   += rate;
    sumWeight += row.weight_g || 0;
  });

  // 合計表示
  const sumRateEl   = document.getElementById(`ing-sum-rate-${side}`);
  const sumWeightEl = document.getElementById(`ing-sum-weight-${side}`);
  if (sumRateEl)   sumRateEl.textContent   = sumRate.toFixed(2);
  if (sumWeightEl) sumWeightEl.textContent = sumWeight.toFixed(1);
}

function addIngredientRow(side) {
  _ingredientEditors[side].push(newIngRow());
  renderIngSide(side);
}

function removeIngRow(side, rid) {
  _ingredientEditors[side] = _ingredientEditors[side].filter(r => r._id !== rid);
  renderIngSide(side);
}

function updateIngField(side, rid, field, val) {
  const row = _ingredientEditors[side].find(r => r._id === rid);
  if (row) row[field] = val;
}

// ── 原料検索 ─────────────────────────────────────────────
let _ingSearchSide = null;
let _ingSearchRid  = null;

async function openIngSearch(side, rid) {
  _ingSearchSide = side;
  _ingSearchRid  = rid;
  const mats = await getMaterials();
  window._ingSearchMaterials = mats;
  document.getElementById('ingSearchInput').value = '';
  filterIngSearch();
  openModal('ingSearchModal');
}

function filterIngSearch() {
  const q    = (document.getElementById('ingSearchInput').value || '').toLowerCase();
  const mats = (window._ingSearchMaterials || []).filter(m =>
    (m.material_no||'').toLowerCase().includes(q) || (m.name||'').toLowerCase().includes(q)
  ).slice(0, 60);

  document.getElementById('ingSearchResults').innerHTML = mats.length === 0
    ? '<p style="color:var(--gray-400);font-size:13px;padding:12px">見つかりませんでした</p>'
    : mats.map(m => `
        <div onclick="selectMaterial('${escHtml(m.material_no||'')}','${escHtml(m.name||'')}')"
          style="padding:8px 10px;border-bottom:1px solid var(--gray-100);cursor:pointer;font-size:13px;"
          onmouseover="this.style.background='var(--gray-50)'" onmouseout="this.style.background=''">
          <strong>${escHtml(m.material_no||'')}</strong>
          <span style="margin-left:8px">${escHtml(m.name||'')}</span>
        </div>`).join('');
}

function selectMaterial(no, name) {
  const row = _ingredientEditors[_ingSearchSide].find(r => r._id === _ingSearchRid);
  if (row) { row.material_no = no; row.recipe_name = name; }
  renderIngSide(_ingSearchSide);
  closeModal('ingSearchModal');
}

// ── 保存 ─────────────────────────────────────────────────
async function saveTrial() {
  const dateLabel = document.getElementById('t-date-label').value.trim();
  if (!dateLabel) { showToast('試験日（表示用）は必須です', 'error'); return; }

  const location = document.getElementById('t-location').value;

  const allIngA = _ingredientEditors.A;
  const allIngB = _ingredientEditors.B;
  const overviewA = allIngA.find(r => r.recipe_name)?.recipe_name || null;
  const overviewB = allIngB.find(r => r.recipe_name)?.recipe_name || null;
  const totalGa   = parseFloat(document.getElementById('t-total-weight-A').value) || null;
  const totalGb   = parseFloat(document.getElementById('t-total-weight-B').value) || null;

  const trialData = {
    species:               _trialSpecies,
    location,
    food_type:             document.getElementById('t-food-type').value,
    trial_date_label:      dateLabel,
    trial_date_start:      document.getElementById('t-date-start').value  || null,
    trial_date_end:        document.getElementById('t-date-end').value    || null,
    person_in_charge:      document.getElementById('t-person').value.trim()    || null,
    supplier:              document.getElementById('t-supplier').value.trim()  || null,
    purpose:               document.getElementById('t-purpose').value.trim()   || null,
    notes:                 document.getElementById('t-notes').value.trim()     || null,
    animal_count:          parseInt(document.getElementById('t-animal-count').value) || null,
    status:                document.getElementById('t-status').value,
    food_a_overview:       overviewA,
    food_b_overview:       overviewB,
    food_a_weight_total_g: totalGa,
    food_b_weight_total_g: totalGb,
  };

  try {
    let trialId;
    if (_editTrialId) {
      await dbUpdate('pal_trials', _editTrialId, trialData);
      trialId = _editTrialId;
      await sb.from('pal_trial_ingredients').delete().eq('trial_id', trialId);
    } else {
      const res = await dbInsert('pal_trials', [trialData]);
      trialId = res[0].id;
    }

    const ingRows = [];
    ['A','B'].forEach(side => {
      _ingredientEditors[side].forEach((row, idx) => {
        if (!row.recipe_name && !row.material_no) return;
        ingRows.push({
          trial_id:    trialId,
          side,
          material_no: row.material_no || null,
          recipe_name: row.recipe_name || null,
          blend_rate:  row.blend_rate  ?? null,
          weight_g:    row.weight_g    ?? null,
          sort_order:  idx,
        });
      });
    });
    if (ingRows.length > 0) await dbInsert('pal_trial_ingredients', ingRows);

    // 場所が変わった場合はタブも更新
    _trialLocation = location;

    showToast('保存しました', 'success');
    closeModal('trialModal');
    await _renderTrialTab();
  } catch (e) {
    console.error(e);
    showToast('保存に失敗しました: ' + e.message, 'error');
  }
}

// ── 削除 ─────────────────────────────────────────────────
async function deleteTrial(id) {
  if (!confirm('この試験を削除しますか？（内訳・結果を含む）')) return;
  try {
    await dbDelete('pal_trials', id);
    showToast('削除しました', 'success');
    await _renderTrialTab();
  } catch (e) {
    showToast('削除に失敗しました: ' + e.message, 'error');
  }
}

// ── datalist ─────────────────────────────────────────────
async function fillDatalistFromDropdown(listId, category) {
  const opts = await getDropdowns(category);
  const dl = document.getElementById(listId);
  if (dl) dl.innerHTML = opts.map(o => `<option value="${escHtml(o.value)}">`).join('');
}

// ── リサイズ可能テーブル ──────────────────────────────────
// ── 試験計画フィルタ・パネル管理 ─────────────────────────
function toggleTrialFilter() {
  _trialShowFilter = !_trialShowFilter;
  _renderTrialTab();
}

function toggleTrialColSel() {
  _trialShowColSel = !_trialShowColSel;
  _renderTrialTab();
}

function toggleTrialCol(col, checked) {
  if (checked) {
    if (!_trialVisibleCols.includes(col)) _trialVisibleCols.push(col);
  } else {
    _trialVisibleCols = _trialVisibleCols.filter(c => c !== col);
  }
  // リアルタイム反映
  _renderTrialTab();
}

function applyTrialFilter() {
  const dateFrom  = document.getElementById('f-trial-date-from')?.value || '';
  const dateTo    = document.getElementById('f-trial-date-to')?.value   || '';
  const keyword   = (document.getElementById('f-trial-keyword')?.value   || '').toLowerCase();
  const statuses  = [...document.querySelectorAll('.f-trial-status:checked')].map(el => el.value);
  const foodTypes = [...document.querySelectorAll('.f-trial-foodtype:checked')].map(el => el.value);

  _trialFilterState = { dateFrom, dateTo, keyword, statuses, foodTypes };
  _renderTrialTab();
}

function clearTrialFilter() {
  _trialFilterState = {};
  document.querySelectorAll('.f-trial-status,.f-trial-foodtype').forEach(el => { el.checked = false; });
  const kw = document.getElementById('f-trial-keyword'); if (kw) kw.value = '';
  const df = document.getElementById('f-trial-date-from'); if (df) df.value = '';
  const dt = document.getElementById('f-trial-date-to');   if (dt) dt.value = '';
  applyTrialFilter();
}

function initResizableTable(tableId) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const cols = table.querySelectorAll('th');
  cols.forEach(th => {
    if (th.querySelector('.col-resizer')) return;
    const resizer = document.createElement('div');
    resizer.className = 'col-resizer';
    th.appendChild(resizer);
    let startX, startW;
    resizer.addEventListener('mousedown', e => {
      startX = e.pageX;
      startW = th.offsetWidth;
      const onMove = ev => { th.style.width = Math.max(40, startW + ev.pageX - startX) + 'px'; };
      const onUp   = ()  => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      e.preventDefault();
    });
  });
}
