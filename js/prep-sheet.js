// ============================================================
// 調製用紙セクション
// ============================================================

let _prepTrialId   = null;
let _prepTrial     = null;
let _prepAnimalRows = [];  // 参加個体リスト

// ── 調製用紙を開く (試験一覧の「調製」ボタンから) ──────────
async function openPrepSheet(trialId) {
  _prepTrialId = trialId;
  loading();

  const [trials, ings, animals, palAnimals, checklist] = await Promise.all([
    dbSelect('pal_trials',            { eq: { id: trialId } }),
    dbSelect('pal_trial_ingredients', { eq: { trial_id: trialId }, order: { col: 'sort_order', asc: true } }),
    getAnimals(),
    dbSelect('pal_trial_animals',     { eq: { trial_id: trialId }, order: { col: 'sort_order', asc: true } }),
    getChecklistItems(),
  ]);

  _prepTrial = trials[0];
  if (!_prepTrial) { setContent('<div class="empty-state"><p>試験が見つかりません</p></div>'); return; }

  const species  = _prepTrial.species;
  const location = _prepTrial.location;
  const foodType = _prepTrial.food_type;

  // 参加個体: DB登録済みを優先、なければ空行を表示
  _prepAnimalRows = palAnimals.map(pa => ({
    id:           pa.id,
    animal_id:    pa.animal_id,
    animal_name:  pa.animal_name || animals.find(a => a.id === pa.animal_id)?.name || '',
    food_given_g: pa.food_given_g || '',
    tare_g:       pa.tare_g || '',
  }));
  if (_prepAnimalRows.length === 0) _prepAnimalRows = [emptyAnimalRow()];

  const ingA = ings.filter(i => i.side === 'A');
  const ingB = ings.filter(i => i.side === 'B');

  setTitle(`調製用紙 | ${_prepTrial.trial_date_label || ''} ${foodType === 'wet' ? 'ウェット' : 'ドライ'}`);

  const html = `
    <div class="no-print" style="display:flex;gap:8px;margin-bottom:16px">
      <button class="btn btn-secondary" onclick="renderTrialPlan('${species}')">← 試験一覧へ</button>
      <div style="flex:1"></div>
      <button class="btn btn-success" onclick="savePrepAnimals()">個体・給与量を保存</button>
      <button class="btn btn-primary" onclick="window.print()">印刷</button>
    </div>

    <div class="prep-sheet" id="prepSheetBody">
      ${renderPrepHeader(checklist, foodType, species, location, ingA, ingB)}
      ${foodType === 'wet' ? renderPrepAnimalTableWet() : renderPrepAnimalTableDry()}
    </div>

    ${renderPrepAnimalModal(animals, species)}
  `;

  setContent(html);
}

// ── 調製用紙ヘッダー ─────────────────────────────────────
function renderPrepHeader(checklist, foodType, species, location, ingA, ingB) {
  const t = _prepTrial;
  const foodTypeLabel = foodType === 'wet' ? 'ウェット' : 'ドライ';
  const speciesLabel  = species  === 'cat'  ? '猫'  : '犬';

  const totalA = ingA.reduce((s,r) => s + (Number(r.weight_g)||0), 0);
  const totalB = ingB.reduce((s,r) => s + (Number(r.weight_g)||0), 0);

  return `
    <h2>【${speciesLabel}用】嗜好試験 調製用紙 (${foodTypeLabel})</h2>
    <div style="display:flex;justify-content:space-between;margin-bottom:8px">
      <div><strong>試験担当者:</strong> ${escHtml(t.person_in_charge||'')} &emsp;
           <strong>サプライヤー:</strong> ${escHtml(t.supplier||'')}</div>
      <div><strong>試験日:</strong> ${escHtml(t.trial_date_label||'')}</div>
    </div>
    <div><strong>目的:</strong> ${escHtml(t.purpose||'')} &emsp; <strong>備考:</strong> ${escHtml(t.notes||'')}</div>

    <div class="section-title">調整 <small style="font-weight:400;font-size:11px">（納期: <input type="date" class="table-input" style="width:140px" id="prep-deadline"> まで）</small></div>
    <table class="prep-table">
      <thead>
        <tr>
          <th>〇原料No.</th><th>〇レシピ</th><th>〇重量(g)</th>
          <th>●原料No.</th><th>●レシピ</th><th>●重量(g)</th>
        </tr>
      </thead>
      <tbody>
        ${buildIngTable(ingA, ingB)}
        <tr>
          <td colspan="2"><strong>合計</strong></td>
          <td><strong>${totalA > 0 ? totalA.toFixed(0) : ''}</strong></td>
          <td colspan="2"><strong>合計</strong></td>
          <td><strong>${totalB > 0 ? totalB.toFixed(0) : ''}</strong></td>
        </tr>
      </tbody>
    </table>
    <div>〇フード: <strong>${escHtml(t.food_a_overview||'')}</strong></div>
    <div>●フード: <strong>${escHtml(t.food_b_overview||'')}</strong></div>

    <div class="section-title">＜調製者チェック欄＞</div>
    <div id="checklistItems">
      ${renderChecklistItems(checklist, foodType, species, location)}
    </div>

    <div style="margin-top:10px;display:flex;gap:40px">
      <div><strong>調製日:</strong> <input type="date" class="table-input" style="width:150px" id="prep-make-date"></div>
      <div><strong>調製者名:</strong> <input class="table-input" style="width:120px" placeholder="　　　　　"></div>
    </div>
  `;
}

