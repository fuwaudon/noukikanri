// ================= データ =================
let requests = JSON.parse(localStorage.getItem('requests')) || [];
let tags = JSON.parse(localStorage.getItem('tags')) || [];
let todos = JSON.parse(localStorage.getItem('todos')) || [];
let capacityRates = JSON.parse(localStorage.getItem('capacityRates')) || {};

const APP_VERSION = 2;
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1;
let currentBlock = 'upper';

let editingTodoId = null;
let currentDetailId = null;
let currentMoveId = null;
let currentPriority = 2;
let importDataCache = null;
let currentCompletedDetailId = null;

const blockNames = { upper: '上旬', middle: '中旬', lower: '下旬' };

// ================= データ移行 & クリーンアップ =================
function migrateData() {
  const savedVersion = parseInt(localStorage.getItem('appVersion')) || 1;
  if (savedVersion >= APP_VERSION) return;

  requests = requests.map(r => ({
    ...r,
    id: r.id || Date.now(),
    year: r.year || currentYear,
    month: r.month || currentMonth,
    block: r.block || 'upper',
    completed: !!r.completed,
    completedDate: r.completedDate || null,
    price: r.price || null,
    memo: r.memo || ''
  }));

  tags = tags.map(t => ({ ...t, maxPerBlock: t.maxPerBlock || 5 }));
  todos = todos.map(t => ({ ...t, id: t.id || Date.now(), priority: t.priority || 2, completed: !!t.completed, memo: t.memo || '' }));

  localStorage.setItem('requests', JSON.stringify(requests));
  localStorage.setItem('tags', JSON.stringify(tags));
  localStorage.setItem('todos', JSON.stringify(todos));
  localStorage.setItem('appVersion', APP_VERSION.toString());
}

function cleanupOldCompletedRequests() {
  let currentBlockIndex = (currentMonth - 1) * 3;
  if (currentBlock === 'middle') currentBlockIndex += 1;
  else if (currentBlock === 'lower') currentBlockIndex += 2;

  requests = requests.filter(r => {
    if (!r.completed || !r.completedDate) return true;

    let reqBlockIndex = (r.month - 1) * 3;
    if (r.block === 'middle') reqBlockIndex += 1;
    else if (r.block === 'lower') reqBlockIndex += 2;

    const monthDiff = (currentYear - r.year) * 12 + (currentMonth - r.month);
    const blockDiff = currentBlockIndex - reqBlockIndex + monthDiff * 3;

    return blockDiff <= 2;
  });

  localStorage.setItem('requests', JSON.stringify(requests));
}

// ================= ユーティリティ =================
function getTagConsumption(tagName) {
  const tag = tags.find(t => t.name === tagName);
  return tag && tag.maxPerBlock ? Math.round(100 / tag.maxPerBlock) : 25;
}

function calculateBlockUsage(year, month, block) {
  const blockRequests = requests.filter(r => !r.completed && r.year === year && r.month === month && r.block === block);
  let total = 0;
  blockRequests.forEach(r => total += getTagConsumption(r.tag));
  const rate = getCapacityRate(year, month, block);
  const usage = Math.round(total * (100 / rate));
  return { usage };
}

function getCapacityRate(year, month, block) {
  const key = `${year}-${month}-${block}`;
  return capacityRates[key] || 100;
}

function saveCapacityRate(year, month, block, rate) {
  const key = `${year}-${month}-${block}`;
  capacityRates[key] = Math.max(30, Math.min(100, parseInt(rate) || 100));
  localStorage.setItem('capacityRates', JSON.stringify(capacityRates));
}

// ================= 収入 =================
function updateIncome() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const income = requests
    .filter(r => r.price && !r.completed && r.year === year && r.month === month)
    .reduce((sum, r) => sum + Number(r.price), 0);

  document.getElementById('monthlyIncome').textContent = `¥${income.toLocaleString()}`;
}

