# tux-talk — UI Redesign & Tool Enhancement Design

**Date:** 2026-03-23
**Status:** Approved by user
**Delivery strategy:** Option C — Parallel: Design System + Features Together
**Visual design:** Option B — Clean SaaS (white/light background, purple accent)

---

## 1. Overview

Full redesign of tux-talk (Flask PWA) from basic Bootstrap to a **Clean SaaS design system (visual style: Option B)**, delivered simultaneously with two major tool enhancements: Excel Merge (multi-file, flexible column builder) and Color Correction (studio-level editor). All other tool pages receive the new design and minor improvements. The delivery uses **Option C strategy** (design system + features built in parallel), not Option B strategy.

---

## 2. Design System

### 2.1 Color Palette
| Token | Value | Usage |
|---|---|---|
| Primary gradient | `#6c47ff → #a855f7` | Buttons, accents, logo |
| Text dark | `#1a1a2e` | Headings, body text |
| Text muted | `#888` | Descriptions, meta |
| Page background | `#f4f6fb` | Main page bg |
| Card background | `#ffffff` | All cards and panels |
| Border | `#e8ecf3` | Card borders, dividers |
| Success | `#16a34a` | Done states, green badges |
| Warning | `#ca8a04` | Processing states |

### 2.2 Typography
- Font: System stack — `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
- H1 page title: 28px / weight 800
- H2 section heading: 16px / weight 700
- Body: 13–14px / weight 400
- Caption/meta: 11px / weight 400
- Label (uppercase): 10px / weight 700 / letter-spacing 0.06em

### 2.3 Border Radius
- Badges/tags: 6px
- Inputs/buttons: 10px
- Cards/panels: 14–16px
- Avatars/dots: 50%

### 2.4 Elevation
- Level 1: `0 1px 6px rgba(0,0,0,0.06)` — nav
- Level 2: `0 2px 8px rgba(0,0,0,0.08)` — default cards
- Level 3: `0 6px 20px rgba(108,71,255,0.12)` — hover/focused cards
- Level 4: `0 12px 40px rgba(0,0,0,0.15)` — modals, dropdowns

### 2.5 Shared Component Library (base.css)
A single `static/css/base.css` file provides all shared styles. All templates extend a `base.html` layout. No more inline styles in individual templates.

---

## 3. Shared Layout (base.html)

Every page shares:
- **Top nav**: logo (⚡ tux-talk), pill navigation (Tools / Recent / Settings), search bar, user avatar
- **Breadcrumb**: `Tools › [Tool Name]` on tool pages
- **Page background**: `#f4f6fb`
- **Footer**: `tux-talk © 2026` — minimal, centered

---

## 4. Homepage (index.html)

### Layout
- **Hero section**: headline "Your everyday AI-powered toolkit", subtext, three stats (7 Tools / 5 AI-powered / PWA Offline)
- **Tool grid**: 4-column responsive grid of tool cards (8 cards including a "Coming Soon" placeholder)
- **Bottom row**: Recent Activity panel (left) + Quick Tips sidebar (right)

### Tool Cards
Each card shows:
- Colored icon background (unique per tool)
- Tool name (bold)
- Short description (2 lines max)
- Badge: AI / Enhanced / Studio / Pro
- "Open tool →" CTA

---

## 5. Excel Merge Tool — Full Enhancement

### 5.1 Behaviour
- Upload **1–5 Excel files** (.xlsx, .xls)
- Each file is assigned a color label: File A (purple), B (green), C (orange), D (teal), E (pink)
- Backend detects **common column names** for the join key selector: the **intersection** of column names across all uploaded files. This is separate from the per-file column picker which shows each file's full column list independently.
- User selects a **key/join column** — must appear in **all** uploaded files. Files that do not contain the key column are rejected at upload with a clear error message ("File X does not contain column Y — cannot be used as join key").
- User selects a **join type**: Left Join (keep all rows from File A), Inner Join (only matching rows), or Outer Join (all rows from all files)
- User **picks columns** from each file independently using a checkbox grid — all columns in a file are available for selection regardless of whether they appear in other files
- Live **output preview** (first 3 rows) updates as columns are selected
- User clicks **Build & Download** to receive merged `.xlsx`

### 5.2 UI Flow (3 steps)
1. **Step 1 — Upload**: Drag-and-drop or click to upload. Shows file list with color badges and row/column counts. "Add another file" button (hidden when 5 reached).
2. **Step 2 — Pick Columns**: Key column selector, join type selector, 5-column picker grid (greyed for unloaded files), live output preview table.
3. **Step 3 — Download**: Processed file download triggered automatically. "Start Over" button.

