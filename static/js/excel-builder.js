/* ============================================================
   Excel Builder — multi-file upload, column picker, preview
   ============================================================ */
const FILE_COLORS = ['a','b','c','d','e'];
const FILE_LABELS = ['File A','File B','File C','File D','File E'];
const MAX_FILES   = 5;

let uploadedFiles = [];   // [{file, name, rows, columns:[]}]
let commonCols    = [];
let selectedKey   = null;
let selectedJoin  = 'left';
let colSelections = {};   // { 'a': Set([colName,...]), ... }

// ─── Step indicators ───────────────────────────────────────
function setStep(n) {
  [1,2,3].forEach(i => {
    const ind = document.getElementById(`step-${i}-ind`);
    if (!ind) return;
    ind.className = 'step ' + (i < n ? 'done' : i === n ? 'active' : 'pending');
    document.getElementById(`s${i}n`).textContent = i < n ? '✓' : i;
  });
  [1,2].forEach(i => {
    const line = document.getElementById(`line-${i}`);
    if (line) line.className = 'step-line' + (i < n ? ' done' : '');
  });
  document.getElementById('step1').style.display = n === 1 ? 'block' : 'none';
  document.getElementById('step2').style.display = n === 2 ? 'block' : 'none';
}

function showError(msg) {
  const el = document.getElementById('error-banner');
  el.textContent = msg; el.style.display = msg ? 'flex' : 'none';
}
function showWarn(msg) {
  const el = document.getElementById('warn-banner');
  el.textContent = msg; el.style.display = msg ? 'flex' : 'none';
}

// ─── File handling ──────────────────────────────────────────
document.getElementById('file-picker').addEventListener('change', function() {
  addFiles([...this.files]); this.value = '';
});

const addBtn = document.getElementById('add-file-btn');
addBtn.addEventListener('dragover', e => { e.preventDefault(); addBtn.style.background = 'var(--primary-bg)'; });
addBtn.addEventListener('dragleave', () => addBtn.style.background = '');
addBtn.addEventListener('drop', e => {
  e.preventDefault(); addBtn.style.background = '';
  addFiles([...e.dataTransfer.files]);
});

function addFiles(files) {
  showError('');
  const valid = files.filter(f => f.name.match(/\.(xlsx|xls)$/i));
  if (!valid.length) { showError('Please upload Excel files (.xlsx or .xls) only.'); return; }
  const remaining = MAX_FILES - uploadedFiles.length;
  if (!remaining) { showError('Maximum 5 files reached.'); return; }
  valid.slice(0, remaining).forEach(f => {
    if (uploadedFiles.find(u => u.name === f.name)) return;
    uploadedFiles.push({ file: f, name: f.name, rows: '?', columns: [] });
    parseFile(f, uploadedFiles.length - 1);
  });
  renderFileList();
}

function parseFile(file, idx) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('idx', idx);
  fetch('/upload_excel_files', { method: 'POST', body: fd })
    .then(r => r.json())
    .then(data => {
      if (data.error) { showError(data.error); removeFile(idx); return; }
      uploadedFiles[idx].columns = data.columns;
      uploadedFiles[idx].rows    = data.rows;
      uploadedFiles[idx].preview = data.preview;
      renderFileList();
      updateContinueBtn();
    })
    .catch(() => { showError('Could not read file: ' + file.name); removeFile(idx); });
}

function removeFile(idx) {
  uploadedFiles.splice(idx, 1);
  renderFileList();
  updateContinueBtn();
}

function renderFileList() {
  const wrap = document.getElementById('file-list-wrap');
  wrap.innerHTML = uploadedFiles.map((f, i) => {
    const c = FILE_COLORS[i];
    return `<div class="file-item">
      <div class="file-bar fc-${c}"></div>
      <div class="file-item-info">
        <div class="file-item-name">${f.name}</div>
        <div class="file-item-meta">${f.rows} rows · ${f.columns.length} columns · ${FILE_LABELS[i]}</div>
      </div>
      <span class="file-item-label fl-${c}">${FILE_LABELS[i]}</span>
      <button class="file-remove" onclick="removeFile(${i})" title="Remove">×</button>
    </div>`;
  }).join('');
  const badge = document.getElementById('file-count-badge');
  badge.textContent = `${uploadedFiles.length} / 5 files`;
  badge.className   = `badge ${uploadedFiles.length ? 'badge-green' : 'badge-gray'}`;
  const addBtn = document.getElementById('add-file-btn');
  addBtn.style.display = uploadedFiles.length >= MAX_FILES ? 'none' : 'flex';
  addBtn.textContent = `＋ Add Excel file (${MAX_FILES - uploadedFiles.length} remaining)`;
}