// ================= ページ切り替え（復活） =================
function showPage(page) {
  document.getElementById('mainPage').classList.add('hidden');
  document.getElementById('todoPage').classList.add('hidden');
  document.getElementById('completedPage').classList.add('hidden');
  document.getElementById(page).classList.remove('hidden');

  if (page === 'completedPage') {
    cleanupOldCompletedRequests();
    renderCompletedPage();
  }
}

// ================= メイン描画 =================
function renderAll() {
  renderMainPage();
  renderUrgentTodos();
  updateIncome();
  renderTodos();
}

function renderMainPage() {
  document.getElementById('monthTitle').textContent = `${currentYear}年 ${currentMonth}月`;
  renderBlockTabs();
  renderBlockSummary();
  renderCurrentBlock();
}

function renderBlockTabs() {
  ['upper', 'middle', 'lower'].forEach(block => {
    const tab = document.getElementById(`tab-${block}`);
    if (tab) {
      tab.classList.toggle('bg-zinc-700', block === currentBlock);
      tab.classList.toggle('text-white', block === currentBlock);
    }
  });
}

function renderBlockSummary() {
  const container = document.getElementById('blockSummary');
  container.innerHTML = '';
  ['upper', 'middle', 'lower'].forEach(block => {
    const { usage } = calculateBlockUsage(currentYear, currentMonth, block);
    let cls = 'good', text = '余裕あり';
    if (usage >= 90) { cls = 'danger'; text = '余裕無し'; }
    else if (usage >= 50) { cls = 'caution'; text = '余裕少'; }

    const div = document.createElement('div');
    div.className = `block-summary-item ${cls}`;
    div.innerHTML = `<div class="text-xs text-zinc-400">${blockNames[block]}</div><div class="font-medium">${text}</div>`;
    container.appendChild(div);
  });
}

function renderCurrentBlock() {
  const container = document.getElementById('currentBlock');
  const { usage } = calculateBlockUsage(currentYear, currentMonth, currentBlock);
  
  let statusClass = 'good', statusText = '余裕あり';
  if (usage >= 90) { statusClass = 'danger'; statusText = '余裕無し'; }
  else if (usage >= 50) { statusClass = 'caution'; statusText = '余裕少'; }

  let html = `
    <div class="block-header">
      <span class="text-xl font-bold">${blockNames[currentBlock]}ブロック</span>
      <span class="block-status ${statusClass}">${statusText}</span>
    </div>
    <div class="bg-zinc-900 rounded-b-3xl p-5 min-h-[320px]">
  `;

  const blockRequests = requests.filter(r => !r.completed && r.year === currentYear && r.month === currentMonth && r.block === currentBlock);

  if (blockRequests.length === 0) {
    html += `<div class="text-center py-20 text-zinc-500">このブロックに依頼はありません</div>`;
  } else {
    blockRequests.forEach(req => {
      html += `
        <div onclick="showTaskDetail(${req.id})" class="request-item cursor-pointer active:scale-95">
          <div class="font-medium">${req.title}</div>
          <div class="text-sm text-zinc-400 mt-1">${req.tag}</div>
          ${req.price ? `<div class="text-emerald-400 mt-2 text-lg">¥${Number(req.price).toLocaleString()}</div>` : ''}
        </div>
      `;
    });
  }
  html += `</div>`;
  container.innerHTML = html;
}

function switchBlock(block) {
  currentBlock = block;
  renderMainPage();
}

function prevMonth() {
  currentMonth--;
  if (currentMonth < 1) { currentMonth = 12; currentYear--; }
  renderAll();
}

function nextMonth() {
  currentMonth++;
  if (currentMonth > 12) { currentMonth = 1; currentYear++; }
  renderAll();
}

// ================= 緊急TODO =================
function renderUrgentTodos() {
  const container = document.getElementById('urgentTodos');
  const urgent = todos.filter(t => !t.completed && t.priority === 3)
                      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
                      .slice(0, 3);

  container.innerHTML = urgent.length === 0 
    ? `<div class="text-zinc-500 text-sm py-3">緊急TODOはありません</div>`
    : urgent.map(t => `<div onclick="openTodoEdit(${t.id})" class="urgent-todo-item cursor-pointer">${t.title}</div>`).join('');
}