### 5.3 Backend Changes (app.py)
- New route: `POST /upload_excel_files` — accepts 1–5 files, stores in session or temp, returns detected common columns and per-file column lists as JSON
- New route: `POST /process_excel_multi` — accepts file data + column selections + join config, performs multi-file pandas merge chain, returns `.xlsx`
- Merge logic: iterative left/inner/outer merge using `pandas.merge()` on the key column, chaining file by file (A+B → result_AB → result_AB+C → etc.). The key column must exist in all files; validated at upload time.
- Column conflict resolution: when two files have a non-key column with the same name, suffix them with `_A`, `_B` etc. to avoid pandas merge suffix collisions.

### 5.4 Error States
| Scenario | User-facing message |
|---|---|
| File cannot be parsed | "Could not read [filename] — ensure it is a valid .xlsx or .xls file." |
| File missing key column | "File [X] does not have column '[key]'. Choose a different key or remove this file." |
| Key column type mismatch | "Key column '[key]' has different data types across files. Values may not match correctly." (warning, not block) |
| Zero matching rows on Inner Join | "No rows matched across all files on column '[key]'. Try Left or Outer join." |
| Empty file (0 rows) | "File [X] has no data rows and will be skipped." |

### 5.5 Session Handling
- All uploaded files are written to `/tmp/tuxtalk_<session_id>/` immediately on upload. No in-memory file storage.
- Add `flask-session` (filesystem backend) to manage session-level temp directory paths.
- Temp directory is deleted after the merged file is downloaded, or after 30 minutes of inactivity via a cleanup function.
- Add `flask-session>=0.4.0` to requirements.txt.

---

## 6. Color Correction Tool — Studio Enhancement

### 6.1 Behaviour
- Upload image (JPG, PNG, WEBP)
- Live preview shows original and corrected side-by-side
- Full studio adjustment panel with two tabs: **Adjustments** and **Curves**
- Adjustments trigger a **server-side preview request** (debounced 400ms). The browser sends current slider values + curve points to `POST /preview_color_correction`, which returns a downscaled JPEG preview (max 800px wide) for fast turnaround. Client-side canvas is not used for colour processing — server is authoritative for both preview and final export. This avoids preview/export mismatch.

### 6.2 Adjustment Sliders (Tab 1)
| Slider | Range | Default | Backend implementation |
|---|---|---|---|
| Exposure | -2.0 to +2.0 EV | 0 | Multiply pixel values by `2^EV` |
| Contrast | -100 to +100 | 0 | Pillow `ImageEnhance.Contrast` |
| Highlights | -100 to +100 | 0 | Tone-map bright region via LAB |
| Shadows | -100 to +100 | 0 | Tone-map dark region via LAB |
| Whites | -100 to +100 | 0 | Clip/boost near-white pixels |
| Blacks | -100 to +100 | 0 | Clip/crush near-black pixels |
| Clarity | 0 to +100 | 0 | Unsharp mask on mid-tones |
| Vibrance | -100 to +100 | 0 | Boost low-saturation colours more |
| Saturation | -100 to +100 | 0 | `cv2.cvtColor` → HSV S channel |
| Temperature | -100 to +100 | 0 | Shift R/B channels (warm/cool) |
| Tint | -100 to +100 | 0 | Shift G channel (green/magenta) |

### 6.3 Curves Editor (Tab 2)
- Interactive SVG canvas (400×300px)
- Shows RGB composite curve and individual R, G, B channel curves (toggle via channel selector)
- Click/drag to add control points; double-click to remove
- Histogram drawn behind curve (luminosity)
- **Default state**: straight diagonal from `[0, 0]` to `[255, 255]` — two fixed anchor points, no adjustment
- Curve output sent to backend as array of `[input, output]` control points (0–255), minimum 2 points always (the anchors). If fewer than 2 points exist, backend treats it as identity (no adjustment).
- Backend validates: clamps all values to 0–255, sorts by input value, then interpolates a 256-entry LUT via `numpy.interp`. Malformed or empty arrays fall back to identity LUT.
- **JSON payload shape** — the frontend always sends all four keys regardless of which tab is active:
  ```json
  {
    "curves_rgb": [[0,0],[255,255]],
    "curves_r":   [[0,0],[255,255]],
    "curves_g":   [[0,0],[255,255]],
    "curves_b":   [[0,0],[255,255]]
  }
  ```
  Unused channels default to the identity line `[[0,0],[255,255]]`. Backend applies per-channel curves (R, G, B) first, then the composite RGB curve.
- `excel_tool_options.html` is removed; the old `POST /process_excel` route redirects to `GET /excel_tool`.

