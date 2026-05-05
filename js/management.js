// ============================================================
// 管理セクション群
// ============================================================

// ──────────────────────────────────────────────────────────
// RDC 原料在庫管理
// ──────────────────────────────────────────────────────────
let _matSortKey = 'material_no';
let _matSortAsc = true;
let _matFilter  = '';
let _editMatId  = null;

async function renderMaterials() {
  setTitle('RDC 原料在庫管理');
  loading();

  cacheMaterials = null;
  const mats = await getMaterials();
  renderMaterialsInner(mats);
}

function renderMaterialsInner(allMats) {
  let mats = [...allMats];
  if (_matFilter) {
    const q = _matFilter.toLowerCase();
    mats = mats.filter(m =>
      (m.material_no||'').toLowerCase().includes(q) ||
      (m.name||'').toLowerCase().includes(q) ||
      (m.category||'').toLowerCase().includes(q) ||
      (m.manufacturer||'').toLowerCase().includes(q)
    );
  }
  mats.sort((a,b) => {
    const va = a[_matSortKey] ?? '';
    const vb = b[_matSortKey] ?? '';
    return _matSortAsc ? String(va).localeCompare(String(vb), 'ja') : String(vb).localeCompare(String(va), 'ja');
  });

  const html = `
    <div class="filter-bar">
      <input placeholder="原料No./名称/区分/会社で検索" style="width:260px"
        value="${escHtml(_matFilter)}"
        oninput="_matFilter=this.value;renderMaterialsInner(cacheMaterials||[])">
      <select onchange="_matFilter=this.value;renderMaterialsInner(cacheMaterials||[])">
        <option value="">すべての区分</option>
        ${[...new Set((cacheMaterials||[]).map(m=>m.category).filter(Boolean))].map(c=>`<option ${_matFilter===c?'selected':''}>${escHtml(c)}</option>`).join('')}
      </select>
      <div style="flex:1"></div>
      <button class="btn btn-primary btn-sm" onclick="openMatModal()">＋ 新規登録</button>
    </div>
    <div class="sort-bar">
      <label>ソート:</label>
      ${matSortBtn('material_no','原料No.')}
      ${matSortBtn('category','区分')}
      ${matSortBtn('name','原料名')}
      ${matSortBtn('expiry_date','賞味期限')}
      ${matSortBtn('manufacturer','製造会社')}
      <span style="font-size:12px;color:var(--gray-400)">${mats.length} 件</span>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>原料No.</th><th>区分</th><th>原料名</th><th>類別</th>
              <th>賞味期限</th><th>ステータス</th>
              <th>製造会社</th><th>仕入商社</th>
              <th>参考単価(円/kg)</th><th>保管場所</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${mats.map(m => `
              <tr>
                <td style="font-family:monospace;font-size:12px">${escHtml(m.material_no||'')}</td>
                <td style="font-size:12px">${escHtml(m.category||'')}</td>
                <td><strong>${escHtml(m.name||'')}</strong></td>
                <td style="font-size:12px">${escHtml(m.classification||'')}</td>
                <td style="font-size:12px;white-space:nowrap">${m.expiry_date ? formatDate(m.expiry_date) : '-'}</td>
                <td>${materialStatusBadge(m.status)}</td>
                <td style="font-size:12px">${escHtml(m.manufacturer||'')}</td>
                <td style="font-size:12px">${escHtml(m.trading_company||'')}</td>
                <td style="text-align:right">${m.unit_price != null ? Number(m.unit_price).toLocaleString() : ''}</td>
                <td style="font-size:12px">${escHtml(m.sample_location||'')}</td>
                <td class="col-actions">
                  <button class="btn btn-xs btn-secondary" onclick="openMatModal('${m.id}')">編集</button>
                  <button class="btn btn-xs btn-danger" onclick="deleteMat('${m.id}')">削除</button>
                </td>
              </tr>`).join('') || '<tr><td colspan="11" style="text-align:center;color:var(--gray-400);padding:32px">データがありません</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
    ${renderMatModal()}
  `;
  setContent(html);
}