// ================= 依頼登録 =================
function showRegisterModal() {
  if (tags.length === 0) {
    alert("先にタグを作成してください");
    showTagManagement();
    return;
  }
  document.getElementById('registerModal').classList.remove('hidden');
  document.getElementById('regYear').value = currentYear;
  document.getElementById('regMonth').value = currentMonth;
  document.getElementById('regBlock').value = currentBlock;

  const select = document.getElementById('tagSelect');
  select.innerHTML = '<option value="">タグを選択してください</option>';
  tags.forEach(tag => {
    const opt = document.createElement('option');
    opt.value = tag.name;
    opt.textContent = tag.name;
    select.appendChild(opt);
  });
  updateRegisterCalc();
}

function updateRegisterCalc() {
  const year = parseInt(document.getElementById('regYear').value);
  const month = parseInt(document.getElementById('regMonth').value);
  const block = document.getElementById('regBlock').value;
  const tagName = document.getElementById('tagSelect').value;

  const calcDiv = document.getElementById('calcResult');
  const warningDiv = document.getElementById('registerWarning');
  const btn = document.getElementById('registerButton');

  if (!tagName || !block || isNaN(year) || isNaN(month)) {
    calcDiv.classList.add('hidden');
    return;
  }

  const { usage } = calculateBlockUsage(year, month, block);
  const consumption = getTagConsumption(tagName);
  const newTotal = usage + consumption;

  document.getElementById('predictedUsage').textContent = `使用予定: ${newTotal}%`;
  calcDiv.classList.remove('hidden');

  if (newTotal > 100) {
    btn.disabled = true;
    warningDiv.classList.remove('hidden');
  } else {
    btn.disabled = false;
    warningDiv.classList.add('hidden');
  }
}

function registerRequest() {
  const title = document.getElementById('title').value.trim() || "無題の依頼";
  const tagName = document.getElementById('tagSelect').value;
  if (!tagName) return alert("タグを選択してください");

  const price = document.getElementById('price').value ? parseInt(document.getElementById('price').value) : null;
  const year = parseInt(document.getElementById('regYear').value);
  const month = parseInt(document.getElementById('regMonth').value);
  const block = document.getElementById('regBlock').value;

  requests.push({
    id: Date.now(),
    title,
    tag: tagName,
    price,
    year,
    month,
    block,
    completed: false,
    completedDate: null,
    memo: ''
  });

  localStorage.setItem('requests', JSON.stringify(requests));
  hideRegisterModal();
  renderAll();
}

// ================= 依頼詳細（未納品用） =================
function showTaskDetail(id) {
  currentDetailId = id;
  const req = requests.find(r => r.id === id);
  if (!req) return;

  document.getElementById('detailTitle').textContent = req.title;
  document.getElementById('detailInfo').innerHTML = `
    <div>タグ: <span class="font-medium">${req.tag}</span></div>
    <div>期間: ${req.year}年 ${req.month}月 ${blockNames[req.block]}</div>
    ${req.price ? `<div class="text-emerald-400">金額: ¥${Number(req.price).toLocaleString()}</div>` : ''}
  `;
  document.getElementById('detailPrice').value = req.price || '';
  document.getElementById('detailModal').classList.remove('hidden');
}

function completeCurrentTask() {
  const req = requests.find(r => r.id === currentDetailId);
  if (req) {
    req.completed = true;
    req.completedDate = new Date().toISOString().split('T')[0];
    localStorage.setItem('requests', JSON.stringify(requests));
    hideDetailModal();
    renderAll();
  }
}

function deleteCurrentRequest() {
  if (!currentDetailId) return;
  if (!confirm("この依頼を完全に削除しますか？\n\n削除すると元に戻せません。")) return;

  requests = requests.filter(r => r.id !== currentDetailId);
  localStorage.setItem('requests', JSON.stringify(requests));
  hideDetailModal();
  renderAll();
  updateIncome();
}