### 6.4 Preset Modes
- Retain original Day / Night quick-fix buttons as **presets** that auto-populate sliders
- Add: Vivid, Matte, B&W, Portrait, Landscape presets

### 6.5 Backend Changes (app.py)
- New route: `POST /preview_color_correction` — accepts image (stored in session temp file after upload) + JSON slider values + curve points; returns downscaled JPEG (max 800px) for live preview
- New route: `POST /process_color_correction_studio` — same inputs, returns full-resolution PNG for download
- Processing pipeline (OpenCV + Pillow + NumPy):
  1. Exposure (multiply)
  2. Whites/Blacks (LUT clip)
  3. Shadows/Highlights (LAB tone mapping)
  4. Contrast (PIL ImageEnhance)
  5. Temperature/Tint (channel shift)
  6. Curves (LUT via numpy.interp)
  7. Clarity (unsharp mask)
  8. Vibrance/Saturation (HSV)
- Returns processed image as PNG

---

## 7. Other Tool Pages — Design + Minor Improvements

### 7.1 Speech to Text
- New Clean SaaS layout
- Add language options: English (US), English (UK), Sinhala, French, Spanish, German
- Auto-copy to clipboard button
- Character/word count display

### 7.2 Background Remover
- New layout: drag-and-drop upload zone, side-by-side before/after preview
- Add: checkerboard pattern behind transparent PNG preview
- Keep AI model unchanged

### 7.3 Sketch Converter
- New layout: upload → preview → download
- Add slider for **sketch intensity** (controls Gaussian blur radius). HTML slider: `min="3" max="51" step="2"` to guarantee odd values. Backend also rounds to nearest odd number as a safety guard before passing to `cv2.GaussianBlur`.

### 7.4 PDF Tools
- New layout with tool sub-cards for each PDF action
- **Fix** PDF→Word: extract text from PDF using `PyPDF2` (text-based PDFs only; scanned/image PDFs are out of scope and will show a clear "This PDF contains no extractable text" message), then write into a `.docx` using `python-docx` with proper paragraph structure.
- **Fix** PDF→Excel: extract text from PDF using `PyPDF2`, attempt to detect tabular structure by splitting on whitespace alignment. Output is best-effort — a clear disclaimer is shown: "Works best with structured text tables. Scanned PDFs are not supported."
- Keep merge, split, rotate, convert to JPG unchanged

### 7.5 Image Upscaling
- New layout
- Add 2× option alongside 4× (EDSR_x4 at half scale for 2× output)
- Show before/after file size comparison

---

## 8. Architecture

### 8.1 File Structure After Refactor
```
templates/
  base.html              ← NEW: shared layout
  index.html             ← redesigned
  speech_to_text.html    ← redesigned
  remove_background.html ← redesigned
  sketch.html            ← redesigned
  excel_tool.html        ← rebuilt (multi-file upload)
  excel_tool_options.html← replaced by new column picker (merged into excel_tool.html)
  pdf_tool.html          ← redesigned + fixes
  color_correction.html  ← rebuilt (studio editor)
  image_upscaling.html   ← redesigned

static/
  css/
    base.css             ← NEW: shared design system styles
  js/
    color-curves.js      ← NEW: SVG curves editor
    color-preview.js     ← NEW: client-side live preview
    excel-builder.js     ← NEW: column picker interactions
  manifest.json
  service-worker.js
  logo.png
  icons/
```

### 8.2 Backend (app.py)
- Add routes: `POST /upload_excel_files`, `POST /process_excel_multi`, `POST /preview_color_correction`, `POST /process_color_correction_studio`
- Deprecate: `POST /process_excel` (old two-file merge) — redirect to `GET /excel_tool` so no TemplateNotFound error occurs; `excel_tool_options.html` is deleted entirely.
- Keep all other existing routes unchanged

### 8.3 New Dependencies
```
# requirements.txt additions
numpy>=1.24.0         # curve LUT interpolation (likely already present via opencv)
Pillow>=10.0.0        # contrast, image enhance
flask-session>=0.4.0  # server-side session for temp file path storage
```

---

## 9. Out of Scope
- User authentication / login
- Cloud storage / file persistence between sessions
- Mobile-specific native app features
- Rate limiting / API keys

---

## 10. Success Criteria
- All 7 tool pages use the new Clean SaaS design system
- Excel Merge accepts up to 5 files, detects common columns, allows per-file column selection, and produces a correctly merged `.xlsx`
- Color Correction shows real-time preview with all 11 sliders + curves editor and exports high-quality result
- PDF→Word and PDF→Excel produce usable output
- All existing tool functionality is preserved (no regressions)
- PWA manifest and service worker remain functional
