/* ============================================================
   Color Preview — upload, sliders, live preview, download
   ============================================================ */
let uploadedImageFile = null;
let previewDebounce   = null;

const PRESETS = {
  day:      { exposure:20, contrast:15, highlights:-20, shadows:20, whites:10, blacks:0, clarity:10, vibrance:15, saturation:10, temperature:5, tint:0 },
  night:    { exposure:60, contrast:-10, highlights:10, shadows:50, whites:0, blacks:-10, clarity:0, vibrance:0, saturation:-10, temperature:-10, tint:0 },
  vivid:    { exposure:0, contrast:20, highlights:-10, shadows:10, whites:0, blacks:0, clarity:20, vibrance:40, saturation:30, temperature:0, tint:0 },
  matte:    { exposure:5, contrast:-20, highlights:-30, shadows:30, whites:-10, blacks:20, clarity:0, vibrance:-10, saturation:-20, temperature:0, tint:0 },
  bw:       { exposure:0, contrast:10, highlights:0, shadows:0, whites:0, blacks:0, clarity:15, vibrance:0, saturation:-100, temperature:0, tint:0 },
  portrait: { exposure:10, contrast:5, highlights:-20, shadows:15, whites:0, blacks:0, clarity:0, vibrance:10, saturation:5, temperature:10, tint:5 },
  reset:    { exposure:0, contrast:0, highlights:0, shadows:0, whites:0, blacks:0, clarity:0, vibrance:0, saturation:0, temperature:0, tint:0 }
};

// ── File upload ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const fileInput = document.getElementById('image-input');
  const uploadZone = document.getElementById('upload-zone');
  if (!fileInput) return;

  fileInput.addEventListener('change', () => { if (fileInput.files[0]) handleImageFile(fileInput.files[0]); });

  ['dragenter','dragover'].forEach(e => uploadZone.addEventListener(e, ev => { ev.preventDefault(); uploadZone.classList.add('drag-over'); }));
  ['dragleave','drop'].forEach(e => uploadZone.addEventListener(e, () => uploadZone.classList.remove('drag-over')));
  uploadZone.addEventListener('drop', ev => { ev.preventDefault(); if (ev.dataTransfer.files[0]) handleImageFile(ev.dataTransfer.files[0]); });

  document.getElementById('download-btn')?.addEventListener('click', downloadFull);
});

function handleImageFile(file) {
  uploadedImageFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    const origImg = document.getElementById('orig-preview');
    if (origImg) { origImg.src = e.target.result; }
  };
  reader.readAsDataURL(file);

  document.getElementById('empty-preview').style.display = 'none';
  document.getElementById('preview-area').style.display  = 'block';
  document.getElementById('controls-card').style.display = 'block';
  document.getElementById('adj-card').style.display      = 'block';
  document.getElementById('upload-zone').style.display   = 'none';

  const info = document.getElementById('uploaded-info');
  if (info) { info.innerHTML = `<span>${file.name}</span><span>${(file.size/1024).toFixed(0)} KB</span>`; info.style.display = 'flex'; }

  requestPreview();
}

// ── Sliders ──────────────────────────────────────────────────
function onSlider(input) {
  const val = input.value;
  input.nextElementSibling.textContent = val;
  schedulePreview();
}

function getSliderValues() {
  const vals = {};
  document.querySelectorAll('.slider-group').forEach(g => {
    const key   = g.dataset.key;
    const input = g.querySelector('input[type="range"]');
    if (key && input) vals[key] = parseFloat(input.value);
  });
  return vals;
}

function setSliderValues(vals) {
  document.querySelectorAll('.slider-group').forEach(g => {
    const key   = g.dataset.key;
    const input = g.querySelector('input[type="range"]');
    const span  = g.querySelector('.slider-val');
    if (key && input && vals[key] !== undefined) {
      input.value = vals[key];
      if (span) span.textContent = vals[key];
    }
  });
}

// ── Presets ──────────────────────────────────────────────────
function applyPreset(name) {
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  const preset = PRESETS[name];
  if (!preset) return;
  setSliderValues(preset);
  if (name === 'reset') {
    if (typeof resetCurves === 'function') resetCurves();
  }
  requestPreview();
}

// ── Tab switching ────────────────────────────────────────────
function switchTab(name, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
  if (name === 'curves' && typeof initCurves === 'function') {
    setTimeout(() => { initCurves(); if (typeof drawCurves === 'function') drawCurves(); }, 50);
  }
}

// ── Preview request ──────────────────────────────────────────
function schedulePreview() {
  clearTimeout(previewDebounce);
  previewDebounce = setTimeout(requestPreview, 400);
}

function requestPreview() {
  if (!uploadedImageFile) return;
  const spinner  = document.getElementById('preview-spinner');
  const corrImg  = document.getElementById('corrected-preview');
  const status   = document.getElementById('preview-status');
  if (spinner) { spinner.style.display = 'flex'; }
  if (corrImg)  corrImg.style.display = 'none';
  if (status)   status.textContent = 'Updating preview...';

  const fd = new FormData();
  fd.append('image', uploadedImageFile);
  fd.append('sliders', JSON.stringify(getSliderValues()));
  if (typeof getCurvePayload === 'function') fd.append('curves', JSON.stringify(getCurvePayload()));

  fetch('/preview_color_correction', { method: 'POST', body: fd })
    .then(r => { if (!r.ok) throw new Error('Preview failed'); return r.blob(); })
    .then(blob => {
      const url = URL.createObjectURL(blob);
      if (corrImg) { corrImg.src = url; corrImg.style.display = 'block'; }
      if (spinner) spinner.style.display = 'none';
      if (status)  status.textContent = 'Live preview';
    })
    .catch(() => {
      if (spinner) spinner.style.display = 'none';
      if (status)  status.textContent = 'Preview error — adjustments still apply on export';
    });
}

// ── Full resolution download ─────────────────────────────────
function downloadFull() {
  if (!uploadedImageFile) return;
  const btn = document.getElementById('download-btn');
  btn.disabled = true; btn.textContent = '⏳ Processing...';

  const fd = new FormData();
  fd.append('image', uploadedImageFile);
  fd.append('sliders', JSON.stringify(getSliderValues()));
  if (typeof getCurvePayload === 'function') fd.append('curves', JSON.stringify(getCurvePayload()));

  fetch('/process_color_correction_studio', { method: 'POST', body: fd })
    .then(r => { if (!r.ok) throw new Error('Export failed'); return r.blob(); })
    .then(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'color_corrected.png';
      document.body.appendChild(a); a.click(); a.remove();
      btn.disabled = false; btn.textContent = '⬇ Download Full Resolution';
    })
    .catch(err => {
      alert('Download failed: ' + err.message);
      btn.disabled = false; btn.textContent = '⬇ Download Full Resolution';
    });
}