function hideDetailModal() {
  document.getElementById('detailModal').classList.add('hidden');
  currentDetailId = null;
}

// ================= 依頼移動 =================
function showMoveModal() {
  const req = requests.find(r => r.id === currentDetailId);
  if (!req) return;
  currentMoveId = currentDetailId;
  document.getElementById('moveYear').value = req.year;
  document.getElementById('moveMonth').value = req.month;
  document.getElementById('moveBlock').value = req.block;
  document.getElementById('moveModal').classList.remove('hidden');
  updateMoveCalc();
}

function updateMoveCalc() {
  const year = parseInt(document.getElementById('moveYear').value);
  const month = parseInt(document.getElementById('moveMonth').value);
  const block = document.getElementById('moveBlock').value;
  const req = requests.find(r => r.id === currentMoveId);
  if (!req) return;

  const { usage } = calculateBlockUsage(year, month, block);
  const consumption = getTagConsumption(req.tag);
  const newTotal = usage + consumption;

  document.getElementById('movePredictedUsage').textContent = `移動後使用予定: ${newTotal}%`;
  document.getElementById('moveCalcResult').classList.remove('hidden');

  const btn = document.getElementById('moveButton');
  const warning = document.getElementById('moveWarning');
  if (newTotal > 100) {
    btn.disabled = true;
    warning.classList.remove('hidden');
  } else {
    btn.disabled = false;
    warning.classList.add('hidden');
  }
}

function performMove() {
  const year = parseInt(document.getElementById('moveYear').value);
  const month = parseInt(document.getElementById('moveMonth').value);
  const block = document.getElementById('moveBlock').value;
  const req = requests.find(r => r.id === currentMoveId);
  if (!req) return;

  req.year = year;
  req.month = month;
  req.block = block;
  localStorage.setItem('requests', JSON.stringify(requests));
  hideMoveModal();
  hideDetailModal();
  renderAll();
}

function hideMoveModal() {
  document.getElementById('moveModal').classList.add('hidden');
  currentMoveId = null;
}

// ================= 納品履歴 =================
function renderCompletedPage() {
  const container = document.getElementById('completedList');
  container.innerHTML = '';

  const completedRequests = requests
    .filter(r => r.completed)
    .sort((a, b) => new Date(b.completedDate || 0) - new Date(a.completedDate || 0));

  if (completedRequests.length === 0) {
    container.innerHTML = `<div class="text-center py-20 text-zinc-500">納品済みの依頼はありません</div>`;
    return;
  }

  completedRequests.forEach(req => {
    const div = document.createElement('div');
    div.className = "bg-zinc-900 rounded-3xl p-5 active:scale-95 transition-all";

    div.innerHTML = `
      <div class="flex justify-between items-start">
        <div class="flex-1 pr-4 cursor-pointer" onclick="showCompletedDetail(${req.id}); event.stopPropagation();">
          <div class="font-medium">${req.title}</div>
          <div class="text-sm text-zinc-400 mt-1">${req.tag} ・ ${req.year}年${req.month}月 ${blockNames[req.block]}</div>
          ${req.price ? `<div class="text-emerald-400 mt-2">¥${Number(req.price).toLocaleString()}</div>` : ''}
          <div class="text-xs text-zinc-500 mt-2">納品日: ${req.completedDate || '不明'}</div>
          ${req.memo ? `<div class="todo-memo text-sm text-zinc-400 mt-3">${req.memo}</div>` : ''}
        </div>
        
        <input type="checkbox" class="todo-checkbox mt-1 scale-125" 
               ${req.followCompleted ? 'checked' : ''} 
               onchange="toggleFollowCompleted(${req.id}, this.checked); event.stopPropagation();">
      </div>
    `;

    container.appendChild(div);
  });
}