function buildIngTable(ingA, ingB) {
  const maxLen = Math.max(ingA.length, ingB.length, 1);
  return Array.from({length: maxLen}).map((_,i) => {
    const a = ingA[i] || {};
    const b = ingB[i] || {};
    return `<tr>
      <td>${escHtml(a.material_no||'')}</td>
      <td>${escHtml(a.recipe_name||'')}</td>
      <td style="text-align:right">${a.weight_g != null ? Number(a.weight_g).toFixed(0) : ''}</td>
      <td>${escHtml(b.material_no||'')}</td>
      <td>${escHtml(b.recipe_name||'')}</td>
      <td style="text-align:right">${b.weight_g != null ? Number(b.weight_g).toFixed(0) : ''}</td>
    </tr>`;
  }).join('');
}

function renderChecklistItems(checklist, foodType, species, location) {
  const items = checklist.filter(c => {
    const matchSp  = c.species  === 'both' || c.species  === species;
    const matchLoc = c.location === 'all'  || c.location === location;
    const matchFt  = c.food_type === 'both' || c.food_type === foodType;
    return matchSp && matchLoc && matchFt;
  }).sort((a,b) => a.sort_order - b.sort_order);

  return items.map((c, idx) => `
    <div class="check-item" style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #eee">
      <div class="check-box" style="width:16px;height:16px;border:1.5px solid #666;border-radius:3px;flex-shrink:0"></div>
      <span style="flex:1;font-size:12px">${escHtml(c.item_text)}</span>
      <input class="table-input no-print" style="width:60px;font-size:11px" placeholder="✓" title="確認">
      <input type="file" accept="image/*" class="no-print" style="width:80px;font-size:11px;cursor:pointer" title="画像を添付" onchange="handleChecklistImage(event, ${idx})">
      <img id="check-img-${idx}" style="width:40px;height:40px;object-fit:contain;border-radius:4px;display:none;cursor:pointer" title="クリックで拡大" onclick="showChecklistImageModal(this.src)">
    </div>`).join('') || '<div style="color:var(--gray-400);font-size:12px;padding:8px 0">チェック項目がありません（管理 > 調製用紙チェックで設定）</div>';
}

let _checklistImages = {}; // { idx: dataUrl }

function handleChecklistImage(e, idx) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const dataUrl = ev.target.result;
    _checklistImages[idx] = dataUrl;
    const imgEl = document.getElementById(`check-img-${idx}`);
    if (imgEl) {
      imgEl.src = dataUrl;
      imgEl.style.display = 'block';
    }
  };
  reader.readAsDataURL(file);
}

function showChecklistImageModal(src) {
  const modal = document.getElementById('checklistImageModal');
  if (!modal) {
    const m = document.createElement('div');
    m.id = 'checklistImageModal';
    m.className = 'modal-overlay';
    m.innerHTML = `
      <div class="modal-box" style="width:600px;max-width:90vw">
        <div class="modal-header">
          <span class="modal-title">画像表示</span>
          <button class="modal-close" onclick="closeModal('checklistImageModal')">✕</button>
        </div>
        <div class="modal-body" style="text-align:center">
          <img id="checklistImageView" src="${escHtml(src)}" style="max-width:100%;max-height:70vh;border-radius:6px">
        </div>
      </div>
    `;
    document.body.appendChild(m);
  } else {
    document.getElementById('checklistImageView').src = src;
  }
  openModal('checklistImageModal');
}

async function getChecklistItems() {
  return dbSelect('prep_checklist', { order: { col: 'sort_order', asc: true } });
}