function matSortBtn(key, label) {
  const active = _matSortKey === key;
  const arrow  = active ? (_matSortAsc ? ' ↑' : ' ↓') : '';
  return `<button class="sort-btn${active?' active':''}"
    onclick="_matSortKey='${key}';_matSortAsc=${active?!_matSortAsc:true};renderMaterialsInner(cacheMaterials||[])">${label}${arrow}</button>`;
}

function renderMatModal() {
  const cats = ['嗜好性原料','機能性原料','嗜好性&機能性原料','トッピング','ノンコート粒','製品','その他（アレルギー用等）'];
  return `
  <div class="modal-overlay" id="matModal">
    <div class="modal-box modal-lg">
      <div class="modal-header">
        <span class="modal-title" id="matModalTitle">原料を登録</span>
        <button class="modal-close" onclick="closeModal('matModal')">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-grid form-grid-2">
          <div class="form-group">
            <label>原料No.</label>
            <input class="form-control" id="m-no" placeholder="PM_20240001">
          </div>
          <div class="form-group">
            <label>原料区分</label>
            <select class="form-control" id="m-cat">
              ${cats.map(c=>`<option>${c}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label>原料名<span style="color:red">*</span></label>
            <input class="form-control" id="m-name" placeholder="原料名">
          </div>
          <div class="form-group">
            <label>類別</label>
            <input class="form-control" id="m-class" placeholder="魚介類・油脂類...">
          </div>
          <div class="form-group">
            <label>由来</label>
            <input class="form-control" id="m-origin" placeholder="魚・豚・植物...">
          </div>
          <div class="form-group">
            <label>賞味期限</label>
            <input type="date" class="form-control" id="m-expiry">
          </div>
          <div class="form-group">
            <label>ステータス</label>
            <select class="form-control" id="m-status">
              <option value="">在庫あり</option>
              <option value="90日以上">90日以上経過</option>
              <option value="期限切れ">期限切れ</option>
            </select>
          </div>
          <div class="form-group">
            <label>製造会社</label>
            <input class="form-control" id="m-maker" placeholder="製造会社名">
          </div>
          <div class="form-group">
            <label>仕入（商社）会社</label>
            <input class="form-control" id="m-trading" placeholder="商社名">
          </div>
          <div class="form-group">
            <label>参考単価(円/kg)</label>
            <input type="number" class="form-control" id="m-price" placeholder="0">
          </div>
          <div class="form-group">
            <label>供給量(kg/月)</label>
            <input type="number" class="form-control" id="m-supply" placeholder="0">
          </div>
          <div class="form-group">
            <label>サンプル保管場所</label>
            <input class="form-control" id="m-sample-loc" placeholder="場所">
          </div>
          <div class="form-group">
            <label>廃棄日</label>
            <input type="date" class="form-control" id="m-disposal">
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label>情報保管場所</label>
            <input class="form-control" id="m-info-loc" placeholder="フォルダパス等">
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('matModal')">キャンセル</button>
        <button class="btn btn-primary" onclick="saveMat()">保存</button>
      </div>
    </div>
  </div>`;
}

async function openMatModal(id = null) {
  _editMatId = id;
  document.getElementById('matModalTitle').textContent = id ? '原料を編集' : '原料を登録';
  const fields = ['m-no','m-cat','m-name','m-class','m-origin','m-expiry','m-status','m-maker','m-trading','m-price','m-supply','m-sample-loc','m-disposal','m-info-loc'];
  fields.forEach(f => { const el = document.getElementById(f); if (el) el.value = ''; });

  if (id) {
    const mats = await dbSelect('raw_materials', { eq: { id } });
    const m = mats[0];
    if (!m) return;
    document.getElementById('m-no').value        = m.material_no      || '';
    document.getElementById('m-cat').value       = m.category         || '';
    document.getElementById('m-name').value      = m.name             || '';
    document.getElementById('m-class').value     = m.classification   || '';
    document.getElementById('m-origin').value    = m.origin           || '';
    document.getElementById('m-expiry').value    = m.expiry_date      || '';
    document.getElementById('m-status').value    = m.status           || '';
    document.getElementById('m-maker').value     = m.manufacturer     || '';
    document.getElementById('m-trading').value   = m.trading_company  || '';
    document.getElementById('m-price').value     = m.unit_price       || '';
    document.getElementById('m-supply').value    = m.supply_volume_kg || '';
    document.getElementById('m-sample-loc').value = m.sample_location || '';
    document.getElementById('m-disposal').value  = m.disposal_date    || '';
    document.getElementById('m-info-loc').value  = m.info_location    || '';
  }
  openModal('matModal');
}

async function saveMat() {
  const name = document.getElementById('m-name').value.trim();
  if (!name) { showToast('原料名は必須です', 'error'); return; }

  const data = {
    material_no:      document.getElementById('m-no').value.trim()        || null,
    category:         document.getElementById('m-cat').value              || null,
    name,
    classification:   document.getElementById('m-class').value.trim()    || null,
    origin:           document.getElementById('m-origin').value.trim()   || null,
    expiry_date:      document.getElementById('m-expiry').value           || null,
    status:           document.getElementById('m-status').value           || null,
    manufacturer:     document.getElementById('m-maker').value.trim()    || null,
    trading_company:  document.getElementById('m-trading').value.trim()  || null,
    unit_price:       parseFloat(document.getElementById('m-price').value)     || null,
    supply_volume_kg: parseFloat(document.getElementById('m-supply').value)    || null,
    sample_location:  document.getElementById('m-sample-loc').value.trim()|| null,
    disposal_date:    document.getElementById('m-disposal').value         || null,
    info_location:    document.getElementById('m-info-loc').value.trim() || null,
  };

  try {
    if (_editMatId) await dbUpdate('raw_materials', _editMatId, data);
    else await dbInsert('raw_materials', [data]);
    cacheMaterials = null;
    showToast('保存しました', 'success');
    closeModal('matModal');
    await renderMaterials();
  } catch (e) {
    showToast('保存に失敗しました: ' + e.message, 'error');
  }
}

async function deleteMat(id) {
  if (!confirm('この原料を削除しますか？')) return;
  try {
    await dbDelete('raw_materials', id);
    cacheMaterials = null;
    showToast('削除しました', 'success');
    await renderMaterials();
  } catch (e) {
    showToast('削除に失敗しました: ' + e.message, 'error');
  }
}

// ──────────────────────────────────────────────────────────
// 選択肢一覧
// ──────────────────────────────────────────────────────────
let _ddCurrentCat = '';

async function renderDropdowns() {
  setTitle('選択肢一覧');
  loading();
  cacheDropdowns = null;
  const all = await dbSelect('dropdown_options', { order: { col: 'sort_order', asc: true } });
  let cats = [...new Set(all.map(d => d.category))];

  if (!_ddCurrentCat && cats.length > 0) _ddCurrentCat = cats[0];

  const filtered = all.filter(d => d.category === _ddCurrentCat);

  setContent(`
    <div class="tab-bar">
      ${cats.map(c => `<button class="tab-btn${c===_ddCurrentCat?' active':''}" onclick="_ddCurrentCat='${escHtml(c)}';renderDropdowns()">${escHtml(c)}</button>`).join('')}
      <button class="tab-btn" onclick="addDdCategory()">＋ カテゴリを追加</button>
    </div>
    <div class="card">
      <div class="card-header">
        <span class="card-title">${escHtml(_ddCurrentCat)}</span>
        <button class="btn btn-primary btn-sm" onclick="addDdItem()">＋ 追加</button>
        <button class="btn btn-danger btn-sm" onclick="deleteDdCategory()">カテゴリ削除</button>
      </div>
      <div class="card-body">
        <table class="data-table">
          <thead><tr><th>値</th><th>表示順</th><th></th></tr></thead>
          <tbody>
            ${filtered.map(d => `
              <tr>
                <td><input class="table-input" value="${escHtml(d.value)}" onchange="updateDdItem('${d.id}','value',this.value)"></td>
                <td><input class="table-input" type="number" style="width:60px" value="${d.sort_order}" onchange="updateDdItem('${d.id}','sort_order',parseInt(this.value))"></td>
                <td class="col-actions"><button class="btn btn-xs btn-danger" onclick="deleteDdItem('${d.id}')">削除</button></td>
              </tr>`).join('') || '<tr><td colspan="3" style="text-align:center;color:var(--gray-400);padding:20px">項目がありません</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `);
}

async function addDdItem() {
  const val = prompt(`「${_ddCurrentCat}」に追加する値:`);
  if (!val) return;
  try {
    await dbInsert('dropdown_options', [{ category: _ddCurrentCat, value: val, sort_order: 99 }]);
    cacheDropdowns = null;
    showToast('追加しました', 'success');
    await renderDropdowns();
  } catch (e) { showToast('追加に失敗: ' + e.message, 'error'); }
}

async function updateDdItem(id, field, val) {
  try {
    await dbUpdate('dropdown_options', id, { [field]: val });
    cacheDropdowns = null;
  } catch (e) { showToast('更新に失敗: ' + e.message, 'error'); }
}

async function deleteDdItem(id) {
  if (!confirm('この選択肢を削除しますか？')) return;
  try {
    await dbDelete('dropdown_options', id);
    cacheDropdowns = null;
    showToast('削除しました', 'success');
    await renderDropdowns();
  } catch (e) { showToast('削除に失敗: ' + e.message, 'error'); }
}

async function addDdCategory() {
  const cat = prompt('新しいカテゴリ名:');
  if (!cat) return;
  _ddCurrentCat = cat;
  await renderDropdowns();
}

async function deleteDdCategory() {
  if (!confirm(`カテゴリ「${_ddCurrentCat}」とその選択肢をすべて削除しますか？`)) return;
  try {
    const items = await dbSelect('dropdown_options', { eq: { category: _ddCurrentCat } });
    for (const i of items) await dbDelete('dropdown_options', i.id);
    cacheDropdowns = null;
    _ddCurrentCat = '';
    showToast('削除しました', 'success');
    await renderDropdowns();
  } catch (e) { showToast('削除に失敗: ' + e.message, 'error'); }
}

// ──────────────────────────────────────────────────────────
// 調製用紙チェックリスト管理
// ──────────────────────────────────────────────────────────
async function renderPrepChecklist() {
  setTitle('調製用紙チェックリスト管理');
  loading();

  const items = await dbSelect('prep_checklist', { order: { col: 'sort_order', asc: true } });

  const groups = {};
  items.forEach(c => {
    const key = `${c.species}|${c.location}|${c.food_type}`;
    if (!groups[key]) groups[key] = { species: c.species, location: c.location, food_type: c.food_type, items: [] };
    groups[key].items.push(c);
  });

  const groupLabel = (sp, loc, ft) => {
    const spL  = sp === 'cat' ? '猫' : sp === 'dog' ? '犬' : '共通';
    const locL = loc === 'all' ? '全場所' : loc || 'RDC';
    const ftL  = ft === 'dry' ? 'ドライ' : ft === 'wet' ? 'ウェット' : '共通';
    return `${spL} / ${locL} / ${ftL}`;
  };

  setContent(`
    <div style="margin-bottom:14px">
      <button class="btn btn-primary btn-sm" onclick="addCheckGroup()">＋ グループを追加</button>
    </div>
    ${Object.entries(groups).map(([key, g]) => `
      <div class="card" style="margin-bottom:16px">
        <div class="card-header">
          <span class="card-title">${groupLabel(g.species, g.location, g.food_type)}</span>
          <button class="btn btn-primary btn-sm" onclick="addCheckItem('${g.species}','${g.location}','${g.food_type}')">＋ 追加</button>
        </div>
        <div class="card-body" style="padding:0">
          <table class="data-table">
            <thead><tr><th>チェック項目</th><th>順序</th><th></th></tr></thead>
            <tbody>
              ${g.items.map(c => `
                <tr>
                  <td><input class="table-input" style="width:100%" value="${escHtml(c.item_text)}" onchange="updateCheckItem('${c.id}','item_text',this.value)"></td>
                  <td><input class="table-input" type="number" style="width:56px" value="${c.sort_order}" onchange="updateCheckItem('${c.id}','sort_order',parseInt(this.value))"></td>
                  <td class="col-actions"><button class="btn btn-xs btn-danger" onclick="deleteCheckItem('${c.id}')">削除</button></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`).join('') || '<div class="empty-state"><p>チェックリストがありません</p></div>'}
  `);
}

async function addCheckGroup() {
  const species  = prompt('対象種 (cat / dog / both):') || 'both';
  const location = prompt('場所 (R / O / I / 空=RDC / all):') || 'all';
  const foodType = prompt('種別 (dry / wet / both):') || 'both';
  const text     = prompt('チェック項目:');
  if (!text) return;
  try {
    await dbInsert('prep_checklist', [{ species, location, food_type: foodType, item_text: text, sort_order: 1 }]);
    showToast('追加しました', 'success');
    await renderPrepChecklist();
  } catch (e) { showToast('追加に失敗: ' + e.message, 'error'); }
}

async function addCheckItem(species, location, foodType) {
  const text = prompt('チェック項目テキスト:');
  if (!text) return;
  try {
    await dbInsert('prep_checklist', [{ species, location, food_type: foodType, item_text: text, sort_order: 99 }]);
    showToast('追加しました', 'success');
    await renderPrepChecklist();
  } catch (e) { showToast('追加に失敗: ' + e.message, 'error'); }
}

async function updateCheckItem(id, field, val) {
  try { await dbUpdate('prep_checklist', id, { [field]: val }); }
  catch (e) { showToast('更新に失敗: ' + e.message, 'error'); }
}

async function deleteCheckItem(id) {
  if (!confirm('この項目を削除しますか？')) return;
  try {
    await dbDelete('prep_checklist', id);
    showToast('削除しました', 'success');
    await renderPrepChecklist();
  } catch (e) { showToast('削除に失敗: ' + e.message, 'error'); }
}

// ──────────────────────────────────────────────────────────
// 統計解析設定
// ──────────────────────────────────────────────────────────
let _statTab = 'cat';

async function renderStatSettings() {
  setTitle('統計解析設定');
  loading();
  const settings = await dbSelect('stat_settings');
  const catSt = settings.find(s => s.species === 'cat') || {};
  const dogSt = settings.find(s => s.species === 'dog') || {};

  setContent(`
    <div class="tab-bar">
      <button class="tab-btn${_statTab==='cat'?' active':''}" onclick="_statTab='cat';renderStatSettings()">猫</button>
      <button class="tab-btn${_statTab==='dog'?' active':''}" onclick="_statTab='dog';renderStatSettings()">犬</button>
    </div>
    ${renderStatForm(_statTab === 'cat' ? catSt : dogSt, _statTab)}
  `);
}

function renderStatForm(s, species) {
  return `
    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><span class="card-title">解析フロー</span></div>
      <div class="card-body" style="font-size:13px;line-height:1.8">
        <div style="background:var(--gray-50,#f8f9fa);border:1px solid var(--gray-200,#e2e8f0);border-radius:8px;padding:14px">
          <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px">
            <span style="background:#3b82f6;color:#fff;border-radius:4px;padding:2px 8px;font-size:11px;white-space:nowrap">STEP 1</span>
            <div>
              <b>正規性検定手法：Shapiro-Wilk 検定</b><br>
              <span style="color:var(--gray-500,#64748b)">フードAとフードBの採食比の差（各個体）が正規分布に従うか検定します。<br>
              p値 &lt; α（正規性判定閾値）→ <b>非正規分布</b> と判定</span>
            </div>
          </div>
          <div style="margin-left:16px;border-left:2px solid var(--gray-300,#cbd5e1);padding-left:12px;margin-bottom:10px">
            <div style="margin-bottom:8px">
              <span style="color:#16a34a;font-weight:600">正規分布 → 対応のあるT検定（Paired T-test）</span><br>
              <span style="color:var(--gray-500,#64748b);font-size:12px">個体ごとの差の平均が0かどうかを検定。左右対称な分布を前提とします。</span>
            </div>
            <div>
              <span style="color:#dc2626;font-weight:600">非正規分布 → ウィルコクソン符号順位和検定（Wilcoxon Signed-Rank Test）</span><br>
              <span style="color:var(--gray-500,#64748b);font-size:12px">差の順位を使ったノンパラメトリック検定。正規性を仮定しない頑健な手法です。</span>
            </div>
          </div>
          <div style="display:flex;align-items:flex-start;gap:8px">
            <span style="background:#8b5cf6;color:#fff;border-radius:4px;padding:2px 8px;font-size:11px;white-space:nowrap">STEP 2</span>
            <div>
              <b>効果量（効果の大きさ）の計算</b><br>
              <div style="margin-top:4px">
                <span style="color:#16a34a;font-weight:600">T検定の場合 → Cohen's dz</span>
                <span style="color:var(--gray-500,#64748b);font-size:12px"> = 差の平均 ÷ 差の標準偏差。|dz| ≥ 0.8 で大きな効果。</span>
              </div>
              <div>
                <span style="color:#dc2626;font-weight:600">ウィルコクソンの場合 → rank-biserial（順位双列相関）</span>
                <span style="color:var(--gray-500,#64748b);font-size:12px"> = 2W / n(n+1) − 1。−1〜+1 の範囲。|r| ≥ 0.8 で大きな効果。</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">${species === 'cat' ? '猫' : '犬'} 統計解析設定</span>
      </div>
      <div class="card-body">
        <div class="form-grid form-grid-2">
          <div class="form-group">
            <label>正規性検定手法</label>
            <select class="form-control" id="st-normtest">
              <option value="shapiro" ${s.normality_test==='shapiro'?'selected':''}>Shapiro-Wilk 検定</option>
            </select>
            <small style="font-size:11px;color:var(--gray-400)">現在はShapiro-Wilkのみ対応</small>
          </div>
          <div class="form-group">
            <label>正規性判定 有意水準 α（正規/非正規の境界）</label>
            <input type="number" class="form-control" id="st-norm-alpha" step="0.01" min="0.01" max="0.20"
              value="${s.normality_alpha ?? 0.05}">
            <small style="font-size:11px;color:var(--gray-400)">p &lt; α → 非正規 → ウィルコクソン符号順位和検定を使用</small>
          </div>
          <div class="form-group">
            <label>有意差判定 有意水準 α（フード間に差があるかの境界）</label>
            <input type="number" class="form-control" id="st-sig-alpha" step="0.01" min="0.01" max="0.20"
              value="${s.significance_alpha ?? 0.05}">
            <small style="font-size:11px;color:var(--gray-400)">p &lt; α → 有意差あり（T検定・ウィルコクソン共通）</small>
          </div>
          <div class="form-group">
            <label>集計方法</label>
            <select class="form-control" id="st-agg">
              <option value="average" ${s.aggregate_method==='average'?'selected':''}>1回目・2回目の平均</option>
              <option value="day1"    ${s.aggregate_method==='day1'   ?'selected':''}>1回目のみ</option>
              <option value="day2"    ${s.aggregate_method==='day2'   ?'selected':''}>2回目のみ</option>
            </select>
          </div>
          <div class="form-group">
            <label>除外基準 最小摂食率 (%)</label>
            <input type="number" class="form-control" id="st-exc-min" step="1" min="0"
              value="${s.exclusion_min_ratio ?? 10}">
            <small style="font-size:11px;color:var(--gray-400)">フード合計摂食率がこの値未満の個体を統計解析から除外</small>
          </div>
          <div class="form-group">
            <label>警告基準 最大摂食率 (%)</label>
            <input type="number" class="form-control" id="st-exc-max" step="1" min="0"
              value="${s.exclusion_max_ratio ?? 130}">
            <small style="font-size:11px;color:var(--gray-400)">この値を超える個体に警告表示（食べ過ぎ）</small>
          </div>
          <div class="form-group">
            <label>効果量計算方法</label>
            <select class="form-control" id="st-effect">
              <option value="auto"           ${s.effect_size_method==='auto'          ?'selected':''}>自動（T検定 → Cohen's dz ／ ウィルコクソン → rank-biserial）</option>
              <option value="cohen_dz"       ${s.effect_size_method==='cohen_dz'      ?'selected':''}>Cohen's dz のみ（正規分布・T検定用）</option>
              <option value="rank_biserial"  ${s.effect_size_method==='rank_biserial' ?'selected':''}>rank-biserial のみ（ウィルコクソン符号順位和検定用）</option>
            </select>
          </div>
          <div class="form-group">
            <label>効果量 閾値（小 / 中 / 大）</label>
            <div style="display:flex;gap:8px;align-items:center">
              <span style="font-size:11px;color:var(--gray-500)">小</span>
              <input type="number" class="form-control" id="st-ef-sm" step="0.05" value="${s.effect_small_threshold ?? 0.2}" placeholder="small">
              <span style="font-size:11px;color:var(--gray-500)">中</span>
              <input type="number" class="form-control" id="st-ef-md" step="0.05" value="${s.effect_medium_threshold ?? 0.5}" placeholder="medium">
              <span style="font-size:11px;color:var(--gray-500)">大</span>
              <input type="number" class="form-control" id="st-ef-lg" step="0.05" value="${s.effect_large_threshold ?? 0.8}" placeholder="large">
            </div>
            <small style="font-size:11px;color:var(--gray-400)">Cohen's dz・rank-biserial 共通の閾値。例: 0.2 / 0.5 / 0.8</small>
          </div>
        </div>
        <div class="form-group" style="margin-top:14px">
          <label>備考・メモ</label>
          <textarea class="form-control" id="st-notes" rows="2">${escHtml(s.notes||'')}</textarea>
        </div>
        <div style="margin-top:16px;text-align:right">
          <button class="btn btn-primary" onclick="saveStatSettings('${species}')">設定を保存</button>
        </div>
      </div>
    </div>
  `;
}

async function saveStatSettings(species) {
  const data = {
    normality_test:          document.getElementById('st-normtest').value,
    normality_alpha:         parseFloat(document.getElementById('st-norm-alpha').value),
    significance_alpha:      parseFloat(document.getElementById('st-sig-alpha').value),
    aggregate_method:        document.getElementById('st-agg').value,
    exclusion_min_ratio:     parseFloat(document.getElementById('st-exc-min').value),
    exclusion_max_ratio:     parseFloat(document.getElementById('st-exc-max').value),
    effect_size_method:      document.getElementById('st-effect').value,
    effect_small_threshold:  parseFloat(document.getElementById('st-ef-sm').value),
    effect_medium_threshold: parseFloat(document.getElementById('st-ef-md').value),
    effect_large_threshold:  parseFloat(document.getElementById('st-ef-lg').value),
    notes:                   document.getElementById('st-notes').value.trim() || null,
  };
  try {
    const existing = await dbSelect('stat_settings', { eq: { species } });
    if (existing[0]) await dbUpdate('stat_settings', existing[0].id, data);
    else await dbInsert('stat_settings', [{ species, ...data }]);
    showToast('設定を保存しました', 'success');
  } catch (e) { showToast('保存に失敗: ' + e.message, 'error'); }
}

// ──────────────────────────────────────────────────────────
// ユーザー管理
// ──────────────────────────────────────────────────────────
let _editUserId = null;

async function renderUserManagement() {
  setTitle('ユーザー管理');
  loading();

  let users = [];
  try {
    users = await callDb({ action: 'list-users' });
  } catch (e) {
    setContent(`<div class="empty-state"><p>ユーザー一覧の取得に失敗しました: ${escHtml(e.message)}</p></div>`);
    return;
  }

  setContent(`
    <div style="margin-bottom:14px;display:flex;align-items:center;gap:8px">
      <span style="flex:1;font-size:13px;color:var(--gray-500)">${users.length} ユーザー</span>
      <button class="btn btn-primary btn-sm" onclick="openUserModal()">＋ ユーザーを招待</button>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>メールアドレス</th>
              <th>表示名</th>
              <th>役割</th>
              <th>最終ログイン</th>
              <th>登録日</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${users.map(u => `
              <tr>
                <td style="font-size:12px">${escHtml(u.email)}</td>
                <td>${escHtml(u.display_name || '')}</td>
                <td><span class="status-badge ${u.role === 'admin' ? 'status-進行中' : 'status-計画中'}">${u.role === 'admin' ? '管理者' : '一般'}</span></td>
                <td style="font-size:12px">${u.last_sign_in_at ? formatDate(u.last_sign_in_at) : '-'}</td>
                <td style="font-size:12px">${formatDate(u.created_at)}</td>
                <td class="col-actions">
                  <button class="btn btn-xs btn-secondary" onclick="openUserModal('${u.id}','${escHtml(u.email)}','${escHtml(u.display_name || '')}','${u.role}')">編集</button>
                  <button class="btn btn-xs btn-danger" onclick="deleteUser('${u.id}')">削除</button>
                </td>
              </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--gray-400);padding:32px">ユーザーがいません</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
    ${renderUserModal()}
  `);
}

function renderUserModal() {
  return `
  <div class="modal-overlay" id="userModal">
    <div class="modal-box">
      <div class="modal-header">
        <span class="modal-title" id="userModalTitle">ユーザーを招待</span>
        <button class="modal-close" onclick="closeModal('userModal')">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-grid">
          <div class="form-group" id="userEmailGroup">
            <label>メールアドレス<span style="color:red">*</span></label>
            <input class="form-control" id="u-email" type="email" placeholder="email@example.com">
          </div>
          <div class="form-group">
            <label>表示名</label>
            <input class="form-control" id="u-name" placeholder="氏名">
          </div>
          <div class="form-group">
            <label>役割</label>
            <select class="form-control" id="u-role">
              <option value="general">一般</option>
              <option value="admin">管理者</option>
            </select>
          </div>
          <div class="form-group" id="userPwGroup" style="display:none">
            <label>新しいパスワード（変更する場合のみ）</label>
            <input class="form-control" id="u-pw" type="password" placeholder="8文字以上">
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('userModal')">キャンセル</button>
        <button class="btn btn-primary" id="userSaveBtn" onclick="saveUser()">招待メールを送信</button>
      </div>
    </div>
  </div>`;
}

function openUserModal(id = null, email = '', name = '', role = 'general') {
  _editUserId = id;
  const isEdit = !!id;
  document.getElementById('userModalTitle').textContent = isEdit ? 'ユーザーを編集' : 'ユーザーを招待';
  document.getElementById('u-email').value = email;
  document.getElementById('u-name').value = name;
  document.getElementById('u-role').value = role;
  document.getElementById('u-pw').value = '';
  document.getElementById('userEmailGroup').style.display = isEdit ? 'none' : '';
  document.getElementById('userPwGroup').style.display = isEdit ? '' : 'none';
  document.getElementById('userSaveBtn').textContent = isEdit ? '保存' : '招待メールを送信';
  openModal('userModal');
}

async function saveUser() {
  const name = document.getElementById('u-name').value.trim();
  const role = document.getElementById('u-role').value;
  try {
    if (_editUserId) {
      const pw = document.getElementById('u-pw').value;
      await callDb({
        action: 'update-user',
        id: _editUserId,
        data: { display_name: name, app_role: role, ...(pw ? { password: pw } : {}) },
      });
      showToast('更新しました', 'success');
    } else {
      const email = document.getElementById('u-email').value.trim();
      if (!email) { showToast('メールアドレスは必須です', 'error'); return; }
      await callDb({ action: 'invite-user', data: { email, display_name: name, app_role: role } });
      showToast('招待メールを送信しました', 'success');
    }
    closeModal('userModal');
    await renderUserManagement();
  } catch (e) {
    showToast('処理に失敗しました: ' + e.message, 'error');
  }
}

async function deleteUser(id) {
  if (!confirm('このユーザーを削除しますか？この操作は取り消せません。')) return;
  try {
    await callDb({ action: 'delete-user', id });
    showToast('削除しました', 'success');
    await renderUserManagement();
  } catch (e) {
    showToast('削除に失敗: ' + e.message, 'error');
  }
}