function toggleFollowCompleted(id, isChecked) {
  const req = requests.find(r => r.id === id);
  if (req) {
    req.followCompleted = isChecked;
    localStorage.setItem('requests', JSON.stringify(requests));
  }
}

function showCompletedDetail(id) {
  currentCompletedDetailId = id;
  const req = requests.find(r => r.id === id);
  if (!req) return;

  document.getElementById('completedDetailTitle').textContent = req.title;

  document.getElementById('completedDetailInfo').innerHTML = `
    <div>タグ: <span class="font-medium">${req.tag}</span></div>
    <div>期間: ${req.year}年 ${req.month}月 ${blockNames[req.block]}</div>
    ${req.price ? `<div class="text-emerald-400">金額: ¥${Number(req.price).toLocaleString()}</div>` : ''}
    <div class="text-emerald-400">納品日: ${req.completedDate || '不明'}</div>
  `;

  const memoDisplay = document.getElementById('completedMemoDisplay');
  memoDisplay.textContent = req.memo || 'メモはありません';
  memoDisplay.classList.toggle('text-zinc-500', !req.memo);
  memoDisplay.classList.toggle('italic', !req.memo);

  document.getElementById('completedDetailModal').classList.remove('hidden');
}

function editCompletedTitle() {
  const req = requests.find(r => r.id === currentCompletedDetailId);
  if (!req) return;
  const newTitle = prompt("新しいタイトルを入力してください", req.title);
  if (newTitle && newTitle.trim() !== '') {
    req.title = newTitle.trim();
    localStorage.setItem('requests', JSON.stringify(requests));
    hideCompletedDetailModal();
    renderCompletedPage();
  }
}

function editCompletedMemo() {
  const req = requests.find(r => r.id === currentCompletedDetailId);
  if (!req) return;
  const newMemo = prompt("メモを入力してください（空欄でクリア）", req.memo || '');
  req.memo = newMemo ? newMemo.trim() : '';
  localStorage.setItem('requests', JSON.stringify(requests));
  hideCompletedDetailModal();
  renderCompletedPage();
}

function deleteCompletedRequest() {
  if (!currentCompletedDetailId) return;
  if (!confirm("この納品履歴を完全に削除しますか？\n\n元に戻せません。")) return;

  requests = requests.filter(r => r.id !== currentCompletedDetailId);
  localStorage.setItem('requests', JSON.stringify(requests));
  hideCompletedDetailModal();
  renderCompletedPage();
}

function hideCompletedDetailModal() {
  document.getElementById('completedDetailModal').classList.add('hidden');
  currentCompletedDetailId = null;
}

// ================= TODO機能 =================
function renderTodos() {
  const container = document.getElementById('todoList');
  container.innerHTML = '';

  if (todos.length === 0) {
    container.innerHTML = `<div class="text-center py-16 text-zinc-500">TODOがありません</div>`;
    return;
  }

  todos.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)).forEach(t => {
    const div = document.createElement('div');
    div.className = `todo-item priority-${t.priority} ${t.completed ? 'todo-completed' : ''}`;
    div.innerHTML = `
      <input type="checkbox" class="todo-checkbox" ${t.completed ? 'checked' : ''}>
      <div class="todo-content flex-1">
        <div class="todo-title">${t.title}</div>
        ${t.memo ? `<div class="todo-memo text-sm text-zinc-400">${t.memo}</div>` : ''}
        <div class="todo-date text-xs text-zinc-500 mt-2">期限: ${t.dueDate}</div>
      </div>
    `;

    div.querySelector('input').onchange = (e) => {
      t.completed = e.target.checked;
      localStorage.setItem('todos', JSON.stringify(todos));
      renderTodos();
      renderUrgentTodos();
    };

    div.onclick = (e) => {
      if (e.target.tagName !== 'INPUT') openTodoEdit(t.id);
    };
    container.appendChild(div);
  });
}

