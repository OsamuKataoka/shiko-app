// ============================================================
// PAW Lab 嗜好試験管理システム - コア / ルーター / ユーティリティ
// ============================================================

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── 状態 ──────────────────────────────────────────────────
let currentUser   = null;
let currentNav    = null;   // { section, species, location }
let cacheAnimals  = null;   // neko-app animals テーブルキャッシュ
let cacheTrials   = null;   // neko-app trials テーブルキャッシュ
let cacheMaterials = null;  // raw_materials キャッシュ
let cacheDropdowns = null;  // dropdown_options キャッシュ

// ── 初期化 ────────────────────────────────────────────────
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { location.href = 'index.html'; return; }
  currentUser = session.user;
  document.getElementById('userEmail').textContent = currentUser.email;

  // 最初のページを猫 R に
  openGroup('cat');
  const first = document.querySelector('.nav-item[data-section="trial"][data-species="cat"]');
  if (first) navigate(first);
})();

// ── ナビゲーション ────────────────────────────────────────
function navigate(el) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active','cat-active','dog-active','mgmt-active'));
  el.classList.add('active');
  const sp = el.dataset.species;
  if (sp === 'cat')  el.classList.add('cat-active');
  if (sp === 'dog')  el.classList.add('dog-active');
  if (!sp)           el.classList.add('mgmt-active');

  const section  = el.dataset.section;
  const species  = el.dataset.species || null;
  const location = el.dataset.location !== undefined ? el.dataset.location : null;
  currentNav = { section, species, location };

  // ヘッダー更新
  const badge = document.getElementById('speciesBadge');
  if (species === 'cat') {
    badge.textContent = '猫'; badge.className = 'header-species-badge badge-cat'; badge.style.display = '';
  } else if (species === 'dog') {
    badge.textContent = '犬'; badge.className = 'header-species-badge badge-dog'; badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }

  // セクション描画
  switch (section) {
    case 'trial':           renderTrialPlan(species); break;
    case 'result-list':     renderResultList(species); break;
    case 'materials':       renderMaterials(); break;
    case 'dropdowns':       renderDropdowns(); break;
    case 'prep-checklist':  renderPrepChecklist(); break;
    case 'stat-settings':   renderStatSettings(); break;
    case 'user-management': renderUserManagement(); break;
    default: setContent('<div class="empty-state"><p>準備中</p></div>');
  }
}

function toggleGroup(name) {
  const el = document.getElementById('group-' + name);
  if (el) el.classList.toggle('open');
}
function openGroup(name) {
  const el = document.getElementById('group-' + name);
  if (el) el.classList.add('open');
}

// ── ログアウト ────────────────────────────────────────────
async function doLogout() {
  await sb.auth.signOut();
  location.href = 'index.html';
}

// ── コンテンツ描画 ────────────────────────────────────────
function setContent(html) {
  document.getElementById('content').innerHTML = html;
}
function setTitle(title) {
  document.getElementById('pageTitle').textContent = title;
}
function loading() {
  setContent('<div class="loading-wrap"><div class="spinner"></div>読込中...</div>');
}

// ── Supabase ヘルパー ─────────────────────────────────────
async function dbSelect(table, query = {}) {
  let q = sb.from(table).select(query.select || '*');
  if (query.eq)     Object.entries(query.eq).forEach(([k,v]) => { q = q.eq(k, v); });
  if (query.in)     Object.entries(query.in).forEach(([k,v]) => { q = q.in(k, v); });
  if (query.order)  q = q.order(query.order.col, { ascending: query.order.asc ?? true });
  if (query.limit)  q = q.limit(query.limit);
  const { data, error } = await q;
  if (error) { console.error(table, error); return []; }
  return data || [];
}

async function dbInsert(table, rows) {
  const { data, error } = await sb.from(table).insert(rows).select();
  if (error) throw error;
  return data;
}

async function dbUpdate(table, id, values) {
  const { data, error } = await sb.from(table).update(values).eq('id', id).select();
  if (error) throw error;
  return data;
}

async function dbDelete(table, id) {
  const { error } = await sb.from(table).delete().eq('id', id);
  if (error) throw error;
}