function updateContinueBtn() {
  const btn = document.getElementById('continue-btn');
  const allParsed = uploadedFiles.length >= 1 && uploadedFiles.every(f => f.columns.length > 0);
  btn.disabled = !allParsed;
}

// ─── Step 2 ──────────────────────────────────────────────
function continueToStep2() {
  showError('');
  // Find common columns
  if (uploadedFiles.length < 1) return;
  let common = new Set(uploadedFiles[0].columns);
  uploadedFiles.slice(1).forEach(f => {
    const s = new Set(f.columns);
    common = new Set([...common].filter(c => s.has(c)));
  });
  commonCols = [...common];
  if (!commonCols.length) {
    showError('No common column names found across all files. Files must share at least one column name to merge.');
    return;
  }
  selectedKey = commonCols[0];
  // Init selections — all selected except key
  colSelections = {};
  uploadedFiles.forEach((f, i) => {
    const letter = FILE_COLORS[i];
    colSelections[letter] = new Set(f.columns.filter(c => c !== selectedKey));
  });
  renderKeyChips();
  renderPickerGrid();
  renderPreview();
  setStep(2);
}

function backToStep1() { setStep(1); }

function renderKeyChips() {
  const wrap = document.getElementById('key-chips');
  wrap.innerHTML = commonCols.map(col => {
    const presentIn = uploadedFiles.map((f,i) => f.columns.includes(col) ? FILE_LABELS[i].replace('File ','') : null).filter(Boolean).join(', ');
    return `<div class="key-chip ${col===selectedKey?'selected':''}" onclick="selectKey('${col}')">
      🔑 ${col}
      <span class="chip-files">${presentIn}</span>
    </div>`;
  }).join('');
}

function selectKey(col) {
  selectedKey = col;
  renderKeyChips();
  renderPickerGrid();
  renderPreview();
}

function selectJoin(el, join) {
  document.querySelectorAll('.join-opt').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
  selectedJoin = join;
}

function renderPickerGrid() {
  const grid = document.getElementById('picker-grid');
  const cols = uploadedFiles.length;
  grid.style.gridTemplateColumns = `repeat(${Math.max(cols,1)}, 1fr)`;

  grid.innerHTML = uploadedFiles.map((f, i) => {
    const letter = FILE_COLORS[i];
    const sel    = colSelections[letter] || new Set();
    const items  = f.columns.map(col => {
      if (col === selectedKey) return `<div class="col-item key-col"><div class="col-checkbox">🔑</div>${col}</div>`;
      const isSelected = sel.has(col);
      return `<div class="col-item ${isSelected?'selected':''}" onclick="toggleCol('${letter}','${col.replace(/'/g,"\\'")}',this)">
        <div class="col-checkbox">${isSelected?'✓':''}</div>${col}
      </div>`;
    }).join('');
    const colors = {a:'#6c47ff',b:'#16a34a',c:'#ea580c',d:'#0891b2',e:'#db2777'};
    return `<div class="picker-col">
      <div class="picker-col-header">
        <div class="picker-col-dot" style="background:${colors[letter]}"></div>
        <div><div class="picker-col-name">${FILE_LABELS[i]}</div><div class="picker-col-meta">${f.name}</div></div>
      </div>
      <div class="picker-col-items">${items}</div>
    </div>`;
  }).join('');
}

function toggleCol(letter, col, el) {
  const sel = colSelections[letter] || new Set();
  if (sel.has(col)) sel.delete(col); else sel.add(col);
  colSelections[letter] = sel;
  el.classList.toggle('selected');
  el.querySelector('.col-checkbox').textContent = sel.has(col) ? '✓' : '';
  renderPreview();
}