function setPriority(prio) {
  currentPriority = prio;
  document.querySelectorAll('.priority-btn').forEach(btn => {
    const num = parseInt(btn.id.replace('prio-', ''));
    btn.classList.toggle('active', num === prio);
  });
}

function addTodo() {
  editingTodoId = null;
  currentPriority = 2;
  document.getElementById('editTitle').value = '';
  document.getElementById('editMemo').value = '';
  document.getElementById('editDate').value = new Date().toISOString().split('T')[0];
  setPriority(2);
  document.getElementById('todoEditModal').classList.remove('hidden');
}

function openTodoEdit(id) {
  editingTodoId = id;
  const t = todos.find(x => x.id === id);
  if (!t) return;

  document.getElementById('editTitle').value = t.title;
  document.getElementById('editMemo').value = t.memo || '';
  document.getElementById('editDate').value = t.dueDate;
  currentPriority = t.priority || 2;
  setPriority(currentPriority);
  document.getElementById('todoEditModal').classList.remove('hidden');
}

function saveTodoEdit() {
  const title = document.getElementById('editTitle').value.trim();
  if (!title) return alert("タイトルを入力してください");

  const memo = document.getElementById('editMemo').value.trim();
  const dueDate = document.getElementById('editDate').value;
  const priority = currentPriority;

  if (editingTodoId === null) {
    todos.push({ id: Date.now(), title, memo, dueDate, priority, completed: false });
  } else {
    const t = todos.find(x => x.id === editingTodoId);
    if (t) {
      t.title = title;
      t.memo = memo;
      t.dueDate = dueDate;
      t.priority = priority;
    }
  }

  localStorage.setItem('todos', JSON.stringify(todos));
  closeTodoEdit();
  renderTodos();
  renderUrgentTodos();
}

function deleteTodo() {
  if (!editingTodoId || !confirm("このTODOを削除しますか？")) return;
  todos = todos.filter(t => t.id !== editingTodoId);
  localStorage.setItem('todos', JSON.stringify(todos));
  closeTodoEdit();
  renderTodos();
  renderUrgentTodos();
}

function closeTodoEdit() {
  document.getElementById('todoEditModal').classList.add('hidden');
}

// ================= タグ管理 =================
function showTagManagement() {
  const container = document.getElementById('tagList');
  container.innerHTML = '';

  if (tags.length === 0) {
    container.innerHTML = `<div class="text-center py-12 text-zinc-500">タグがありません<br>下のボタンから追加してください</div>`;
  } else {
    tags.forEach((tag, i) => {
      const div = document.createElement('div');
      div.className = "bg-zinc-800 rounded-2xl p-5";
      div.innerHTML = `
        <div class="flex justify-between items-center">
          <div class="font-medium text-lg">${tag.name}</div>
          <input type="number" value="${tag.maxPerBlock || 5}" min="1" max="20"
                 class="w-20 bg-zinc-900 text-center rounded-xl px-3 py-1 text-lg"
                 onchange="updateTagMaxPerBlock(${i}, this.value)">
        </div>
        <div class="text-xs text-zinc-500 mt-4 leading-relaxed">
          1ブロックでこのタグの依頼のみを受けた際、出来る最大数を入れてください
        </div>
        <button onclick="deleteTag(${i})" class="mt-5 text-red-400 text-sm">このタグを削除</button>
      `;
      container.appendChild(div);
    });
  }

  const dataBtn = document.createElement('button');
  dataBtn.className = "w-full mt-6 py-4 bg-zinc-800 rounded-3xl font-medium text-emerald-400";
  dataBtn.textContent = "データ管理（インポート／エクスポート）";
  dataBtn.onclick = showDataModal;
  container.appendChild(dataBtn);

  document.getElementById('tagModal').classList.remove('hidden');
}

function updateTagMaxPerBlock(index, val) {
  tags[index].maxPerBlock = parseInt(val) || 5;
}

