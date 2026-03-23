/* ============================================================
   Curves Editor — SVG canvas for tone curve editing
   ============================================================ */
const CANVAS_W = 328, CANVAS_H = 240;
const MARGIN   = 20; // inner margin in pixels
const GRID_W   = CANVAS_W - MARGIN * 2;
const GRID_H   = CANVAS_H - MARGIN * 2;

const CHANNEL_COLORS = { rgb: '#a78bfa', r: '#ef4444', g: '#22c55e', b: '#3b82f6' };
let currentChannel = 'rgb';

// Control points per channel — [input(0-255), output(0-255)]
let curves = {
  rgb: [[0,0],[255,255]],
  r:   [[0,0],[255,255]],
  g:   [[0,0],[255,255]],
  b:   [[0,0],[255,255]]
};

let draggingIdx = -1;
let canvas, ctx;

function initCurves() {
  canvas = document.getElementById('curves-canvas');
  if (!canvas) return;
  ctx = canvas.getContext('2d');
  canvas.width  = CANVAS_W;
  canvas.height = CANVAS_H;
  drawCurves();

  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup',   onMouseUp);
  canvas.addEventListener('dblclick',  onDblClick);
  canvas.addEventListener('touchstart', e => { e.preventDefault(); onMouseDown(touchToMouse(e)); }, { passive: false });
  canvas.addEventListener('touchmove',  e => { e.preventDefault(); onMouseMove(touchToMouse(e)); }, { passive: false });
  canvas.addEventListener('touchend',   e => { e.preventDefault(); onMouseUp(); },                 { passive: false });
}

function touchToMouse(e) {
  const t = e.touches[0] || e.changedTouches[0];
  return { clientX: t.clientX, clientY: t.clientY };
}

// Convert canvas pixel coords ↔ value coords (0-255)
function toCanvas(val) {
  return { x: MARGIN + (val[0]/255)*GRID_W, y: MARGIN + (1 - val[1]/255)*GRID_H };
}
function toValue(px, py) {
  return [
    Math.round(Math.max(0, Math.min(255, ((px - MARGIN) / GRID_W) * 255))),
    Math.round(Math.max(0, Math.min(255, (1 - (py - MARGIN) / GRID_H) * 255)))
  ];
}
function canvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;
  return [(e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY];
}

function findNearPoint(px, py, pts, threshold = 12) {
  for (let i = 0; i < pts.length; i++) {
    const cp = toCanvas(pts[i]);
    if (Math.hypot(cp.x - px, cp.y - py) < threshold) return i;
  }
  return -1;
}

function onMouseDown(e) {
  const [px, py] = canvasCoords(e);
  const pts = curves[currentChannel];
  const near = findNearPoint(px, py, pts);
  if (near !== -1) { draggingIdx = near; return; }
  // Add new point
  const val = toValue(px, py);
  pts.push(val);
  pts.sort((a,b) => a[0]-b[0]);
  draggingIdx = pts.findIndex(p => p === val);
  drawCurves();
  triggerPreview();
}

function onMouseMove(e) {
  if (draggingIdx === -1) return;
  const [px, py] = canvasCoords(e);
  const pts = curves[currentChannel];
  // Anchor first and last input values
  if (draggingIdx === 0) {
    pts[0][1] = toValue(px, py)[1];
  } else if (draggingIdx === pts.length - 1) {
    pts[pts.length-1][1] = toValue(px, py)[1];
  } else {
    const val = toValue(px, py);
    pts[draggingIdx] = val;
    pts.sort((a,b) => a[0]-b[0]);
    draggingIdx = pts.findIndex(p => p[0] === val[0] && p[1] === val[1]);
  }
  drawCurves();
  debouncedPreview();
}

function onMouseUp() { draggingIdx = -1; }

function onDblClick(e) {
  const [px, py] = canvasCoords(e);
  const pts = curves[currentChannel];
  const near = findNearPoint(px, py, pts);
  if (near !== -1 && near !== 0 && near !== pts.length - 1) {
    pts.splice(near, 1);
    drawCurves();
    triggerPreview();
  }
}

function drawCurves() {
  if (!ctx) return;
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // Background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const x = MARGIN + (i/4) * GRID_W;
    const y = MARGIN + (i/4) * GRID_H;
    ctx.beginPath(); ctx.moveTo(x, MARGIN); ctx.lineTo(x, MARGIN + GRID_H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(MARGIN, y); ctx.lineTo(MARGIN + GRID_W, y); ctx.stroke();
  }

  // Border
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.strokeRect(MARGIN, MARGIN, GRID_W, GRID_H);

  // Draw diagonal identity reference
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4,4]);
  ctx.beginPath();
  ctx.moveTo(MARGIN, MARGIN + GRID_H);
  ctx.lineTo(MARGIN + GRID_W, MARGIN);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw the curve
  const pts = curves[currentChannel];
  const color = CHANNEL_COLORS[currentChannel];
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (pts.length >= 2) {
    const lut = buildLUT(pts);
    let first = true;
    for (let i = 0; i <= 255; i++) {
      const cp = toCanvas([i, lut[i]]);
      if (first) { ctx.moveTo(cp.x, cp.y); first = false; }
      else ctx.lineTo(cp.x, cp.y);
    }
  }
  ctx.stroke();

  // Control points
  pts.forEach((p, i) => {
    const cp = toCanvas(p);
    ctx.beginPath();
    ctx.arc(cp.x, cp.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = i === draggingIdx ? '#fff' : color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
}

function buildLUT(pts) {
  const sorted = [...pts].sort((a,b) => a[0]-b[0]);
  const inputs  = sorted.map(p => p[0]);
  const outputs = sorted.map(p => p[1]);
  const lut = new Array(256);
  for (let i = 0; i <= 255; i++) {
    if (i <= inputs[0]) { lut[i] = outputs[0]; continue; }
    if (i >= inputs[inputs.length-1]) { lut[i] = outputs[outputs.length-1]; continue; }
    let lo = 0;
    for (let j = 0; j < inputs.length - 1; j++) {
      if (inputs[j] <= i && i < inputs[j+1]) { lo = j; break; }
    }
    const t = (i - inputs[lo]) / (inputs[lo+1] - inputs[lo]);
    lut[i] = Math.round(outputs[lo] + t * (outputs[lo+1] - outputs[lo]));
  }
  return lut;
}

// Public API
function switchChannel(ch, btn) {
  currentChannel = ch;
  document.querySelectorAll('.ch-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  drawCurves();
}

function resetCurves() {
  curves = { rgb:[[0,0],[255,255]], r:[[0,0],[255,255]], g:[[0,0],[255,255]], b:[[0,0],[255,255]] };
  drawCurves();
  triggerPreview();
}

function getCurvePayload() {
  return { curves_rgb: curves.rgb, curves_r: curves.r, curves_g: curves.g, curves_b: curves.b };
}

// Debounce for preview updates
let previewTimer = null;
function debouncedPreview() { clearTimeout(previewTimer); previewTimer = setTimeout(triggerPreview, 400); }
function triggerPreview() { if (typeof requestPreview === 'function') requestPreview(); }

// Init when DOM ready
document.addEventListener('DOMContentLoaded', initCurves);