function selectAllCols() {
  uploadedFiles.forEach((f, i) => {
    const letter = FILE_COLORS[i];
    colSelections[letter] = new Set(f.columns.filter(c => c !== selectedKey));
  });
  renderPickerGrid(); renderPreview();
}
function clearAllCols() {
  uploadedFiles.forEach((_, i) => colSelections[FILE_COLORS[i]] = new Set());
  renderPickerGrid(); renderPreview();
}

function getAllSelectedCols() {
  const cols = [{ file: 0, col: selectedKey, label: '🔑', letter: FILE_COLORS[0] }];
  uploadedFiles.forEach((f, i) => {
    const letter = FILE_COLORS[i];
    const sel    = colSelections[letter] || new Set();
    [...sel].forEach(c => cols.push({ file: i, col: c, label: FILE_LABELS[i].replace('File ',''), letter }));
  });
  return cols;
}

function renderPreview() {
  const selected = getAllSelectedCols();
  const colCount = selected.length;
  document.getElementById('col-count-badge').textContent = `${colCount} column${colCount!==1?'s':''}`;

  // Build header
  const head = document.getElementById('preview-head');
  head.innerHTML = selected.map(s => {
    const colors = {a:'#ede9fe;color:#6c47ff;border-color:#c4b5fd',b:'#dcfce7;color:#16a34a;border-color:#86efac',c:'#fff7ed;color:#ea580c;border-color:#fdba74',d:'#e0f7fa;color:#0891b2;border-color:#67e8f9',e:'#fce7f3;color:#db2777;border-color:#f9a8d4'};
    return `<th>${s.col}<span class="src-badge" style="background:${colors[s.letter]}">${s.label}</span></th>`;
  }).join('');

  // Build preview rows from first file's data
  const body = document.getElementById('preview-body');
  const firstFile = uploadedFiles[0];
  if (!firstFile || !firstFile.preview || !firstFile.preview.length) {
    body.innerHTML = `<tr><td colspan="${colCount}" style="text-align:center;color:var(--text-faint);padding:20px;">Select columns to see preview</td></tr>`;
  } else {
    body.innerHTML = firstFile.preview.slice(0,3).map(row =>
      `<tr>${selected.map(s => `<td>${row[s.col] !== undefined ? row[s.col] : '<span style="color:#ddd">—</span>'}</td>`).join('')}</tr>`
    ).join('');
  }

  // Summary
  const rowEstimate = uploadedFiles[0]?.rows || '?';
  document.getElementById('action-summary').textContent =
    `~${rowEstimate} rows · ${colCount} columns · from ${uploadedFiles.length} file${uploadedFiles.length!==1?'s':''} · joined on "${selectedKey}"`;
  showWarn('');
}

// ─── Build & Download ────────────────────────────────────
function buildAndDownload() {
  showError(''); showWarn('');
  if (!selectedKey) { showError('Please select a join key column.'); return; }

  const btn = document.getElementById('build-btn');
  btn.disabled = true; btn.textContent = '⏳ Building...';

  const payload = {
    key_col: selectedKey,
    join_type: selectedJoin,
    files: uploadedFiles.map((f, i) => ({
      index: i,
      letter: FILE_COLORS[i],
      selected_cols: [...(colSelections[FILE_COLORS[i]] || [])]
    }))
  };

  // Build FormData with files + config
  const fd = new FormData();
  uploadedFiles.forEach((f, i) => fd.append(`file_${i}`, f.file));
  fd.append('config', JSON.stringify(payload));

  fetch('/process_excel_multi', { method: 'POST', body: fd })
    .then(r => {
      if (!r.ok) return r.text().then(t => { throw new Error(t); });
      if (r.headers.get('X-Warning')) showWarn(r.headers.get('X-Warning'));
      return r.blob();
    })
    .then(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'merged.xlsx';
      document.body.appendChild(a); a.click(); a.remove();
      setStep(3);
      btn.disabled = false; btn.textContent = '⬇ Build & Download Excel';
    })
    .catch(err => {
      showError(err.message || 'Merge failed. Please try again.');
      btn.disabled = false; btn.textContent = '⬇ Build & Download Excel';
    });
}

// Init
setStep(1);