function addNewTag() {
  const name = prompt("新しいタグ名を入力（例：イラスト、ロゴ制作）");
  if (!name || name.trim() === "") return;
  if (tags.some(t => t.name === name.trim())) {
    alert("同じ名前のタグが既に存在します");
    return;
  }
  tags.push({ name: name.trim(), maxPerBlock: 5 });
  showTagManagement();
}

function deleteTag(index) {
  if (!confirm(`タグ「${tags[index].name}」を削除しますか？`)) return;
  tags.splice(index, 1);
  showTagManagement();
}

function hideTagModal() {
  document.getElementById('tagModal').classList.add('hidden');
  localStorage.setItem('tags', JSON.stringify(tags));
  renderAll();
}

// ================= キャパシティ =================
function showCapacityModal() {
  const modal = document.getElementById('capacityModal');
  let html = `
    <h2 class="text-xl font-bold mb-6 text-center">キャパシティ調整</h2>
    <div class="text-sm text-zinc-400 mb-6 text-center">${currentYear}年 ${currentMonth}月</div>
  `;

  ['upper', 'middle', 'lower'].forEach(block => {
    const rate = getCapacityRate(currentYear, currentMonth, block);
    const { usage } = calculateBlockUsage(currentYear, currentMonth, block);

    html += `
      <div class="bg-zinc-800 rounded-3xl p-6 mb-6">
        <div class="flex justify-between mb-4">
          <div class="font-medium">${blockNames[block]}ブロック</div>
          <div class="text-emerald-400">${usage}% 使用中</div>
        </div>
        <input type="range" min="30" max="100" value="${rate}" step="5"
               class="w-full accent-emerald-500 mb-2" 
               onchange="liveUpdateCapacity('${block}', this.value)">
        <div class="flex justify-between text-sm font-medium">
          <span>30%</span>
          <span id="rateValue-${block}" class="text-white">${rate}%</span>
          <span>100%</span>
        </div>
      </div>
    `;
  });

  document.getElementById('capacityContent').innerHTML = html;
  modal.classList.remove('hidden');
}

function liveUpdateCapacity(block, rate) {
  saveCapacityRate(currentYear, currentMonth, block, rate);
  document.getElementById(`rateValue-${block}`).textContent = `${rate}%`;
  renderCurrentBlock();
}

function hideCapacityModal() {
  document.getElementById('capacityModal').classList.add('hidden');
  renderAll();
}

// ================= データ管理 =================
function showDataModal() {
  importDataCache = null;
  document.getElementById('importPreview').classList.add('hidden');
  document.getElementById('importReplaceBtn').classList.add('hidden');
  document.getElementById('importMergeBtn').classList.add('hidden');
  document.getElementById('dataModal').classList.remove('hidden');
}

function hideDataModal() {
  document.getElementById('dataModal').classList.add('hidden');
}

function exportData() {
  const data = {
    version: APP_VERSION,
    requests,
    tags,
    todos,
    capacityRates,
    exportDate: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nakoki-data-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  alert('データをダウンロードしました');
}

function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(ev) {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data.requests || !data.tags) {
        alert('無効なデータファイルです');
        return;
      }
      importDataCache = data;

      const preview = document.getElementById('importPreview');
      preview.innerHTML = `
        <div class="space-y-1">
          <div>📋 依頼: <strong>${data.requests.length}</strong>件</div>
          <div>🏷️ タグ: <strong>${data.tags.length}</strong>個</div>
          <div>✅ TODO: <strong>${data.todos ? data.todos.length : 0}</strong>件</div>
        </div>
      `;
      preview.classList.remove('hidden');
      document.getElementById('importReplaceBtn').classList.remove('hidden');
      document.getElementById('importMergeBtn').classList.remove('hidden');
    } catch (err) {
      alert('JSONファイルの解析に失敗しました');
    }
  };
  reader.readAsText(file);
}