// ── ドライ用 個体テーブル ─────────────────────────────────
function renderPrepAnimalTableDry() {
  return `
    <div class="section-title">
      試験実施日
      <span style="font-weight:400;font-size:11px">
        1回目: <input type="date" class="table-input" style="width:140px" id="prep-date1" value="${_prepTrial?.trial_date_start || ''}">
        2回目: <input type="date" class="table-input" style="width:140px" id="prep-date2" value="${_prepTrial?.trial_date_end && _prepTrial.trial_date_end !== _prepTrial.trial_date_start ? _prepTrial.trial_date_end : ''}">
      </span>
    </div>
    <div class="no-print" style="margin-bottom:8px">
      <button class="btn btn-xs btn-secondary" onclick="openPrepAnimalModal()">＋ 個体を追加</button>
    </div>
    <table class="prep-table" id="prepAnimalTable">
      <thead>
        <tr>
          <th rowspan="2">No.</th>
          <th rowspan="2">個体名</th>
          <th rowspan="2">給与量(g)</th>
          <th colspan="2">1日目</th>
          <th colspan="2">2日目</th>
          <th class="no-print" rowspan="2"></th>
        </tr>
        <tr>
          <th>○残餌g</th><th>●残餌g</th>
          <th>●残餌g</th><th>○残餌g</th>
        </tr>
      </thead>
      <tbody>
        ${_prepAnimalRows.map((a,i) => `
          <tr>
            <td>${i+1}</td>
            <td>
              <input class="table-input" value="${escHtml(a.animal_name)}" style="width:80px"
                onchange="updatePrepAnimal(${i},'animal_name',this.value)">
            </td>
            <td>
              <input class="table-input" type="number" value="${a.food_given_g}" style="width:56px"
                onchange="updatePrepAnimal(${i},'food_given_g',this.value)">
            </td>
            <td style="text-align:center">○　　●</td>
            <td><input class="table-input" style="width:60px" placeholder="g"></td>
            <td><input class="table-input" style="width:60px" placeholder="g"></td>
            <td style="text-align:center">●　　○</td>
            <td><input class="table-input" style="width:60px" placeholder="g"></td>
            <td><input class="table-input" style="width:60px" placeholder="g"></td>
            <td class="no-print">
              <button class="btn btn-xs btn-danger" onclick="removePrepAnimal(${i})">削除</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

// ── ウェット用 個体テーブル ───────────────────────────────
function renderPrepAnimalTableWet() {
  return `
    <div class="section-title">
      試験実施日
      <span style="font-weight:400;font-size:11px">
        1回目: <input type="date" class="table-input" style="width:140px" id="prep-date1" value="${_prepTrial?.trial_date_start || ''}">
        2回目: <input type="date" class="table-input" style="width:140px" id="prep-date2" value="${_prepTrial?.trial_date_end && _prepTrial.trial_date_end !== _prepTrial.trial_date_start ? _prepTrial.trial_date_end : ''}">
      </span>
    </div>
    <div class="no-print" style="margin-bottom:8px">
      <button class="btn btn-xs btn-secondary" onclick="openPrepAnimalModal()">＋ 個体を追加</button>
    </div>
    <table class="prep-table" id="prepAnimalTable">
      <thead>
        <tr>
          <th rowspan="3">No.</th>
          <th rowspan="3">個体名</th>
          <th rowspan="3">給与量<br>(g)</th>
          <th rowspan="3">風袋<br>(g)</th>
          <th colspan="4">1日目</th>
          <th colspan="4">2日目</th>
          <th class="no-print" rowspan="3"></th>
        </tr>
        <tr>
          <th colspan="2">○先</th><th colspan="2">●先</th>
          <th colspan="2">●先</th><th colspan="2">○先</th>
        </tr>
        <tr>
          <th>○総量(g)</th><th>○残餌(g)</th>
          <th>●総量(g)</th><th>●残餌(g)</th>
          <th>●総量(g)</th><th>●残餌(g)</th>
          <th>○総量(g)</th><th>○残餌(g)</th>
        </tr>
      </thead>
      <tbody>
        ${_prepAnimalRows.map((a,i) => `
          <tr>
            <td>${i+1}</td>
            <td>
              <input class="table-input" value="${escHtml(a.animal_name)}" style="width:72px"
                onchange="updatePrepAnimal(${i},'animal_name',this.value)">
            </td>
            <td>
              <input class="table-input" type="number" value="${a.food_given_g}" style="width:50px"
                onchange="updatePrepAnimal(${i},'food_given_g',this.value)">
            </td>
            <td>
              <input class="table-input" type="number" value="${a.tare_g}" style="width:50px"
                onchange="updatePrepAnimal(${i},'tare_g',this.value)">
            </td>
            ${Array(8).fill(0).map(() => `<td><input class="table-input" style="width:52px" placeholder="g"></td>`).join('')}
            <td class="no-print">
              <button class="btn btn-xs btn-danger" onclick="removePrepAnimal(${i})">削除</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

// ── 個体追加モーダル ─────────────────────────────────────
function renderPrepAnimalModal(allAnimals, species) {
  return `
  <div class="modal-overlay" id="prepAnimalModal">
    <div class="modal-box">
      <div class="modal-header">
        <span class="modal-title">個体を追加</span>
        <button class="modal-close" onclick="closeModal('prepAnimalModal')">✕</button>
      </div>
      <div class="modal-body">
        <p style="font-size:12px;color:var(--gray-500);margin-bottom:10px">neko-appの個体から選択、または手打ちで名前を入力</p>
        <input class="form-control" id="animalSearchInp" placeholder="個体名で検索..." oninput="filterPrepAnimals()" style="margin-bottom:10px">
        <div style="max-height:300px;overflow-y:auto" id="animalSearchList">
          ${allAnimals.map(a => `
            <div class="check-item" style="cursor:pointer" onclick="addPrepAnimalFromList('${a.id}','${escHtml(a.name)}')">
              <span style="font-size:13px">${escHtml(a.name)}</span>
              <span style="font-size:11px;color:var(--gray-400);margin-left:8px">${escHtml(a.animal_no||'')}</span>
            </div>`).join('')}
        </div>
        <div style="margin-top:12px;border-top:1px solid var(--gray-200);padding-top:12px">
          <label style="font-size:12px;font-weight:600">手打ちで追加:</label>
          <div style="display:flex;gap:8px;margin-top:6px">
            <input class="form-control" id="manualAnimalName" placeholder="個体名">
            <input class="form-control" type="number" id="manualAnimalGram" placeholder="給与量(g)" style="width:100px">
            <button class="btn btn-primary btn-sm" onclick="addPrepAnimalManual()">追加</button>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('prepAnimalModal')">閉じる</button>
      </div>
    </div>
  </div>`;
}

let _allAnimalsForPrep = [];
async function openPrepAnimalModal() {
  _allAnimalsForPrep = await getAnimals();
  filterPrepAnimals();
  openModal('prepAnimalModal');
}

function filterPrepAnimals() {
  const q = (document.getElementById('animalSearchInp')?.value || '').toLowerCase();
  const list = document.getElementById('animalSearchList');
  if (!list) return;
  const filtered = _allAnimalsForPrep.filter(a => (a.name||'').toLowerCase().includes(q));
  list.innerHTML = filtered.map(a => `
    <div class="check-item" style="cursor:pointer" onclick="addPrepAnimalFromList('${a.id}','${escHtml(a.name)}')">
      <span style="font-size:13px">${escHtml(a.name)}</span>
      <span style="font-size:11px;color:var(--gray-400);margin-left:8px">${escHtml(a.animal_no||'')}</span>
    </div>`).join('');
}

function addPrepAnimalFromList(animalId, name) {
  _prepAnimalRows.push({ id: null, animal_id: animalId, animal_name: name, food_given_g: '', tare_g: '' });
  refreshPrepTable();
  closeModal('prepAnimalModal');
}

function addPrepAnimalManual() {
  const name = document.getElementById('manualAnimalName').value.trim();
  const gram = document.getElementById('manualAnimalGram').value;
  if (!name) { showToast('個体名を入力してください', 'error'); return; }
  _prepAnimalRows.push({ id: null, animal_id: null, animal_name: name, food_given_g: gram, tare_g: '' });
  refreshPrepTable();
  closeModal('prepAnimalModal');
}

function emptyAnimalRow() {
  return { id: null, animal_id: null, animal_name: '', food_given_g: '', tare_g: '' };
}

function updatePrepAnimal(idx, field, val) {
  if (_prepAnimalRows[idx]) _prepAnimalRows[idx][field] = val;
}

function removePrepAnimal(idx) {
  _prepAnimalRows.splice(idx, 1);
  refreshPrepTable();
}

function refreshPrepTable() {
  const foodType = _prepTrial?.food_type || 'dry';
  const tbody = document.querySelector('#prepAnimalTable tbody');
  if (!tbody) return;
  const newTbody = foodType === 'wet'
    ? renderPrepAnimalTableWet().match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] || ''
    : renderPrepAnimalTableDry().match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] || '';

  // テーブル全体を再描画する簡易実装
  openPrepSheet(_prepTrialId);
}

// ── 個体・給与量を保存 ────────────────────────────────────
async function savePrepAnimals() {
  if (!_prepTrialId) return;
  try {
    // 既存レコード削除して再挿入
    await sb.from('pal_trial_animals').delete().eq('trial_id', _prepTrialId);
    const rows = _prepAnimalRows
      .filter(a => a.animal_name || a.animal_id)
      .map((a, idx) => ({
        trial_id:    _prepTrialId,
        animal_id:   a.animal_id  || null,
        animal_name: a.animal_name || null,
        food_given_g: parseFloat(a.food_given_g) || null,
        tare_g:      parseFloat(a.tare_g)       || null,
        sort_order:  idx,
      }));
    if (rows.length > 0) await dbInsert('pal_trial_animals', rows);
    showToast('個体・給与量を保存しました', 'success');
  } catch (e) {
    showToast('保存に失敗しました: ' + e.message, 'error');
  }
}