// ── キャッシュ付き取得 ────────────────────────────────────
async function getAnimals(forceRefresh = false) {
  if (!cacheAnimals || forceRefresh) {
    cacheAnimals = await dbSelect('animals', {
      select: 'id,name,sex,animal_no,active,species',
      order: { col: 'name', asc: true }
    });
  }
  return cacheAnimals;
}

async function getAnimalsBySpecies(species) {
  const all = await getAnimals();
  // neko-app の animals テーブルには species 列がない場合も考慮
  // 試験から絞り込む必要があればここで対応
  return all;
}

async function getNekoDogs(species) {
  // neko-app の animals テーブルから猫/犬を取得
  // species 列がなければ全件返す（手動でフィルタ）
  const all = await getAnimals();
  if (all.some(a => a.species)) {
    return all.filter(a => species === 'cat' ? a.species === 'cat' : a.species === 'dog');
  }
  return all;
}

async function getMaterials(forceRefresh = false) {
  if (!cacheMaterials || forceRefresh) {
    cacheMaterials = await dbSelect('raw_materials', {
      order: { col: 'material_no', asc: true }
    });
  }
  return cacheMaterials;
}

async function getDropdowns(category) {
  if (!cacheDropdowns) {
    cacheDropdowns = await dbSelect('dropdown_options', { order: { col: 'sort_order', asc: true } });
  }
  return cacheDropdowns.filter(d => d.category === category);
}

// ── トースト ──────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const wrap = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ── モーダル ──────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id)?.classList.add('open');
}
function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}
function closeAllModals() {
  document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
}

// モーダル外クリックで閉じる
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) closeAllModals();
});

// ── ユーティリティ ────────────────────────────────────────
function escHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}

function fmtPct(v) {
  if (v == null) return '-';
  return Number(v).toFixed(1) + '%';
}

function fmtNum(v, digits = 2) {
  if (v == null) return '-';
  return Number(v).toFixed(digits);
}

// 場所の表示名
function locationLabel(species, loc) {
  if (species === 'cat') return loc === 'O' ? '大阪 (O)' : 'RDC (R)';
  return loc === 'I' ? '専門学校 (I)' : 'RDC';
}

// フードタイプ表示名
function foodTypeLabel(ft) {
  return ft === 'wet' ? 'ウェット' : 'ドライ';
}

// ステータスバッジ HTML
function statusBadge(s) {
  return `<span class="status-badge status-${escHtml(s)}">${escHtml(s)}</span>`;
}

// 原料ステータスバッジ
function materialStatusBadge(s) {
  if (!s) return '<span class="material-status ms-ok">在庫あり</span>';
  if (s === '期限切れ') return '<span class="material-status ms-expired">期限切れ</span>';
  return '<span class="material-status ms-soon">残り少</span>';
}

// 選好率バー HTML
function prefBar(a, b) {
  if (a == null || b == null) return '';
  const total = (Number(a) + Number(b)) || 100;
  const pctA = (Number(a) / total * 100).toFixed(1);
  const pctB = (Number(b) / total * 100).toFixed(1);
  return `
    <div class="pref-bar-wrap">
      <span style="font-size:11px;color:#1d4ed8;font-weight:600;">${pctA}%</span>
      <div class="pref-bar"><div class="pref-bar-fill-a" style="width:${pctA}%"></div></div>
      <div class="pref-bar"><div class="pref-bar-fill-b" style="width:${pctB}%"></div></div>
      <span style="font-size:11px;color:#b45309;font-weight:600;">${pctB}%</span>
    </div>`;
}

// ── セレクト要素オプション生成 ────────────────────────────
function buildOptions(vals, selected = '') {
  return vals.map(v => {
    const s = (String(v) === String(selected)) ? ' selected' : '';
    return `<option value="${escHtml(v)}"${s}>${escHtml(v)}</option>`;
  }).join('');
}

// ── Netlify Function 呼び出し (service_role 権限が必要な操作) ──
async function callDb(body) {
  const r = await fetch('/.netlify/functions/db', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'DB error');
  return data;
}