function performImport(mode) {
  if (!importDataCache) return;

  if (mode === 'replace') {
    if (!confirm('現在の全データを上書きします。本当によろしいですか？')) return;
    requests = importDataCache.requests || [];
    tags = importDataCache.tags || [];
    todos = importDataCache.todos || [];
    capacityRates = importDataCache.capacityRates || {};
  } else if (mode === 'merge') {
    if (!confirm('データをマージします。よろしいですか？')) return;
    importDataCache.requests.forEach(r => {
      if (!requests.some(ex => ex.id === r.id)) requests.push(r);
    });
    importDataCache.tags.forEach(t => {
      if (!tags.some(ex => ex.name === t.name)) tags.push(t);
    });
    if (importDataCache.todos) {
      importDataCache.todos.forEach(t => {
        if (!todos.some(ex => ex.id === t.id)) todos.push(t);
      });
    }
  }

  localStorage.setItem('requests', JSON.stringify(requests));
  localStorage.setItem('tags', JSON.stringify(tags));
  localStorage.setItem('todos', JSON.stringify(todos));
  localStorage.setItem('capacityRates', JSON.stringify(capacityRates));

  hideDataModal();
  renderAll();
  alert('インポートが完了しました');
}

// ================= 初期化 =================
window.onload = () => {
  migrateData();
  cleanupOldCompletedRequests();

  requests = requests.map(r => ({
    ...r,
    year: r.year || currentYear,
    month: r.month || currentMonth,
    block: r.block || 'upper',
    memo: r.memo || ''
  }));
  localStorage.setItem('requests', JSON.stringify(requests));

  const importInput = document.getElementById('importFile');
  if (importInput) importInput.addEventListener('change', handleImportFile);

  // Escapeキー対応
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const modals = document.querySelectorAll('.fixed.inset-0:not(.hidden)');
      if (modals.length) {
        const topModal = modals[modals.length - 1];
        if (topModal.id === 'registerModal') hideRegisterModal();
        else if (topModal.id === 'tagModal') hideTagModal();
        else if (topModal.id === 'detailModal') hideDetailModal();
        else if (topModal.id === 'moveModal') hideMoveModal();
        else if (topModal.id === 'completedDetailModal') hideCompletedDetailModal();
        else if (topModal.id === 'capacityModal') hideCapacityModal();
        else if (topModal.id === 'todoEditModal') closeTodoEdit();
        else if (topModal.id === 'dataModal') hideDataModal();
      }
    }
  });

  renderAll();
};

// ================= グローバル公開 =================
window.showRegisterModal = showRegisterModal;
window.hideRegisterModal = () => document.getElementById('registerModal').classList.add('hidden');
window.showTagManagement = showTagManagement;
window.hideTagModal = hideTagModal;
window.showCapacityModal = showCapacityModal;
window.hideCapacityModal = hideCapacityModal;
window.switchBlock = switchBlock;
window.prevMonth = prevMonth;
window.nextMonth = nextMonth;
window.showPage = showPage;
window.addTodo = addTodo;
window.openTodoEdit = openTodoEdit;
window.saveTodoEdit = saveTodoEdit;
window.deleteTodo = deleteTodo;
window.closeTodoEdit = closeTodoEdit;
window.showTaskDetail = showTaskDetail;
window.completeCurrentTask = completeCurrentTask;
window.deleteCurrentRequest = deleteCurrentRequest;
window.showMoveModal = showMoveModal;
window.updateMoveCalc = updateMoveCalc;
window.performMove = performMove;
window.hideMoveModal = hideMoveModal;
window.updateRegisterCalc = updateRegisterCalc;
window.registerRequest = registerRequest;
window.setPriority = setPriority;
window.showDataModal = showDataModal;
window.hideDataModal = hideDataModal;
window.exportData = exportData;
window.performImport = performImport;
window.showCompletedDetail = showCompletedDetail;
window.editCompletedTitle = editCompletedTitle;
window.editCompletedMemo = editCompletedMemo;
window.deleteCompletedRequest = deleteCompletedRequest;
window.hideCompletedDetailModal = hideCompletedDetailModal;
window.toggleFollowCompleted = toggleFollowCompleted;
