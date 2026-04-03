# Night Sky Library + Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the blank no-books state with an animated night-sky library screen, add a full-screen Studio for authoring and designing books, and make the bottom bar fully configurable.

**Architecture:** All new code lives as additional `§` sections inside `index.html`'s single inline `<script type="module">`, following the existing pattern. The sky is a `position:fixed` overlay that covers everything except `#bottom-bar`. The Studio is a second full-screen overlay opened from the bottom bar. A shared token store drives both CSS custom properties and the sky canvas renderer. No new files are created.

**Tech Stack:** Vanilla JS (inline module) · Canvas 2D · IndexedDB (existing `§1 DB`) · localStorage · CSS custom properties

**Branch:** `feature/night-sky-library-studio` — single branch, staged commits, one PR at the end.

---

## File Map

All changes are inside `index.html`. No new files.

| Area | Change |
|---|---|
| `<style>` block | Add CSS for: sky overlay, timeline, studio overlay, studio nav, token UI, author UI, toolbar edit mode, primitives UI |
| `<body>` before `#bottom-bar` | Add: `#sky-overlay` (2 canvases + HUD + tooltip + back button), `#studio-overlay` (nav + section panes) |
| `<script type="module">` | Add §15 SKY · §16 TOOLBAR · §17 STUDIO · §18 TOKENS · §19 AUTHOR · §20 PRIMITIVES |
| §14 APP `init()` | Replace `openBookshelf()` in `no_books` catch only with `initSkyLibrary()` — `book_not_found` keeps original bookshelf behaviour |
| `#bottom-bar` CSS | Increase `z-index` from `30` to `150` so bottom bar stays visible above sky and studio overlays |

---

## Testing Strategy

There is no test runner configured. Pure-logic functions (token resolution, constellation assignment, toolbar config serialisation) must be **extractable** — written as named functions with no DOM/canvas dependencies so they can be copy-pasted into a browser console or a future test harness. Each stage includes a **smoke test** checklist to verify before committing.

---

## Stage 1 — Sky + Timeline (`§15 SKY`)

Integrate the night sky screen into `index.html`. Sky covers everything except `#bottom-bar`. After the burst animation, shows a horizontal chronological timeline (not radial). Book opening navigates via `?id=`. Closing has two modes: instant and reverse-burst.

### Task 1.1 — CSS + HTML skeleton

**Files:** Modify `index.html` CSS block · Modify `index.html` body

- [ ] Add sky overlay CSS to the `<style>` block, after the existing `#bookshelf-panel` styles:

```css
/* ── Sky Library ─────────────────────────────────────────── */
#sky-overlay {
  position: fixed; inset: 0; bottom: 0; z-index: 100;
  display: none; flex-direction: column;
  background: #080406;
}
#sky-overlay.active { display: flex; }
#sky-bg, #sky-main {
  position: absolute; inset: 0; width: 100%; height: 100%;
}
#sky-main { z-index: 1; }
#sky-hud {
  position: absolute; top: 16px; left: 0; right: 0;
  display: flex; justify-content: center; gap: 8px;
  z-index: 20; pointer-events: none;
}
.sky-pill {
  font-size: 9px; letter-spacing: .18em; text-transform: uppercase;
  color: rgba(200,185,230,0.45); font-family: Georgia,serif;
  border: 0.5px solid rgba(200,185,230,0.12); padding: 3px 10px; border-radius: 20px;
}
#sky-back-btn {
  position: absolute; top: 14px; left: 16px; z-index: 30; display: none;
  background: none; border: 0.5px solid rgba(200,185,230,0.25);
  color: rgba(200,185,230,0.7); font-family: Georgia,serif; font-size: 11px;
  padding: 4px 12px; border-radius: 20px; cursor: pointer; letter-spacing: .08em;
}
#sky-back-btn:hover { border-color: rgba(200,185,230,0.6); color: rgba(200,185,230,1); }
#sky-recenter-btn {
  position: absolute; top: 14px; right: 16px; z-index: 30; display: none;
  background: none; border: 0.5px solid rgba(200,185,230,0.25);
  color: rgba(200,185,230,0.7); font-family: Georgia,serif; font-size: 11px;
  padding: 4px 12px; border-radius: 20px; cursor: pointer; letter-spacing: .08em;
}
#sky-recenter-btn:hover { border-color: rgba(200,185,230,0.6); color: rgba(200,185,230,1); }
#sky-tooltip {
  position: absolute; pointer-events: none; z-index: 40; display: none;
  background: rgba(8,3,14,0.95); border: 0.5px solid rgba(220,160,200,0.25);
  border-radius: 10px; padding: 12px 16px; max-width: 240px;
}
#sky-tooltip h3 { font-family: Georgia,serif; font-size: 13px; color: #f0e0ff; font-weight: 400; margin-bottom: 2px; }
#sky-tooltip .sky-tt-meta { font-size: 10px; color: rgba(220,160,200,0.7); margin-bottom: 6px; font-family: Georgia,serif; }
#sky-tooltip p { font-size: 11px; color: rgba(210,190,230,0.75); line-height: 1.6; font-family: Georgia,serif; }
#sky-tooltip .sky-open-btn {
  margin-top: 8px; display: block; font-size: 10px; letter-spacing: .1em;
  text-transform: uppercase; color: rgba(220,180,255,0.8);
  border: 0.5px solid rgba(220,180,255,0.3); padding: 4px 10px;
  border-radius: 20px; text-align: center; background: none; cursor: pointer;
  font-family: Georgia,serif; width: 100%; pointer-events: auto;
}
#sky-tooltip .sky-open-btn:hover { color: #fff; border-color: rgba(220,180,255,0.8); }
```

- [ ] Add sky overlay HTML immediately before `#bottom-bar` in `<body>`:

```html
<div id="sky-overlay" aria-label="Night Sky Library" role="region">
  <canvas id="sky-bg" aria-hidden="true"></canvas>
  <canvas id="sky-main" aria-hidden="true"></canvas>
  <div id="sky-hud" aria-hidden="true">
    <span class="sky-pill">Eras</span>
    <span class="sky-pill">·</span>
    <span class="sky-pill">Regions</span>
    <span class="sky-pill">·</span>
    <span class="sky-pill">Themes</span>
  </div>
  <button id="sky-back-btn" type="button">← sky</button>
  <button id="sky-recenter-btn" type="button">⊙ recenter</button>
  <div id="sky-tooltip" role="status" aria-live="polite">
    <h3 id="sky-tt-title"></h3>
    <p class="sky-tt-meta" id="sky-tt-meta"></p>
    <p id="sky-tt-desc"></p>
    <button class="sky-open-btn" id="sky-tt-open" type="button">Open book →</button>
  </div>
</div>
```

- [ ] Increase `#bottom-bar` z-index from 30 to 150 in the existing CSS so it stays visible above both overlays (sky at z-index 100, studio at 110):

```css
/* Change existing rule: */
#bottom-bar {
  /* ... existing properties ... */
  position: relative; z-index: 150;   /* was 30 */
}
```

- [ ] Smoke test: open `index.html` with no books in IDB. Page still loads without errors. `#sky-overlay` is in the DOM but invisible (`display:none`). Bottom bar is visible above the sky when sky is active.

### Task 1.2 — §15 SKY: background canvas + sky state

**Files:** Modify `index.html` script block — add `§15 SKY` after `§14 APP`

- [ ] Add the section marker and sky data (books + constellations). Port from `night_sky_library.html`, updating the colour palette to match the spec (`#080406` deep space, `#C084D4` eras, `#7FCEBC` regions, `#E87AAF` themes):

```javascript
// ── §15 SKY ───────────────────────────────────────────────────────────────────

const SKY_BOOKS = [
  { id:'sappho',    title:"Sappho's Fragments",       author:'Sappho',             year:-600, region:'Greece',  theme:'Desire',    summary:"The earliest surviving poems of female desire — lyric fragments from the isle of Lesbos.",     cover:'#7b4fa6' },
  { id:'philips',   title:'Poems',                    author:'Katherine Philips',  year:1656, region:'Wales',   theme:'Devotion',  summary:"Passionate verse to women friends using the language of marriage and devotion.",              cover:'#a64f7b' },
  { id:'behn',      title:'To the Fair Clarinda',     author:'Aphra Behn',         year:1683, region:'England', theme:'Desire',    summary:"A poem celebrating erotic ambiguity — desire between women made brazen and beautiful.",        cover:'#6a4fa6' },
  { id:'lister',    title:'The Diaries',              author:'Anne Lister',        year:1835, region:'England', theme:'Identity',  summary:"Coded diaries of a Yorkshire landowner who called herself a gentleman and lived openly with women.", cover:'#4f7ba6' },
  { id:'well',      title:'The Well of Loneliness',   author:'Radclyffe Hall',     year:1928, region:'England', theme:'Exile',     summary:"The most famous early lesbian novel in English — banned on publication.",                       cover:'#a6754f' },
  { id:'orlando',   title:'Orlando',                  author:'Virginia Woolf',     year:1929, region:'England', theme:'Identity',  summary:"A fantasy biography crossing centuries and genders — a love letter to Vita Sackville-West.",    cover:'#4fa685' },
  { id:'dalloway',  title:'Mrs Dalloway',             author:'Virginia Woolf',     year:1925, region:'England', theme:'Desire',    summary:"Clarissa's memory of kissing Sally Seton — one of literature's most exquisite moments of female desire.", cover:'#7ba64f' },
  { id:'carol',     title:'The Price of Salt',        author:'Patricia Highsmith', year:1952, region:'USA',     theme:'Desire',    summary:"One of the first lesbian novels with a happy ending. Later known as Carol.",                      cover:'#a64f4f' },
  { id:'unicorn',   title:'The Black Unicorn',        author:'Audre Lorde',        year:1978, region:'USA',     theme:'Identity',  summary:"Poetry weaving African mythology, Blackness and lesbian desire.",                              cover:'#4f6aa6' },
  { id:'zami',      title:'Zami: A Biomythography',   author:'Audre Lorde',        year:1983, region:'USA',     theme:'Community', summary:"A Black Caribbean-American lesbian life traced from childhood through love and community.",         cover:'#9b4fa6' },
  { id:'color',     title:'The Color Purple',         author:'Alice Walker',       year:1982, region:'USA',     theme:'Desire',    summary:"Celie and Shug Avery — one of American literature's great love stories.",                         cover:'#a6904f' },
  { id:'oranges',   title:'Oranges Are Not the Only Fruit', author:'Jeanette Winterson', year:1990, region:'England', theme:'Faith', summary:"A girl discovers her lesbianism in a Pentecostal household. Won the Whitbread.",               cover:'#4fa6a6' },
];

const SKY_CONSTELLATIONS = [
  {
    id:'eras', label:'Through Time', sublabel:'Eras',
    color:{ h:270, s:65, l:72 },  // --sky-const-eras-hue
    cx:0.22, cy:0.42,
    stars:[{x:.10,y:.30},{x:.18,y:.22},{x:.26,y:.38},{x:.20,y:.48},{x:.14,y:.55},{x:.30,y:.52}],
    lines:[[0,1],[1,2],[2,3],[3,4],[4,5],[2,5]],
    bookIds:['sappho','philips','behn','lister','well','orlando'],
  },
  {
    id:'regions', label:'Across the World', sublabel:'Regions',
    color:{ h:175, s:60, l:68 }, // --sky-const-regions-hue
    cx:0.60, cy:0.30,
    stars:[{x:.50,y:.20},{x:.58,y:.14},{x:.66,y:.22},{x:.72,y:.34},{x:.62,y:.40},{x:.52,y:.35}],
    lines:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[0,4]],
    bookIds:['dalloway','carol','unicorn','zami','color','oranges'],
  },
  {
    id:'themes', label:'Desire · Exile · Faith', sublabel:'Themes',
    color:{ h:330, s:60, l:70 }, // --sky-const-themes-hue
    cx:0.55, cy:0.68,
    stars:[{x:.42,y:.60},{x:.50,y:.70},{x:.60,y:.62},{x:.68,y:.72},{x:.56,y:.78},{x:.46,y:.75}],
    lines:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[1,4]],
    bookIds:['sappho','lister','well','carol','unicorn','oranges'],
  },
];
```

- [ ] Add canvas setup, background star generation, `drawBg()` — two-canvas architecture. The bg canvas is drawn once; only main canvas redraws each frame. Use token-aware colours (see Task 1.5 for the bridge — for now hard-code, replace in Stage 4):

```javascript
let _skyW, _skyH, _skyDpr;
let _skyBgStars = [];
let _skyT = 0;
let _skyFrame = null;
let _skyState = 'sky'; // 'sky' | 'burst' | 'timeline'
let _skyBurstProgress = 0;
let _skyBurstReverse = false;
let _skyActiveConst = null;
let _skyHoveredConst = null;
let _skyBookNodes = [];
let _skyHoveredBook = null;
let _skyZoom = 1;
let _skyPanX = 0;
let _skyTargetZoom = 1;
let _skyTargetPanX = 0;

function skyEl(id) { return document.getElementById(id); }

function skyResize() {
  const wrap = skyEl('sky-overlay');
  _skyDpr = window.devicePixelRatio || 1;
  _skyW = wrap.clientWidth;
  _skyH = wrap.clientHeight;
  for (const id of ['sky-bg', 'sky-main']) {
    const c = skyEl(id);
    c.width = _skyW * _skyDpr; c.height = _skyH * _skyDpr;
    c.style.width = _skyW + 'px'; c.style.height = _skyH + 'px';
    c.getContext('2d').setTransform(_skyDpr, 0, 0, _skyDpr, 0, 0);
  }
  _skyBuildBgStars();
  _skyDrawBg();
}

function _skyBuildBgStars() {
  _skyBgStars = [];
  const count = Math.floor(_skyW * _skyH / 600);
  for (let i = 0; i < count; i++) {
    _skyBgStars.push({
      x: Math.random() * _skyW, y: Math.random() * _skyH,
      r: Math.random() < 0.92 ? 0.35 + Math.random() * 0.6 : 0.8 + Math.random() * 1.2,
      bright: 0.2 + Math.random() * 0.8,
      phase: Math.random() * Math.PI * 2,
      speed: 0.3 + Math.random() * 1.2,
      hue: Math.random() < 0.6 ? 210 : Math.random() < 0.5 ? 280 : Math.random() < 0.5 ? 60 : 0,
    });
  }
}

function _skyDrawBg() {
  const ctx = skyEl('sky-bg').getContext('2d');
  ctx.clearRect(0, 0, _skyW, _skyH);
  // Deep space gradient — reads from CSS token in Stage 4
  const grad = ctx.createRadialGradient(_skyW*.5, _skyH*.4, 0, _skyW*.5, _skyH*.4, _skyW*.8);
  grad.addColorStop(0, '#110810');
  grad.addColorStop(0.4, '#080406');
  grad.addColorStop(1, '#040203');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, _skyW, _skyH);
  // Nebula haze band
  const mw = ctx.createLinearGradient(0, _skyH*.25, _skyW, _skyH*.75);
  mw.addColorStop(0, 'transparent');
  mw.addColorStop(0.3, 'rgba(200,90,150,0.04)');
  mw.addColorStop(0.5, 'rgba(130,60,160,0.07)');
  mw.addColorStop(0.7, 'rgba(200,90,150,0.04)');
  mw.addColorStop(1, 'transparent');
  ctx.fillStyle = mw; ctx.fillRect(0, 0, _skyW, _skyH);
  // Static bg stars
  _skyBgStars.forEach(s => {
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
    ctx.fillStyle = `hsla(${s.hue},40%,90%,${s.bright * 0.45})`; ctx.fill();
  });
}
```

- [ ] Smoke test: add a temporary call to `initSkyLibrary()` at the bottom of `init()`. Sky overlay becomes visible, dark background renders. Remove the temporary call after verifying.

### Task 1.3 — Sky state: constellations + hover

**Files:** Continue §15 SKY

- [ ] Add `_starGlow()`, `_skyPx()`, `_skyPy()` helpers (same as prototype, trimmed):

```javascript
function _starGlow(ctx, cx, cy, r, hue, sat, lit, alpha, spike = false) {
  const g1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, r*4.5);
  g1.addColorStop(0, `hsla(${hue},${sat}%,${lit}%,${alpha*0.25})`);
  g1.addColorStop(1, 'transparent');
  ctx.fillStyle = g1; ctx.beginPath(); ctx.arc(cx, cy, r*4.5, 0, Math.PI*2); ctx.fill();
  const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, r*1.6);
  g2.addColorStop(0, `hsla(${hue},20%,98%,${alpha})`);
  g2.addColorStop(0.4, `hsla(${hue},${sat}%,${lit+10}%,${alpha*0.8})`);
  g2.addColorStop(1, `hsla(${hue},${sat}%,${lit}%,0)`);
  ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(cx, cy, r*1.6, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, r*0.35, 0, Math.PI*2);
  ctx.fillStyle = `rgba(255,252,245,${alpha})`; ctx.fill();
  if (spike) {
    ctx.save(); ctx.globalAlpha = alpha * 0.2;
    ctx.strokeStyle = `hsla(${hue},40%,90%,1)`; ctx.lineWidth = 0.5;
    const len = r * 7;
    ctx.beginPath(); ctx.moveTo(cx-len, cy); ctx.lineTo(cx+len, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy-len); ctx.lineTo(cx, cy+len); ctx.stroke();
    ctx.restore();
  }
}
function _skyPx(rx) { return rx * _skyW; }
function _skyPy(ry) { return ry * _skyH; }
```

- [ ] Add `_skyDrawSkyState()` — draws twinkling bg stars + all three constellations with hover states:

```javascript
function _skyDrawSkyState() {
  const ctx = skyEl('sky-main').getContext('2d');
  ctx.clearRect(0, 0, _skyW, _skyH);
  // Twinkling subset of bg stars
  _skyBgStars.forEach(s => {
    if (s.r < 0.7) return;
    const tw = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(_skyT * s.speed + s.phase));
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
    ctx.fillStyle = `hsla(${s.hue},40%,90%,${s.bright * tw})`; ctx.fill();
  });
  SKY_CONSTELLATIONS.forEach(con => {
    const c = con.color;
    const isH = _skyHoveredConst === con;
    // Lines
    con.lines.forEach(([a, b]) => {
      const s1 = con.stars[a], s2 = con.stars[b];
      ctx.beginPath();
      ctx.moveTo(_skyPx(s1.x), _skyPy(s1.y));
      ctx.lineTo(_skyPx(s2.x), _skyPy(s2.y));
      ctx.strokeStyle = `hsla(${c.h},50%,70%,${isH ? 0.38 : 0.13})`;
      ctx.lineWidth = isH ? 0.8 : 0.4;
      ctx.setLineDash([3, 6]); ctx.stroke(); ctx.setLineDash([]);
    });
    // Stars
    con.stars.forEach((s, i) => {
      const tw = 0.6 + 0.4 * Math.sin(_skyT * (0.5 + i*0.13) + s.x*10 + s.y*7);
      _starGlow(ctx, _skyPx(s.x), _skyPy(s.y), isH ? 3.2 : 2.2, c.h, c.s, c.l, tw * (isH ? 1 : 0.8), i === 0);
    });
    // Labels
    const lx = _skyPx(con.cx), ly = _skyPy(con.cy);
    ctx.save();
    ctx.font = 'italic 11px Georgia'; ctx.textAlign = 'center';
    ctx.fillStyle = `hsla(${c.h},40%,80%,0.4)`;
    ctx.fillText(con.label, lx, ly - 28);
    ctx.font = '10px Georgia';
    ctx.fillStyle = `hsla(${c.h},30%,70%,0.22)`;
    ctx.fillText(con.sublabel, lx, ly - 16);
    if (isH) {
      ctx.font = '500 13px Georgia';
      ctx.fillStyle = `hsla(${c.h},60%,88%,0.95)`;
      ctx.shadowColor = `hsla(${c.h},80%,70%,0.6)`; ctx.shadowBlur = 14;
      ctx.fillText(con.label, lx, ly - 32);
    }
    ctx.restore();
    con._hx = lx; con._hy = ly;
  });
}
```

- [ ] Add mouse/touch event handlers for sky state: hover detection (hit radius 18px around each star), click to trigger burst.

```javascript
function _skyHitConstellation(mx, my) {
  for (const con of SKY_CONSTELLATIONS) {
    if (con.stars.some(s => Math.hypot(mx - _skyPx(s.x), my - _skyPy(s.y)) < 18)) return con;
  }
  return null;
}
```

- [ ] Smoke test: Sky shows constellations. Hovering over a constellation brightens it and shows glowing label. No errors in console.

### Task 1.4 — Burst animation → Timeline state

**Files:** Continue §15 SKY

- [ ] Add timeline layout constants:

```javascript
const SKY_YEAR_MIN = -700;
const SKY_YEAR_MAX = 2010;
const SKY_AXIS_Y_RATIO = 0.50;    // axis at 50% canvas height
const SKY_PAD_LEFT_RATIO = 0.08;
const SKY_PAD_RIGHT_RATIO = 0.06;
const SKY_NODE_R = 22;             // px at 1× zoom
const SKY_ZOOM_MIN = 0.85;
const SKY_ZOOM_MAX = 2.2;
const SKY_ERA_MARKERS = [-600, 0, 500, 1000, 1500, 1700, 1800, 1900, 1950, 2010];
```

- [ ] Add `_skyYearToX(year)` — maps a year to a canvas X coordinate in world space (before pan/zoom transform):

```javascript
function _skyYearToX(year) {
  const padL = _skyW * SKY_PAD_LEFT_RATIO;
  const padR = _skyW * SKY_PAD_RIGHT_RATIO;
  const span = SKY_YEAR_MAX - SKY_YEAR_MIN;
  return padL + ((year - SKY_YEAR_MIN) / span) * (_skyW - padL - padR);
}
```

- [ ] Add `_skyBuildTimelineNodes(con)` — creates timeline node objects for a constellation's books, alternating above/below axis:

```javascript
function _skyBuildTimelineNodes(con) {
  const books = con.bookIds.map(id => SKY_BOOKS.find(b => b.id === id)).filter(Boolean);
  // Sort by year, then alternate above/below
  books.sort((a, b) => a.year - b.year);
  const axisY = _skyH * SKY_AXIS_Y_RATIO;
  return books.map((book, i) => {
    const above = i % 2 === 0;
    const stemLen = 40 + (Math.floor(i / 2) % 3) * 20; // stagger to avoid overlap
    return {
      book,
      x: _skyYearToX(book.year),
      y: axisY + (above ? -(SKY_NODE_R + stemLen) : (SKY_NODE_R + stemLen)),
      axisY,
      stemLen,
      above,
      r: SKY_NODE_R,
      img: null,
      imgLoaded: false,
      _r: SKY_NODE_R,
    };
  });
}
```

- [ ] Add `_skyDrawSkyStateStatic(ctx)` — a context-accepting static snapshot of the sky (no twinkling, no hover state) used as a backdrop during the burst animation:

```javascript
function _skyDrawSkyStateStatic(ctx) {
  SKY_CONSTELLATIONS.forEach(con => {
    const c = con.color;
    con.lines.forEach(([a, b]) => {
      const s1 = con.stars[a], s2 = con.stars[b];
      ctx.beginPath(); ctx.moveTo(_skyPx(s1.x), _skyPy(s1.y)); ctx.lineTo(_skyPx(s2.x), _skyPy(s2.y));
      ctx.strokeStyle = `hsla(${c.h},50%,70%,0.1)`; ctx.lineWidth = 0.4;
      ctx.setLineDash([3,6]); ctx.stroke(); ctx.setLineDash([]);
    });
    con.stars.forEach(s => _starGlow(ctx, _skyPx(s.x), _skyPy(s.y), 2, c.h, c.s, c.l, 0.5, false));
  });
}
```

- [ ] Add burst animation (stars flare outward, canvas cross-fades to timeline). Easing: cubic ease-in-out. Duration: ~55 frames (~0.9s at 60fps):

```javascript
function _skyEase(p) {
  return p < 0.5 ? 4*p*p*p : 1 - Math.pow(-2*p+2, 3)/2;
}

function _skyDrawBurst(progress) {
  const ctx = skyEl('sky-main').getContext('2d');
  ctx.clearRect(0, 0, _skyW, _skyH);
  const ease = _skyEase(progress);
  // Fade out sky behind
  ctx.globalAlpha = Math.max(0, 1 - progress * 1.5);
  _skyDrawSkyStateStatic(ctx);
  ctx.globalAlpha = 1;
  if (!_skyActiveConst) return;
  const c = _skyActiveConst.color;
  const cx = _skyPx(_skyActiveConst.cx), cy = _skyPy(_skyActiveConst.cy);
  // Burst ring
  if (progress < 0.4) {
    const ring = progress / 0.4;
    ctx.beginPath(); ctx.arc(cx, cy, ring * Math.min(_skyW, _skyH) * 0.35, 0, Math.PI*2);
    ctx.strokeStyle = `hsla(${c.h},70%,80%,${(1-ring)*0.5})`; ctx.lineWidth = 1; ctx.stroke();
  }
  // Nodes flying to timeline positions
  _skyBookNodes.forEach((n, i) => {
    const delay = (i / _skyBookNodes.length) * 0.25;
    const p = Math.max(0, Math.min(1, (progress - delay) / (1 - delay)));
    const ep = _skyEase(p);
    const nx = cx + (n.x - cx) * ep;
    const ny = cy + (n.y - cy) * ep;
    _skyDrawNode(ctx, n, nx, ny, Math.min(1, p * 3), false, c);
  });
}
```

- [ ] Add `_skyDrawTimeline()` — full timeline render with pan/zoom transform, axis, era markers, nodes, stems, year labels:

```javascript
function _skyDrawTimeline() {
  const ctx = skyEl('sky-main').getContext('2d');
  ctx.clearRect(0, 0, _skyW, _skyH);
  if (!_skyActiveConst) return;
  const c = _skyActiveConst.color;

  // Apply pan/zoom transform
  ctx.save();
  ctx.translate(_skyPanX, 0);
  ctx.scale(_skyZoom, _skyZoom);

  const axisY = _skyH * SKY_AXIS_Y_RATIO;

  // Axis line
  ctx.beginPath();
  ctx.moveTo(_skyYearToX(SKY_YEAR_MIN), axisY);
  ctx.lineTo(_skyYearToX(SKY_YEAR_MAX), axisY);
  ctx.strokeStyle = `hsla(${c.h},40%,60%,0.35)`;
  ctx.lineWidth = 0.5 / _skyZoom;
  ctx.stroke();

  // Era markers
  SKY_ERA_MARKERS.forEach(yr => {
    const mx = _skyYearToX(yr);
    ctx.beginPath(); ctx.arc(mx, axisY, 2.5 / _skyZoom, 0, Math.PI*2);
    ctx.fillStyle = `hsla(${c.h},40%,70%,0.5)`; ctx.fill();
    const label = yr < 0 ? `${Math.abs(yr)} BCE` : yr === 0 ? '0' : String(yr);
    ctx.font = `${9 / _skyZoom}px Georgia`;
    ctx.fillStyle = `hsla(${c.h},30%,70%,0.4)`;
    ctx.textAlign = 'center';
    ctx.fillText(label, mx, axisY + 16 / _skyZoom);
  });

  // Book nodes with stem lines
  _skyBookNodes.forEach((n, i) => {
    const isH = _skyHoveredBook === i;
    // Stem
    ctx.beginPath();
    ctx.moveTo(n.x, axisY);
    ctx.lineTo(n.x, n.y + (n.above ? n.r : -n.r));
    ctx.strokeStyle = `hsla(${c.h},40%,60%,${isH ? 0.6 : 0.25})`;
    ctx.lineWidth = 0.5 / _skyZoom;
    ctx.setLineDash([2 / _skyZoom, 4 / _skyZoom]); ctx.stroke(); ctx.setLineDash([]);
    // Axis dot
    ctx.beginPath(); ctx.arc(n.x, axisY, 2.5 / _skyZoom, 0, Math.PI*2);
    ctx.fillStyle = `hsla(${c.h},50%,70%,${isH ? 0.9 : 0.5})`; ctx.fill();
    // Node
    _skyDrawNode(ctx, n, n.x, n.y, 1, isH, c);
    // Title label
    const words = n.book.title.split(' ');
    const line1 = words.slice(0, 2).join(' ');
    const line2 = words.slice(2).join(' ');
    ctx.fillStyle = `rgba(220,210,240,${isH ? 0.9 : 0.5})`;
    ctx.font = `${isH ? 11 : 9}px Georgia`; ctx.textAlign = 'center';
    const labelY = n.above ? n.y - n.r - 14 : n.y + n.r + 14;
    ctx.fillText(line1, n.x, labelY / _skyZoom > 0 ? labelY : labelY);
    if (line2) ctx.fillText(line2, n.x, n.above ? labelY - 11 : labelY + 11);
    n._r = n.r * (isH ? 1.15 : 1);
  });

  ctx.restore();
}
```

- [ ] Add `_skyDrawNode(ctx, n, x, y, alpha, isH, c)` — draws a circular node (glow + clip + cover/initials + ring). Handles both placeholder colour and future image covers:

```javascript
function _skyDrawNode(ctx, n, x, y, alpha, isH, c) {
  const r = n.r * (isH ? 1.15 : 1);
  ctx.save(); ctx.globalAlpha = alpha;
  // Glow
  const grd = ctx.createRadialGradient(x, y, r*0.8, x, y, r*2);
  grd.addColorStop(0, `hsla(${c.h},60%,70%,${isH ? 0.4 : 0.2})`);
  grd.addColorStop(1, 'transparent');
  ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(x, y, r*2, 0, Math.PI*2); ctx.fill();
  // Clip to circle
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.clip();
  if (n.img && n.imgLoaded) {
    ctx.drawImage(n.img, x - r, y - r, r*2, r*2);
  } else {
    const cg = ctx.createRadialGradient(x - r*.3, y - r*.3, 0, x, y, r*1.2);
    cg.addColorStop(0, (n.book.cover || '#7b4fa6') + 'ee');
    cg.addColorStop(1, (n.book.cover || '#7b4fa6') + '55');
    ctx.fillStyle = cg; ctx.fillRect(x-r, y-r, r*2, r*2);
    const initials = n.book.title.split(' ').slice(0,2).map(w => w[0]).join('');
    ctx.fillStyle = 'rgba(245,224,238,0.92)';
    ctx.font = `${r * 0.45}px Georgia`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(initials, x, y);
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();
  // Ring
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2);
  ctx.strokeStyle = isH ? `hsla(${c.h},80%,88%,1)` : `hsla(${c.h},50%,70%,${alpha * 0.5})`;
  ctx.lineWidth = isH ? 1.5 : 0.5; ctx.stroke();
  ctx.restore();
}
```

- [ ] Add scroll-wheel and pinch-to-zoom for the timeline. Pan clamping: `panX = clamp(panX, -(zoom-1)*W*0.6, (zoom-1)*W*0.6)`. Zoom lerp smoothing via `_skyTargetZoom` / `_skyTargetPanX`.

- [ ] Add hit-testing for timeline nodes (must invert pan/zoom transform: `worldX = (clientX - panX) / zoom`).

- [ ] Smoke test: click a constellation → burst animation plays → timeline appears with books on axis. Hover a node shows glow. Scroll zooms in/out. Zoom is bounded at 0.85×–2.2×.

### Task 1.4b — Animation loop + event handlers

**Files:** Continue §15 SKY

- [ ] Add `_skyLoop()` — the `requestAnimationFrame` loop. Drives all three states. Handles reverse burst (closing animation). Lerps pan/zoom:

```javascript
function _skyLoop() {
  if (_skyState === 'sky') {
    _skyDrawSkyState();
  } else if (_skyState === 'burst') {
    if (_skyBurstReverse) {
      _skyBurstProgress = Math.max(0, _skyBurstProgress - 0.018);
      _skyDrawBurst(_skyBurstProgress);
      if (_skyBurstProgress <= 0) {
        skyEl('sky-overlay').classList.remove('active');
        cancelAnimationFrame(_skyFrame);
        return;
      }
    } else {
      _skyBurstProgress = Math.min(1, _skyBurstProgress + 0.018);
      _skyDrawBurst(_skyBurstProgress);
      if (_skyBurstProgress >= 1) {
        _skyState = 'timeline';
        skyEl('sky-back-btn').style.display = 'block';
        skyEl('sky-recenter-btn').style.display = 'block';
      }
    }
  } else if (_skyState === 'timeline') {
    _skyZoom  += (_skyTargetZoom - _skyZoom)   * 0.12;
    _skyPanX  += (_skyTargetPanX - _skyPanX)   * 0.12;
    _skyDrawTimeline();
  }
  _skyT += 0.016;
  _skyFrame = requestAnimationFrame(_skyLoop);
}
```

- [ ] Add `_skyGoBack()` — resets from timeline back to sky state:

```javascript
function _skyGoBack() {
  if (_skyState !== 'timeline') return;
  _skyState = 'sky';
  _skyActiveConst = null; _skyHoveredBook = null;
  _skyTargetZoom = 1; _skyTargetPanX = 0;
  skyEl('sky-back-btn').style.display = 'none';
  skyEl('sky-recenter-btn').style.display = 'none';
  skyEl('sky-tooltip').style.display = 'none';
}
```

- [ ] Add `_skyOpenHoveredBook()`:

```javascript
function _skyOpenHoveredBook() {
  if (_skyHoveredBook === null) return;
  const n = _skyBookNodes[_skyHoveredBook];
  if (n) _skyOpenBook(n.book.id);
}
```

- [ ] Add `_skyOnMouseMove(e)` — hover detection for both sky and timeline states. For timeline, inverts the pan/zoom transform (`worldX = (clientX - panX) / zoom`, `worldY = clientY / zoom`) before hit-testing nodes. Positions and shows tooltip:

```javascript
function _skyOnMouseMove(e) {
  const rect = skyEl('sky-main').getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  skyEl('sky-tooltip').style.display = 'none';
  if (_skyState === 'sky') {
    _skyHoveredConst = _skyHitConstellation(mx, my);
    skyEl('sky-main').style.cursor = _skyHoveredConst ? 'pointer' : 'default';
  } else if (_skyState === 'timeline') {
    const worldX = (mx - _skyPanX) / _skyZoom;
    const worldY = my / _skyZoom;  // no vertical pan
    _skyHoveredBook = null;
    _skyBookNodes.forEach((n, i) => {
      if (Math.hypot(worldX - n.x, worldY - n.y) < (n._r || n.r) + 4) _skyHoveredBook = i;
    });
    if (_skyHoveredBook !== null) {
      skyEl('sky-main').style.cursor = 'pointer';
      const n = _skyBookNodes[_skyHoveredBook];
      document.getElementById('sky-tt-title').textContent = n.book.title;
      document.getElementById('sky-tt-meta').textContent =
        `${n.book.author} · ${n.book.year < 0 ? Math.abs(n.book.year) + ' BCE' : n.book.year}`;
      document.getElementById('sky-tt-desc').textContent = n.book.summary || '';
      let tx = (n.x * _skyZoom + _skyPanX) + n.r * _skyZoom + 12;
      let ty = n.y * _skyZoom - 20;
      if (tx + 260 > _skyW) tx = (n.x * _skyZoom + _skyPanX) - n.r * _skyZoom - 260;
      const tt = skyEl('sky-tooltip');
      tt.style.left = tx + 'px'; tt.style.top = Math.max(8, ty) + 'px';
      tt.style.display = 'block';
    } else {
      skyEl('sky-main').style.cursor = 'default';
    }
  }
}
```

- [ ] Add `_skyOnClick(e)`, `_skyOnDblClick(e)`, `_skyOnWheel(e)`:

```javascript
function _skyOnClick(e) {
  const rect = skyEl('sky-main').getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  if (_skyState === 'sky' && _skyHoveredConst) {
    _skyActiveConst = _skyHoveredConst;
    _skyBookNodes = _skyBuildTimelineNodes(_skyActiveConst);
    // Preload cover images before burst starts
    _skyBookNodes.forEach(n => {
      if (n.book.cover?.startsWith('data:') || n.book.cover?.startsWith('http')) {
        const img = new Image(); img.src = n.book.cover;
        img.onload = () => { n.img = img; n.imgLoaded = true; };
      }
    });
    _skyBurstProgress = 0; _skyBurstReverse = false; _skyState = 'burst';
    skyEl('sky-tooltip').style.display = 'none';
  }
}

function _skyOnDblClick(e) {
  if (_skyState === 'timeline' && _skyHoveredBook !== null) _skyOpenHoveredBook();
}

function _skyOnWheel(e) {
  if (_skyState !== 'timeline') return;
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  _skyTargetZoom = Math.max(SKY_ZOOM_MIN, Math.min(SKY_ZOOM_MAX, _skyTargetZoom + delta));
  const panLimit = (_skyTargetZoom - 1) * _skyW * 0.6;
  _skyTargetPanX = Math.max(-panLimit, Math.min(panLimit, _skyTargetPanX));
}
```

- [ ] Smoke test: sky loop runs. Constellations twinkle. Clicking a constellation triggers burst → timeline. Back button → returns to sky. Scroll wheel zooms timeline within bounds. Double-click node → navigates.

### Task 1.5 — Open/close book + `initSkyLibrary()` + wiring

**Files:** Continue §15 SKY · §14 APP

- [ ] Add `initSkyLibrary()` — mounts the sky, starts the animation loop, loads IDB books to merge into SKY_BOOKS:

```javascript
async function initSkyLibrary() {
  // Merge user's IDB books into SKY_BOOKS at runtime
  const idbBooks = await getAllBooks();
  idbBooks.forEach(entry => {
    if (!SKY_BOOKS.find(b => b.id === entry.id)) {
      const bk = entry.bundle?.book || {};
      SKY_BOOKS.push({
        id: entry.id, title: entry.title || 'Untitled', author: entry.author || '',
        year: bk.year || 1900, region: bk.region || '', theme: bk.theme || '',
        summary: bk.summary || '', cover: bk.cover || '#7b4fa6',
      });
    }
    // Apply saved constellation assignments (manual overrides stored in bundle.constellations).
    // If no saved assignments exist, fall back to auto-assign from metadata.
    const saved = entry.bundle?.constellations;
    if (saved) {
      SKY_CONSTELLATIONS.forEach(con => {
        const shouldBe = saved[con.id] ?? false;
        const idx = con.bookIds.indexOf(entry.id);
        if (shouldBe && idx === -1) con.bookIds.push(entry.id);
        if (!shouldBe && idx !== -1) con.bookIds.splice(idx, 1);
      });
    } else {
      _skyAutoAssignConstellations(entry.id, entry.bundle?.book || {});
    }
  });
  // Preload cover images for all IDB books so they are ready before any constellation click
  SKY_BOOKS.forEach(b => {
    if (b.cover?.startsWith('data:') || b.cover?.startsWith('http')) {
      const img = new Image(); img.src = b.cover;
      img.onload = () => { b._img = img; b._imgLoaded = true; };
    }
  });
  skyEl('sky-overlay').classList.add('active');
  skyResize();
  _skyLoop();
  skyEl('sky-back-btn').addEventListener('click', () => _skyGoBack());
  skyEl('sky-recenter-btn').addEventListener('click', () => { _skyTargetZoom = 1; _skyTargetPanX = 0; });
  skyEl('sky-tt-open').addEventListener('click', _skyOpenHoveredBook);
  skyEl('sky-main').addEventListener('mousemove', _skyOnMouseMove);
  skyEl('sky-main').addEventListener('click', _skyOnClick);
  skyEl('sky-main').addEventListener('dblclick', _skyOnDblClick);
  skyEl('sky-main').addEventListener('wheel', _skyOnWheel, { passive: false });
  window.addEventListener('resize', () => { skyResize(); });
}
```

- [ ] Inside `initSkyLibrary()`, preload cover images for all IDB books immediately after merging them into `SKY_BOOKS` (before `skyResize()`). This ensures images are decoded before any constellation is clicked, so the timeline nodes render covers instantly. The code for this is already in the `initSkyLibrary()` listing above — confirm it is present.

- [ ] Add `_skyAutoAssignConstellations(id, bookData)` — pure function, extractable for testing:

```javascript
// Pure function — no DOM/canvas dependencies, testable in console
function _skyAutoAssignConstellations(bookId, bookData) {
  const year = bookData.year;
  const region = bookData.region;
  const theme = bookData.theme;
  SKY_CONSTELLATIONS.forEach(con => {
    if (con.bookIds.includes(bookId)) return; // already assigned
    if (con.id === 'eras' && year !== undefined) con.bookIds.push(bookId);
    if (con.id === 'regions' && region) con.bookIds.push(bookId);
    if (con.id === 'themes' && theme) con.bookIds.push(bookId);
  });
}
```

- [ ] Add `_skyOpenBook(bookId)` — navigates to the book:

```javascript
function _skyOpenBook(bookId) {
  window.location.href = `index.html?id=${encodeURIComponent(bookId)}`;
}
```

- [ ] Add `closeSky(animated = true)` — closes the sky overlay. If `animated`, plays reverse burst (burst plays backwards); otherwise hides instantly:

```javascript
function closeSky(animated = true) {
  if (!animated) {
    skyEl('sky-overlay').classList.remove('active');
    cancelAnimationFrame(_skyFrame);
    return;
  }
  // Reverse burst: run burst animation backwards from 1 → 0
  _skyBurstReverse = true;
  _skyBurstProgress = 1;
  _skyState = 'burst';
  // The loop will detect _skyBurstReverse and decrement progress
  // When it reaches 0, the overlay is hidden
}
```

- [ ] In `§14 APP init()`, replace the `no_books` catch handler:

```javascript
// BEFORE (line ~1876):
if (e.code === 'no_books') {
  document.getElementById('loading').style.display = 'none';
  openBookshelf();
  return;
}

// AFTER:
if (e.code === 'no_books') {
  document.getElementById('loading').style.display = 'none';
  initSkyLibrary();
  return;
}
```

Leave the `book_not_found` handler unchanged — it keeps opening the bookshelf, which is correct when the user has books but the requested `?id=` no longer exists in IDB. Only `no_books` (empty library) triggers the sky.

- [ ] Smoke test: open `index.html` with empty IDB → sky appears. Click a constellation → burst → timeline. Double-click a node → navigates to `index.html?id=...`. Click `← sky` → reverse burst → sky. Close sky with `closeSky(false)` → instant.

- [ ] Commit Stage 1:

```bash
git add index.html
git commit -m "feat: add night sky library with timeline burst (Stage 1)"
```

---

## Stage 2 — Bottom Bar Edit Mode (`§16 TOOLBAR`)

Make the bottom bar configurable: icons can be reordered by drag, resized (sm/md/lg), and swapped. Config persists to localStorage. Edit mode is toggled by a new "toolbar edit" button in the bar (or the existing `#editor-indicator` can be repurposed — TBD based on reading the existing editor mode logic before implementing).

### Task 2.1 — Toolbar config schema + storage

**Files:** §16 TOOLBAR (new section)

- [ ] Define the toolbar config schema. Each entry maps to a button by `id`. Add `§16 TOOLBAR` section:

```javascript
// ── §16 TOOLBAR ───────────────────────────────────────────────────────────────

const TOOLBAR_LS_KEY = 'isabelle-v2-toolbar-config';

const TOOLBAR_DEFAULTS = [
  { id:'btn-play',           icon:'▶',    label:'Play',            size:'md', visible:true },
  { id:'btn-stop',           icon:'◼',    label:'Stop',            size:'md', visible:true },
  { id:'btn-prev',           icon:'←',    label:'Previous',        size:'md', visible:true },
  { id:'btn-next',           icon:'→',    label:'Next',            size:'md', visible:true },
  { id:'btn-narrator',       icon:'♪',    label:'Narrator',        size:'md', visible:true },
  { id:'btn-range-copy',     icon:'✂',    label:'Range copy',      size:'md', visible:true },
  { id:'btn-font-dec',       icon:'A-',   label:'Smaller text',    size:'sm', visible:true },
  { id:'btn-font-inc',       icon:'A+',   label:'Larger text',     size:'sm', visible:true },
  { id:'btn-theme',          icon:'◐',    label:'Theme',           size:'md', visible:true },
  { id:'btn-translate',      icon:'Tr',   label:'Translate',       size:'sm', visible:true },
  { id:'btn-focus',          icon:'⊞',    label:'Reading mode',    size:'md', visible:true },
  { id:'btn-context',        icon:'📖',   label:'Context',         size:'md', visible:true },
  { id:'btn-sidebar',        icon:'≡',    label:'Navigation',      size:'md', visible:true },
  { id:'btn-bookshelf',      icon:'📚',   label:'Bookshelf',       size:'md', visible:true },
  { id:'btn-export',         icon:'↓',    label:'Export',          size:'md', visible:true },
  { id:'btn-smart',          icon:'✦',    label:'Smart features',  size:'md', visible:true },
  { id:'btn-save',           icon:'↓',    label:'Save bundle',     size:'md', visible:true },
  { id:'btn-bottom-collapse',icon:'▽',    label:'Hide bar',        size:'sm', visible:true },
];

// Pure functions — testable
function toolbarLoadConfig() {
  try {
    const raw = localStorage.getItem(TOOLBAR_LS_KEY);
    if (!raw) return JSON.parse(JSON.stringify(TOOLBAR_DEFAULTS));
    const saved = JSON.parse(raw);
    // Merge: preserve order from saved, add any new defaults not yet in saved
    const savedIds = new Set(saved.map(e => e.id));
    const merged = [...saved];
    TOOLBAR_DEFAULTS.forEach(d => { if (!savedIds.has(d.id)) merged.push({ ...d }); });
    return merged;
  } catch { return JSON.parse(JSON.stringify(TOOLBAR_DEFAULTS)); }
}

function toolbarSaveConfig(config) {
  localStorage.setItem(TOOLBAR_LS_KEY, JSON.stringify(config));
}

function toolbarApplyConfig(config) {
  const row = document.getElementById('bar-row-1');
  // Only reorder elements that are .bar-icon. Non-icon elements (speed slider span,
  // voice select spans, restore label, editor-indicator) stay in their original DOM
  // position and are not managed by toolbar config.
  config.forEach(entry => {
    const el = document.getElementById(entry.id);
    if (!el || !el.classList.contains('bar-icon')) return;
    el.style.display = entry.visible ? '' : 'none';
    el.classList.toggle('bar-icon-sm', entry.size === 'sm');
    el.classList.toggle('bar-icon-lg', entry.size === 'lg');
    row.appendChild(el); // moves to end in config order
  });
}
```

- [ ] Add CSS for size variants and edit-mode drag handles to the `<style>` block:

```css
/* ── Toolbar edit mode ───────────────────────────────────────── */
.bar-icon-sm { font-size: .72rem !important; min-width: 26px !important; }
.bar-icon-lg { font-size: 1.1rem !important; min-width: 40px !important; }
body.toolbar-edit-mode .bar-icon { cursor: grab; position: relative; }
body.toolbar-edit-mode .bar-icon::before {
  content: '⠿'; position: absolute; top: -6px; left: 50%; transform: translateX(-50%);
  font-size: 8px; color: var(--accent); opacity: 0.7; pointer-events: none;
}
body.toolbar-edit-mode .bar-icon.drag-over { outline: 1px dashed var(--accent); }
.toolbar-edit-btn { color: var(--accent) !important; }
```

### Task 2.2 — Drag-to-reorder

**Files:** Continue §16 TOOLBAR

- [ ] Implement drag-to-reorder using `dragstart` / `dragover` / `drop` on `#bar-row-1` children. Uses HTML5 drag API (no library):

```javascript
let _toolbarDragId = null;

function _toolbarInitDrag() {
  const row = document.getElementById('bar-row-1');
  row.addEventListener('dragstart', e => {
    const btn = e.target.closest('.bar-icon');
    if (!btn || !document.body.classList.contains('toolbar-edit-mode')) { e.preventDefault(); return; }
    _toolbarDragId = btn.id;
    btn.style.opacity = '0.4';
  });
  row.addEventListener('dragend', e => {
    const btn = e.target.closest('.bar-icon');
    if (btn) btn.style.opacity = '';
    row.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  });
  row.addEventListener('dragover', e => {
    e.preventDefault();
    const btn = e.target.closest('.bar-icon');
    if (!btn || btn.id === _toolbarDragId) return;
    row.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    btn.classList.add('drag-over');
  });
  row.addEventListener('drop', e => {
    e.preventDefault();
    const target = e.target.closest('.bar-icon');
    if (!target || !_toolbarDragId || target.id === _toolbarDragId) return;
    const config = toolbarLoadConfig();
    const fromIdx = config.findIndex(c => c.id === _toolbarDragId);
    const toIdx   = config.findIndex(c => c.id === target.id);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = config.splice(fromIdx, 1);
    config.splice(toIdx, 0, moved);
    toolbarSaveConfig(config);
    toolbarApplyConfig(config);
  });
  // Make icons draggable when in edit mode
  row.querySelectorAll('.bar-icon').forEach(btn => btn.setAttribute('draggable', 'true'));
}
```

### Task 2.3 — Resize + icon swap

**Files:** Continue §16 TOOLBAR

- [ ] Add context menu (right-click) in edit mode that offers size options and icon swap. Keep the swap palette minimal — a small popover showing the icon character and a text input:

```javascript
function _toolbarShowIconMenu(btn, config, entry) {
  // Remove any existing menu
  document.getElementById('toolbar-icon-menu')?.remove();
  const menu = document.createElement('div');
  menu.id = 'toolbar-icon-menu';
  menu.style.cssText = `position:fixed;z-index:200;background:var(--surf);border:1px solid var(--border);padding:10px 12px;display:flex;flex-direction:column;gap:6px;min-width:160px`;
  const rect = btn.getBoundingClientRect();
  menu.style.left = rect.left + 'px';
  menu.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
  // Size options
  const sizes = ['sm', 'md', 'lg'];
  const sizeRow = document.createElement('div');
  sizeRow.style.cssText = 'display:flex;gap:4px;';
  sizes.forEach(sz => {
    const b = document.createElement('button');
    b.textContent = sz; b.className = 'bar-text-btn';
    if (entry.size === sz) b.style.borderColor = 'var(--accent)';
    b.onclick = () => {
      entry.size = sz; toolbarSaveConfig(config); toolbarApplyConfig(config); menu.remove();
    };
    sizeRow.appendChild(b);
  });
  menu.appendChild(sizeRow);
  // Icon input
  const iconRow = document.createElement('div');
  iconRow.style.cssText = 'display:flex;gap:4px;align-items:center;';
  const inp = document.createElement('input');
  inp.value = entry.icon; inp.style.cssText = 'background:var(--surf2);border:none;color:var(--text);font-size:1rem;width:48px;text-align:center;padding:3px;';
  inp.onchange = () => {
    entry.icon = inp.value; btn.textContent = inp.value;
    toolbarSaveConfig(config);
  };
  iconRow.appendChild(inp);
  // Visibility toggle
  const visBtn = document.createElement('button');
  visBtn.textContent = entry.visible ? 'Hide' : 'Show'; visBtn.className = 'bar-text-btn';
  visBtn.onclick = () => {
    entry.visible = !entry.visible; toolbarSaveConfig(config); toolbarApplyConfig(config); menu.remove();
  };
  menu.appendChild(iconRow); menu.appendChild(visBtn);
  document.body.appendChild(menu);
  // Close on outside click
  setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 0);
}
```

### Task 2.4 — Edit mode toggle + `initToolbar()`

**Files:** Continue §16 TOOLBAR · HTML body

- [ ] Add a toolbar-edit button to the bottom bar HTML, before `#btn-bottom-collapse`:

```html
<button type="button" class="bar-icon bar-tip" id="btn-toolbar-edit" aria-label="Edit toolbar" data-tip="Enter toolbar edit mode — drag to reorder, right-click to resize or change icons">⚙</button>
```

- [ ] Add `initToolbar()`:

```javascript
function initToolbar() {
  const config = toolbarLoadConfig();
  toolbarApplyConfig(config);
  _toolbarInitDrag();

  document.getElementById('btn-toolbar-edit').addEventListener('click', () => {
    document.body.classList.toggle('toolbar-edit-mode');
    document.getElementById('btn-toolbar-edit').classList.toggle('toolbar-edit-btn');
  });

  document.getElementById('bar-row-1').addEventListener('contextmenu', e => {
    if (!document.body.classList.contains('toolbar-edit-mode')) return;
    const btn = e.target.closest('.bar-icon');
    if (!btn) return;
    e.preventDefault();
    const config = toolbarLoadConfig();
    const entry = config.find(c => c.id === btn.id);
    if (!entry) return;
    _toolbarShowIconMenu(btn, config, entry);
  });
}
```

- [ ] Add `initToolbar()` call to `§14 APP init()` — add this line after `initBookshelf()`:

```javascript
initToolbar();
```

- [ ] Smoke test: bottom bar loads with saved config order. Click ⚙ → edit mode active, drag handles visible. Drag an icon → order changes and persists on reload. Right-click → size menu appears. Change icon character → button updates.

- [ ] Commit Stage 2:

```bash
git add index.html
git commit -m "feat: configurable bottom bar — reorder, resize, swap icons (Stage 2)"
```

---

## Stage 3 — Studio Panel Shell (`§17 STUDIO`)

A full-screen overlay opened from a new Studio button in the bottom bar. Nav panel on the left, content area on the right. Six sections: Books, Book Editor, Tokens, Toolbar, Primitives, Export. All sections empty stubs at this stage — filled in Stages 4–6.

### Task 3.1 — CSS + HTML

**Files:** `index.html` style block · `index.html` body

- [ ] Add studio overlay CSS:

```css
/* ── Studio Overlay ─────────────────────────────────────────── */
#studio-overlay {
  position: fixed; inset: 0; z-index: 110;
  display: none; flex-direction: row;
  background: var(--bg);
}
#studio-overlay.active { display: flex; }
#studio-nav {
  width: 180px; min-width: 180px; background: var(--surf);
  border-right: 1px solid var(--border);
  display: flex; flex-direction: column; padding: 16px 0;
  flex-shrink: 0;
}
.studio-nav-item {
  background: none; border: none; text-align: left;
  padding: 9px 16px; font-family: var(--ui-font); font-size: .65rem;
  letter-spacing: .08em; text-transform: uppercase; color: var(--text-m);
  cursor: pointer; transition: color var(--t), background var(--t);
}
.studio-nav-item:hover, .studio-nav-item.active {
  color: var(--accent); background: var(--accent-bg);
}
.studio-nav-close {
  margin-top: auto; border-top: 1px solid var(--border); padding-top: 12px;
}
#studio-content {
  flex: 1; overflow-y: auto; padding: 32px 40px;
}
.studio-section { display: none; }
.studio-section.active { display: block; }
.studio-section-title {
  font-family: var(--ui-font); font-size: .62rem; letter-spacing: .14em;
  text-transform: uppercase; color: var(--accent); margin-bottom: 24px;
}
```

- [ ] Add studio overlay HTML immediately before `#sky-overlay`:

```html
<div id="studio-overlay" role="dialog" aria-label="Studio" aria-modal="true">
  <nav id="studio-nav" aria-label="Studio sections">
    <button class="studio-nav-item active" data-section="books">Books</button>
    <button class="studio-nav-item" data-section="book-editor">Book Editor</button>
    <button class="studio-nav-item" data-section="tokens">Tokens</button>
    <button class="studio-nav-item" data-section="toolbar-studio">Toolbar</button>
    <button class="studio-nav-item" data-section="primitives">Primitives</button>
    <button class="studio-nav-item" data-section="export">Export</button>
    <div class="studio-nav-close">
      <button class="studio-nav-item" id="studio-close-btn" aria-label="Close Studio">✕ Close</button>
    </div>
  </nav>
  <div id="studio-content">
    <div class="studio-section active" id="studio-books">
      <p class="studio-section-title">Books</p>
      <!-- Filled in Stage 5 -->
    </div>
    <div class="studio-section" id="studio-book-editor">
      <p class="studio-section-title">Book Editor</p>
    </div>
    <div class="studio-section" id="studio-tokens">
      <p class="studio-section-title">Tokens</p>
    </div>
    <div class="studio-section" id="studio-toolbar-studio">
      <p class="studio-section-title">Toolbar</p>
    </div>
    <div class="studio-section" id="studio-primitives">
      <p class="studio-section-title">Primitives</p>
    </div>
    <div class="studio-section" id="studio-export">
      <p class="studio-section-title">Export</p>
    </div>
  </div>
</div>
```

- [ ] Add Studio button to bottom bar (before `#btn-toolbar-edit`):

```html
<button type="button" class="bar-icon bar-tip" id="btn-studio" aria-label="Studio" data-tip="Open Studio — author books, edit design tokens, configure toolbar">✎</button>
```

### Task 3.2 — `§17 STUDIO` JS

**Files:** `index.html` script block

- [ ] Add `§17 STUDIO` after `§16 TOOLBAR`:

```javascript
// ── §17 STUDIO ────────────────────────────────────────────────────────────────

function openStudio(section = 'books') {
  document.getElementById('studio-overlay').classList.add('active');
  studioShowSection(section);
}

function closeStudio() {
  document.getElementById('studio-overlay').classList.remove('active');
}

function studioShowSection(id) {
  document.querySelectorAll('.studio-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.studio-nav-item[data-section]').forEach(b => b.classList.remove('active'));
  document.getElementById(`studio-${id}`)?.classList.add('active');
  document.querySelector(`.studio-nav-item[data-section="${id}"]`)?.classList.add('active');
}

function initStudio() {
  document.getElementById('btn-studio').addEventListener('click', () => openStudio());
  document.getElementById('studio-close-btn').addEventListener('click', closeStudio);
  document.querySelectorAll('.studio-nav-item[data-section]').forEach(btn => {
    btn.addEventListener('click', () => studioShowSection(btn.dataset.section));
  });
}
```

- [ ] Add `initStudio()` call to `§14 APP init()`:

```javascript
initStudio();
```

- [ ] Smoke test: click ✎ button → Studio overlay opens over reader. Nav links switch sections. Close button dismisses. Studio opens above sky if sky is active (z-index: 110 > sky z-index: 100).

- [ ] Commit Stage 3:

```bash
git add index.html
git commit -m "feat: studio panel shell with nav + section stubs (Stage 3)"
```

---

## Stage 4 — Token System (`§18 TOKENS`)

A shared token store drives CSS custom properties and the sky canvas renderer. Token Studio UI in the Studio panel lets the user live-edit all visual design values including sky colours.

### Task 4.1 — Token store + CSS bridge

**Files:** `§18 TOKENS` (new section)

- [ ] Add `§18 TOKENS` after `§17 STUDIO`. Define `TOKEN_DEFAULTS`, `TOKEN_CSS_MAP`, and the core apply/load/save functions:

```javascript
// ── §18 TOKENS ────────────────────────────────────────────────────────────────

const TOKEN_LS_KEY = 'isabelle-v2-tokens';

// Flat dot-path token names → default values
const TOKEN_DEFAULTS = {
  // Reader colours
  'color.bg':           '#09060c',
  'color.surface':      '#0f0a13',
  'color.surface2':     '#140e18',
  'color.accent':       '#c67ba5',
  'color.text':         'rgba(255,255,255,0.82)',
  'color.text.muted':   'rgba(255,255,255,0.52)',
  'color.text.dim':     'rgba(255,255,255,0.28)',
  // Reader typography
  'font.body':          "Georgia,'Times New Roman',serif",
  'font.ui':            "'JetBrains Mono',monospace",
  'font.size.body':     '16px',
  // Sky colours
  'sky.bg':             '#080406',
  'sky.nebula.haze':    'rgba(200,90,150,0.055)',
  'sky.const.eras.hue':    '270',
  'sky.const.regions.hue': '175',
  'sky.const.themes.hue':  '330',
};

// Maps token key → CSS custom property name
const TOKEN_CSS_MAP = {
  'color.bg':           '--bg',
  'color.surface':      '--surf',
  'color.surface2':     '--surf2',
  'color.accent':       '--accent',
  'color.text':         '--text',
  'color.text.muted':   '--text-m',
  'color.text.dim':     '--text-d',
  'font.body':          '--book-font',
  'font.ui':            '--ui-font',
  'font.size.body':     '--font-size',
  'sky.bg':             '--sky-bg',
  'sky.nebula.haze':    '--sky-nebula-haze',
  'sky.const.eras.hue':    '--sky-const-eras-hue',
  'sky.const.regions.hue': '--sky-const-regions-hue',
  'sky.const.themes.hue':  '--sky-const-themes-hue',
};

// Pure — testable
function tokensMergeWithDefaults(saved) {
  return Object.assign({}, TOKEN_DEFAULTS, saved || {});
}

function tokensLoad() {
  try {
    const raw = localStorage.getItem(TOKEN_LS_KEY);
    return tokensMergeWithDefaults(raw ? JSON.parse(raw) : null);
  } catch { return { ...TOKEN_DEFAULTS }; }
}

function tokensSave(tokens) {
  localStorage.setItem(TOKEN_LS_KEY, JSON.stringify(tokens));
}

function tokensApply(tokens) {
  const root = document.documentElement;
  for (const [k, cssVar] of Object.entries(TOKEN_CSS_MAP)) {
    if (tokens[k] !== undefined) root.style.setProperty(cssVar, tokens[k]);
  }
  // Notify sky canvas to redraw background with new sky tokens
  if (typeof _skyDrawBg === 'function' && skyEl('sky-overlay').classList.contains('active')) {
    _skyDrawBg();
  }
}

function initTokens() {
  const tokens = tokensLoad();
  tokensApply(tokens);
}
```

- [ ] Refactor `_skyDrawBg()` in §15 to read sky tokens from CSS variables instead of hardcoded values:

```javascript
// In _skyDrawBg(), replace hardcoded colour strings:
const cs = getComputedStyle(document.documentElement);
const skyBg = cs.getPropertyValue('--sky-bg').trim() || '#080406';
const hazeColor = cs.getPropertyValue('--sky-nebula-haze').trim() || 'rgba(200,90,150,0.055)';
```

- [ ] Similarly refactor `SKY_CONSTELLATIONS` colour hues to read from CSS variables at draw time inside `_skyDrawSkyState()`:

```javascript
// Inside _skyDrawSkyState(), before drawing each constellation:
const cs = getComputedStyle(document.documentElement);
const hueMap = {
  eras:    parseInt(cs.getPropertyValue('--sky-const-eras-hue').trim()) || con.color.h,
  regions: parseInt(cs.getPropertyValue('--sky-const-regions-hue').trim()) || con.color.h,
  themes:  parseInt(cs.getPropertyValue('--sky-const-themes-hue').trim()) || con.color.h,
};
const hue = hueMap[con.id] ?? con.color.h;
```

### Task 4.2 — Token Studio UI

**Files:** Continue §18 TOKENS

- [ ] Add CSS for token studio form elements to the `<style>` block:

```css
/* ── Token Studio UI ─────────────────────────────────────────── */
.token-group { margin-bottom: 28px; }
.token-group-title { font-family: var(--ui-font); font-size: .56rem; letter-spacing: .12em; text-transform: uppercase; color: var(--text-d); margin-bottom: 12px; }
.token-row { display: flex; align-items: center; gap: 10px; padding: 5px 0; border-bottom: 1px solid var(--border); }
.token-label { font-family: var(--ui-font); font-size: .65rem; color: var(--text-m); flex: 1; min-width: 0; }
.token-input { background: var(--surf2); border: 1px solid var(--border); color: var(--text); font-family: var(--ui-font); font-size: .65rem; padding: 3px 6px; width: 160px; }
.token-input:focus { border-color: var(--accent); outline: none; }
.token-color-swatch { width: 18px; height: 18px; border-radius: 3px; border: 1px solid var(--border); flex-shrink: 0; cursor: pointer; }
.token-reset-btn { background: none; border: none; color: var(--text-d); cursor: pointer; font-size: .7rem; padding: 0 4px; transition: color var(--t); }
.token-reset-btn:hover { color: var(--accent); }
```

- [ ] Add `renderTokenStudio()` — builds the token editor UI inside `#studio-tokens`. Groups tokens by prefix. Colour tokens get a `<input type="color">` swatch + text input:

```javascript
function renderTokenStudio() {
  const container = document.getElementById('studio-tokens');
  container.innerHTML = '<p class="studio-section-title">Tokens</p>';
  const tokens = tokensLoad();

  const groups = {
    'Reader — Colour':     ['color.bg','color.surface','color.surface2','color.accent','color.text','color.text.muted','color.text.dim'],
    'Reader — Typography': ['font.body','font.ui','font.size.body'],
    'Sky — Background':    ['sky.bg','sky.nebula.haze'],
    'Sky — Constellations':['sky.const.eras.hue','sky.const.regions.hue','sky.const.themes.hue'],
  };

  for (const [groupName, keys] of Object.entries(groups)) {
    const grp = document.createElement('div');
    grp.className = 'token-group';
    grp.innerHTML = `<p class="token-group-title">${groupName}</p>`;
    keys.forEach(key => {
      const val = tokens[key] ?? TOKEN_DEFAULTS[key];
      const isColor = key.startsWith('color.') || key === 'sky.bg' || key === 'sky.nebula.haze';
      const isHue   = key.endsWith('.hue');
      const row = document.createElement('div');
      row.className = 'token-row';

      const label = document.createElement('span');
      label.className = 'token-label'; label.textContent = key;

      const inp = document.createElement('input');
      inp.className = 'token-input'; inp.value = val; inp.type = 'text';
      inp.addEventListener('input', () => {
        tokens[key] = inp.value; tokensSave(tokens); tokensApply(tokens);
        if (isColor) swatch && (swatch.value = _tokenToHex(inp.value));
      });

      let swatch = null;
      if (isColor) {
        swatch = document.createElement('input');
        swatch.type = 'color'; swatch.className = 'token-color-swatch';
        swatch.value = _tokenToHex(val);
        swatch.addEventListener('input', () => {
          inp.value = swatch.value; tokens[key] = swatch.value;
          tokensSave(tokens); tokensApply(tokens);
        });
      }

      const reset = document.createElement('button');
      reset.className = 'token-reset-btn'; reset.textContent = '↺';
      reset.title = `Reset to ${TOKEN_DEFAULTS[key]}`;
      reset.addEventListener('click', () => {
        tokens[key] = TOKEN_DEFAULTS[key]; inp.value = TOKEN_DEFAULTS[key];
        if (swatch) swatch.value = _tokenToHex(TOKEN_DEFAULTS[key]);
        tokensSave(tokens); tokensApply(tokens);
      });

      row.appendChild(label);
      if (swatch) row.appendChild(swatch);
      row.appendChild(inp);
      row.appendChild(reset);
      grp.appendChild(row);
    });
    container.appendChild(grp);
  }
}

// Helper — convert rgba/hex/hsl string to a hex value for <input type=color>
function _tokenToHex(val) {
  if (!val) return '#000000';
  if (/^#[0-9a-f]{6}$/i.test(val.trim())) return val.trim();
  // Fallback — create a temp element, let the browser parse it
  const d = document.createElement('div');
  d.style.color = val;
  document.body.appendChild(d);
  const computed = getComputedStyle(d).color;
  document.body.removeChild(d);
  const m = computed.match(/\d+/g);
  if (!m || m.length < 3) return '#888888';
  return '#' + m.slice(0,3).map(n => parseInt(n).toString(16).padStart(2,'0')).join('');
}
```

- [ ] Wire `renderTokenStudio()` when the Tokens nav item is clicked:

```javascript
// In initStudio(), add after section switching:
document.querySelector('.studio-nav-item[data-section="tokens"]')
  .addEventListener('click', renderTokenStudio);
```

- [ ] Add `initTokens()` call to `§14 APP init()`, before `applyLayoutFromStorage()`:

```javascript
initTokens();
```

- [ ] Smoke test: open Studio → Tokens. Change `color.accent` → reader accent colour updates live. Change `sky.const.eras.hue` → sky constellation colour changes while sky is visible. Reset button restores default. Values persist on reload.

- [ ] Commit Stage 4:

```bash
git add index.html
git commit -m "feat: shared token store — CSS + canvas bridge + Token Studio UI (Stage 4)"
```

---

## Stage 5 — Book Authoring (`§19 AUTHOR`)

Full CRUD for books inside Studio. Create books from scratch, edit metadata (including `year`, `region`, `theme`, `summary`, `cover`), upload cover images, author letters, and manually override constellation assignment. IDB autosave. Download bundle export.

### Task 5.1 — Books list view

**Files:** `§19 AUTHOR` (new section) · `#studio-books` section

- [ ] Add §19 AUTHOR. Implement `renderStudioBooksList()`:

```javascript
// ── §19 AUTHOR ────────────────────────────────────────────────────────────────

async function renderStudioBooksList() {
  const container = document.getElementById('studio-books');
  container.innerHTML = '<p class="studio-section-title">Books</p>';

  const addBtn = document.createElement('button');
  addBtn.className = 'bs-add-btn'; addBtn.textContent = '+ New book';
  addBtn.addEventListener('click', () => authorNewBook());
  container.appendChild(addBtn);

  const stored = await getAllBooks();
  if (stored.length === 0) {
    const p = document.createElement('p');
    p.className = 'bs-empty'; p.textContent = 'No books yet.';
    container.appendChild(p); return;
  }

  stored.sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0)).forEach(entry => {
    const card = document.createElement('div');
    card.className = 'bs-card';
    card.innerHTML = `
      <div class="bs-card-info" style="display:flex;align-items:center;gap:12px;">
        <div class="author-cover-thumb" style="width:36px;height:36px;border-radius:50%;background:${entry.bundle?.book?.cover || '#7b4fa6'};flex-shrink:0;overflow:hidden;">
          ${entry.bundle?.book?.cover?.startsWith('data:') ? `<img src="${entry.bundle.book.cover}" style="width:100%;height:100%;object-fit:cover;">` : ''}
        </div>
        <div>
          <div class="bs-card-title">${bsEsc(entry.title)}</div>
          ${entry.author ? `<div class="bs-card-author">${bsEsc(entry.author)}</div>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="bs-add-btn author-edit-btn" data-id="${bsEsc(entry.id)}">Edit</button>
        <button class="bs-card-remove" aria-label="Delete">✕</button>
      </div>
    `;
    card.querySelector('.author-edit-btn').addEventListener('click', e => {
      e.stopPropagation(); authorOpenBookEditor(entry.id);
    });
    card.querySelector('.bs-card-remove').addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm(`Delete "${entry.title}"? This cannot be undone.`)) return;
      await removeBook(entry.id);
      renderStudioBooksList();
    });
    container.appendChild(card);
  });
}
```

- [ ] Wire `renderStudioBooksList()` when the Books nav item is clicked and when Studio first opens.

### Task 5.2 — New book + metadata editor

**Files:** Continue §19 AUTHOR

- [ ] Add CSS for the author form to the `<style>` block:

```css
/* ── Author / Book Editor ─────────────────────────────────────── */
.author-field-group { margin-bottom: 20px; }
.author-label { font-family: var(--ui-font); font-size: .6rem; letter-spacing: .08em; text-transform: uppercase; color: var(--text-d); display: block; margin-bottom: 5px; }
.author-input { background: var(--surf2); border: 1px solid var(--border); color: var(--text); font-family: var(--book-font); font-size: .9rem; padding: 6px 10px; width: 100%; transition: border-color var(--t); }
.author-input:focus { border-color: var(--accent); outline: none; }
.author-textarea { resize: vertical; min-height: 80px; }
.author-save-btn { background: var(--accent-dim); border: 1px solid var(--accent); color: var(--text); font-family: var(--ui-font); font-size: .62rem; letter-spacing: .06em; padding: 7px 18px; cursor: pointer; transition: background var(--t); }
.author-save-btn:hover { background: var(--accent); color: #000; }
.author-cover-preview { width: 72px; height: 72px; border-radius: 50%; overflow: hidden; display: inline-block; border: 1px solid var(--border); vertical-align: middle; margin-left: 10px; }
.author-cover-preview img { width: 100%; height: 100%; object-fit: cover; }
.author-const-tag { display: inline-flex; align-items: center; gap: 4px; background: var(--surf2); border: 1px solid var(--border); border-radius: 10px; padding: 3px 8px; font-family: var(--ui-font); font-size: .6rem; color: var(--text-m); margin: 2px; cursor: pointer; }
.author-const-tag.selected { border-color: var(--accent); color: var(--accent); background: var(--accent-bg); }
```

- [ ] Implement `authorNewBook()` — creates a blank IDB entry and opens the editor:

```javascript
async function authorNewBook() {
  const id = `book-${Date.now()}`;
  const emptyBundle = {
    book: { id, title: 'New Book', author: '', year: 2000, region: '', theme: '', summary: '', cover: '#7b4fa6', letters: [] },
    context: { entries: [] },
    fiction: { gap_scenes: [], letter_reimaginings: [] },
  };
  await saveBook({ id, bundle: emptyBundle, title: 'New Book', author: '', lastOpened: Date.now() });
  authorOpenBookEditor(id);
}
```

- [ ] Implement `authorOpenBookEditor(bookId)` — renders metadata form in `#studio-book-editor`:

```javascript
async function authorOpenBookEditor(bookId) {
  studioShowSection('book-editor');
  const entry = await getBook(bookId);
  if (!entry) return;
  const bk = entry.bundle.book;
  const container = document.getElementById('studio-book-editor');
  container.innerHTML = `<p class="studio-section-title">Book Editor</p>`;

  // Metadata fields
  const fields = [
    { key:'title',   label:'Title',         type:'text'     },
    { key:'author',  label:'Author',        type:'text'     },
    { key:'year',    label:'Year (negative = BCE)', type:'number' },
    { key:'region',  label:'Region',        type:'text'     },
    { key:'theme',   label:'Theme',         type:'text'     },
    { key:'summary', label:'Summary',       type:'textarea' },
  ];
  const inputs = {};
  fields.forEach(f => {
    const grp = document.createElement('div'); grp.className = 'author-field-group';
    const lbl = document.createElement('label'); lbl.className = 'author-label'; lbl.textContent = f.label;
    const inp = f.type === 'textarea' ? document.createElement('textarea') : document.createElement('input');
    inp.className = 'author-input' + (f.type === 'textarea' ? ' author-textarea' : '');
    if (f.type !== 'textarea') inp.type = f.type;
    inp.value = bk[f.key] ?? '';
    grp.appendChild(lbl); grp.appendChild(inp); container.appendChild(grp);
    inputs[f.key] = inp;
  });

  // Cover image
  container.appendChild(_authorCoverField(bk, entry, bookId));

  // Constellation assignment
  container.appendChild(_authorConstellationField(bk, bookId));

  // Save button
  const saveBtn = document.createElement('button');
  saveBtn.className = 'author-save-btn'; saveBtn.textContent = 'Save metadata';
  saveBtn.addEventListener('click', async () => {
    fields.forEach(f => { bk[f.key] = f.type === 'number' ? parseInt(inputs[f.key].value) || 0 : inputs[f.key].value; });
    entry.title = bk.title; entry.author = bk.author;
    await saveBook(entry);
    showFeedback('Saved.');
    renderStudioBooksList();
  });
  container.appendChild(saveBtn);

  // Letters section
  container.appendChild(_authorLettersSection(bk, entry, bookId));
}
```

### Task 5.3 — Cover image upload

**Files:** Continue §19 AUTHOR

- [ ] Implement `_authorCoverField(bk, entry, bookId)` — returns a DOM element with colour input, image upload, and preview:

```javascript
function _authorCoverField(bk, entry, bookId) {
  const grp = document.createElement('div'); grp.className = 'author-field-group';
  const lbl = document.createElement('label'); lbl.className = 'author-label'; lbl.textContent = 'Cover';
  grp.appendChild(lbl);

  // Preview
  const preview = document.createElement('div'); preview.className = 'author-cover-preview';
  _authorUpdateCoverPreview(preview, bk.cover);

  // Colour fallback
  const colInp = document.createElement('input'); colInp.type = 'color'; colInp.className = 'token-color-swatch';
  colInp.style.width = '32px'; colInp.style.height = '32px';
  colInp.value = bk.cover?.startsWith('#') ? bk.cover : '#7b4fa6';
  colInp.addEventListener('input', () => {
    bk.cover = colInp.value; _authorUpdateCoverPreview(preview, bk.cover);
    saveBook(entry);
  });

  // Image upload
  const uploadBtn = document.createElement('button'); uploadBtn.className = 'bs-add-btn'; uploadBtn.textContent = '+ Upload image';
  uploadBtn.addEventListener('click', () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = async () => {
      const file = inp.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = async e => {
        bk.cover = e.target.result; // base64 data URL
        _authorUpdateCoverPreview(preview, bk.cover);
        await saveBook(entry);
        showFeedback('Cover saved.');
      };
      reader.readAsDataURL(file);
    };
    inp.click();
  });

  const row = document.createElement('div'); row.style.cssText = 'display:flex;align-items:center;gap:10px;margin-top:6px;';
  row.appendChild(colInp); row.appendChild(uploadBtn); row.appendChild(preview);
  grp.appendChild(row);
  return grp;
}

function _authorUpdateCoverPreview(previewEl, cover) {
  if (cover?.startsWith('data:') || cover?.startsWith('http')) {
    previewEl.innerHTML = `<img src="${cover}" alt="Cover" style="width:100%;height:100%;object-fit:cover;">`;
  } else {
    previewEl.style.background = cover || '#7b4fa6';
    previewEl.innerHTML = '';
  }
}
```

### Task 5.4 — Constellation assignment

**Files:** Continue §19 AUTHOR

- [ ] Implement `_authorConstellationField(bk, bookId)` — shows auto-assigned constellations as toggleable tags. Each tag shows which constellation and can be clicked to add/remove:

```javascript
function _authorConstellationField(bk, bookId) {
  const grp = document.createElement('div'); grp.className = 'author-field-group';
  const lbl = document.createElement('label'); lbl.className = 'author-label'; lbl.textContent = 'Constellations';
  grp.appendChild(lbl);
  // Auto-compute which constellations this book currently belongs to
  const autoSuggested = _skyAutoAssignPreview(bk);
  const tagRow = document.createElement('div'); tagRow.style.marginTop = '6px';
  SKY_CONSTELLATIONS.forEach(con => {
    const inCon = con.bookIds.includes(bookId);
    const auto  = autoSuggested.includes(con.id);
    const tag = document.createElement('button');
    tag.className = 'author-const-tag' + (inCon ? ' selected' : '');
    tag.textContent = con.label + (auto && !inCon ? ' (auto)' : '');
    tag.type = 'button';
    tag.addEventListener('click', async () => {
      const idx = con.bookIds.indexOf(bookId);
      if (idx === -1) { con.bookIds.push(bookId); tag.classList.add('selected'); }
      else { con.bookIds.splice(idx, 1); tag.classList.remove('selected'); }
      // Persist the manual assignment in the book bundle so it survives reload.
      // Store as bundle.constellations: { eras: bool, regions: bool, themes: bool }
      const e2 = await getBook(bookId);
      if (e2) {
        e2.bundle.constellations = Object.fromEntries(
          SKY_CONSTELLATIONS.map(c => [c.id, c.bookIds.includes(bookId)])
        );
        await saveBook(e2);
      }
    });
    tagRow.appendChild(tag);
  });
  const note = document.createElement('p');
  note.style.cssText = 'font-size:.6rem;color:var(--text-d);margin-top:6px;font-family:var(--ui-font);';
  note.textContent = 'Auto-assigned from region/theme/year. Click to override.';
  grp.appendChild(tagRow); grp.appendChild(note);
  return grp;
}

// Pure — testable
function _skyAutoAssignPreview(bookData) {
  const result = [];
  if (bookData.year !== undefined) result.push('eras');
  if (bookData.region) result.push('regions');
  if (bookData.theme) result.push('themes');
  return result;
}
```

### Task 5.5 — Letter authoring

**Files:** Continue §19 AUTHOR

- [ ] Implement `_authorLettersSection(bk, entry, bookId)` — shows existing letters + add/delete/edit. Each letter has a `contenteditable` paragraph area for the `plain_english` view:

```javascript
function _authorLettersSection(bk, entry, bookId) {
  const section = document.createElement('div'); section.style.marginTop = '32px';
  const h = document.createElement('p'); h.className = 'studio-section-title'; h.textContent = 'Letters';
  section.appendChild(h);

  const addBtn = document.createElement('button'); addBtn.className = 'bs-add-btn'; addBtn.textContent = '+ New letter';
  addBtn.addEventListener('click', async () => {
    const lid = `letter-${String(bk.letters.length + 1).padStart(3,'0')}`;
    bk.letters.push({ id: lid, date: '', sender: '', recipient: '', views: { plain_english: 'Letter body here.' } });
    await saveBook(entry);
    // Re-render letters section in-place
    const updated = section.querySelector('.author-letters-list');
    if (updated) updated.replaceWith(_authorLettersList(bk, entry));
  });
  section.appendChild(addBtn);

  section.appendChild(_authorLettersList(bk, entry));
  return section;
}

function _authorLettersList(bk, entry) {
  const list = document.createElement('div'); list.className = 'author-letters-list';
  bk.letters.forEach((letter, idx) => {
    const card = document.createElement('div');
    card.style.cssText = 'border:1px solid var(--border);padding:12px;margin-top:8px;';

    const metaRow = document.createElement('div');
    metaRow.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;';
    ['id','date','sender','recipient'].forEach(k => {
      const inp = document.createElement('input'); inp.className = 'author-input';
      inp.style.cssText = 'font-size:.72rem;padding:3px 6px;width:auto;flex:1;min-width:80px;';
      inp.placeholder = k; inp.value = letter[k] || '';
      inp.addEventListener('blur', async () => { letter[k] = inp.value; await saveBook(entry); });
      metaRow.appendChild(inp);
    });

    const body = document.createElement('div');
    body.contentEditable = 'true';
    body.style.cssText = 'font-family:var(--book-font);font-size:.9rem;line-height:1.8;color:var(--text);min-height:60px;padding:8px;border:1px solid var(--border);margin-top:4px;outline:none;';
    body.textContent = letter.views?.plain_english || '';
    body.addEventListener('blur', async () => {
      letter.views = letter.views || {};
      letter.views.plain_english = body.innerText;
      await saveBook(entry);
    });

    const delBtn = document.createElement('button'); delBtn.className = 'bs-card-remove'; delBtn.textContent = '✕ Delete letter';
    delBtn.addEventListener('click', async () => {
      bk.letters.splice(idx, 1); await saveBook(entry); card.remove();
    });

    card.appendChild(metaRow); card.appendChild(body); card.appendChild(delBtn);
    list.appendChild(card);
  });
  return list;
}
```

### Task 5.6 — Export section

**Files:** Continue §19 AUTHOR

- [ ] Render the Export section in Studio. Provides two actions: download bundle, and a "Restore book from file" upload:

```javascript
function renderStudioExport() {
  const container = document.getElementById('studio-export');
  container.innerHTML = '<p class="studio-section-title">Export</p>';

  const dl = document.createElement('button'); dl.className = 'author-save-btn'; dl.textContent = 'Download current book bundle (.json)';
  dl.addEventListener('click', async () => {
    if (!_currentBookId) { showFeedback('No book open.'); return; }
    const entry = await getBook(_currentBookId);
    if (!entry) return;
    downloadBundle(entry.bundle.book, entry.bundle.context, entry.bundle.fiction);
  });

  const note = document.createElement('p');
  note.style.cssText = 'font-family:var(--ui-font);font-size:.65rem;color:var(--text-d);margin-top:12px;line-height:1.6;';
  note.textContent = 'The bundle is also saved automatically to your browser (IndexedDB) after every edit. Download is for backup or sharing.';

  container.appendChild(dl); container.appendChild(note);
}
```

- [ ] Wire `renderStudioBooksList()`, `renderStudioExport()` to their nav items in `initStudio()`.

- [ ] Cover images: update `_skyDrawNode()` in §15 to load cover images from `book.cover` when it is a data URL:

```javascript
// In _skyBuildTimelineNodes() / initSkyLibrary(), after building nodes:
_skyBookNodes.forEach(n => {
  if (n.book.cover?.startsWith('data:') || n.book.cover?.startsWith('http')) {
    const img = new Image(); img.src = n.book.cover;
    img.onload = () => { n.img = img; n.imgLoaded = true; };
  }
});
```

- [ ] Smoke test: open Studio → Books → New book. Fill in title/author/year/region/theme. Upload a cover image → preview shows in circle. Assign constellations. Create two letters, edit their text. Close Studio → open sky → new book appears as a node in the correct constellation(s) with cover image. Download bundle → valid JSON with all data.

- [ ] Commit Stage 5:

```bash
git add index.html
git commit -m "feat: book authoring — CRUD, cover images, letters, constellation assignment (Stage 5)"
```

---

## Stage 6 — Primitives (`§20 PRIMITIVES`)

App-wide layout and component defaults, plus per-book overrides. Stored in localStorage (app-wide) and in the book bundle (per-book). Applied on load. Editable in Studio under Primitives.

### Task 6.1 — Primitives schema + storage

**Files:** `§20 PRIMITIVES` (new section)

- [ ] Add `§20 PRIMITIVES`. Define the schema — two scopes, each stored separately:

```javascript
// ── §20 PRIMITIVES ────────────────────────────────────────────────────────────

const PRIMITIVES_LS_KEY = 'isabelle-v2-primitives';

// App-wide primitive defaults
const PRIMITIVES_APP_DEFAULTS = {
  // Layout
  'layout.sidebar.visible':      true,
  'layout.context.visible':      false,
  'layout.bottomBar.visible':    true,
  // Letter display
  'letter.maxWidth':             '640px',
  'letter.padding':              '48px 60px 40px',
  'letter.lineHeight':           '1.82',
  // Navigation
  'nav.defaultView':             'plain_english',
  'nav.autoAdvance':             false,
};

// Pure — testable
function primitivesLoadApp() {
  try {
    const raw = localStorage.getItem(PRIMITIVES_LS_KEY);
    return Object.assign({}, PRIMITIVES_APP_DEFAULTS, raw ? JSON.parse(raw) : {});
  } catch { return { ...PRIMITIVES_APP_DEFAULTS }; }
}

function primitivesSaveApp(prims) {
  localStorage.setItem(PRIMITIVES_LS_KEY, JSON.stringify(prims));
}

// Per-book — stored in bundle at bundle.primitives
function primitivesLoadBook(bundle) {
  return Object.assign({}, PRIMITIVES_APP_DEFAULTS, bundle?.primitives || {});
}

function primitivesSaveBook(bundle, prims) {
  bundle.primitives = prims;
}

// Merge: per-book overrides app-wide, app-wide overrides defaults
function primitivesResolve(appPrims, bookPrims) {
  return Object.assign({}, appPrims, bookPrims || {});
}
```

### Task 6.2 — Apply primitives

**Files:** Continue §20 PRIMITIVES

- [ ] Implement `primitivesApply(resolved)` — applies the resolved primitives to the DOM:

```javascript
function primitivesApply(resolved) {
  // Sidebar visibility
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.toggle('collapsed', !resolved['layout.sidebar.visible']);

  // Context pane visibility
  const ctx = document.getElementById('context-pane');
  if (ctx) ctx.classList.toggle('collapsed', !resolved['layout.context.visible']);

  // Letter content styling
  const letterContent = document.getElementById('letter-content');
  if (letterContent) {
    letterContent.style.padding = resolved['letter.padding'] || '';
  }
  document.querySelectorAll('.letter-paragraph').forEach(p => {
    p.style.maxWidth = resolved['letter.maxWidth'] || '';
    p.style.lineHeight = resolved['letter.lineHeight'] || '';
  });
}

function initPrimitives() {
  const appPrims = primitivesLoadApp();
  primitivesApply(appPrims);
}
```

- [ ] Add `initPrimitives()` call to `§14 APP init()`, after `initTokens()`:

```javascript
initPrimitives();
```

- [ ] When a book loads, resolve and apply per-book primitives:

```javascript
// In init(), after book data is loaded (after: book = data.book):
const bookPrims = primitivesLoadBook(entry?.bundle);
const appPrims  = primitivesLoadApp();
primitivesApply(primitivesResolve(appPrims, bookPrims));
```

### Task 6.3 — Primitives Studio UI

**Files:** Continue §20 PRIMITIVES

- [ ] Implement `renderPrimitivesStudio()` — renders toggle/input controls for each primitive. Two tabs: App Defaults and This Book. Fetch the current book entry upfront so the app-defaults `onChange` can correctly resolve per-book overrides:

```javascript
async function renderPrimitivesStudio() {
  const container = document.getElementById('studio-primitives');
  container.innerHTML = '<p class="studio-section-title">Primitives</p>';

  // Fetch book entry upfront — needed so app-defaults onChange can resolve correctly
  const bookEntry = _currentBookId ? await getBook(_currentBookId) : null;

  const tabRow = document.createElement('div');
  tabRow.style.cssText = 'display:flex;gap:8px;margin-bottom:20px;';
  const tabApp  = _primitivesTab('App defaults', true);
  const tabBook = _primitivesTab('This book', false);
  tabRow.appendChild(tabApp); tabRow.appendChild(tabBook);
  container.appendChild(tabRow);

  const appPane  = document.createElement('div'); appPane.id = 'prims-app-pane';
  const bookPane = document.createElement('div'); bookPane.id = 'prims-book-pane'; bookPane.style.display = 'none';

  _renderPrimitivesForm(appPane, primitivesLoadApp(), (prims) => {
    primitivesSaveApp(prims);
    // Use the already-fetched bookEntry — not primitivesLoadBook(null)
    primitivesApply(primitivesResolve(prims, primitivesLoadBook(bookEntry?.bundle)));
  });

  // Per-book only shows if a book is open
  if (_currentBookId) {
    getBook(_currentBookId).then(entry => {
      const bookPrims = primitivesLoadBook(entry?.bundle);
      _renderPrimitivesForm(bookPane, bookPrims, async (prims) => {
        if (!entry) return;
        primitivesSaveBook(entry.bundle, prims);
        await saveBook(entry);
        primitivesApply(primitivesResolve(primitivesLoadApp(), prims));
      }, true);
    });
  } else {
    bookPane.innerHTML = '<p style="font-family:var(--ui-font);font-size:.65rem;color:var(--text-d);">Open a book to set per-book overrides.</p>';
  }

  tabApp.addEventListener('click', () => { appPane.style.display=''; bookPane.style.display='none'; });
  tabBook.addEventListener('click', () => { appPane.style.display='none'; bookPane.style.display=''; });

  container.appendChild(appPane); container.appendChild(bookPane);
}

function _primitivesTab(label, active) {
  const b = document.createElement('button'); b.className = 'bar-text-btn';
  b.textContent = label; if (active) b.style.borderColor = 'var(--accent)';
  return b;
}

function _renderPrimitivesForm(container, prims, onChange, isBook = false) {
  container.innerHTML = '';
  Object.entries(PRIMITIVES_APP_DEFAULTS).forEach(([key, defaultVal]) => {
    const row = document.createElement('div'); row.className = 'token-row';
    const label = document.createElement('span'); label.className = 'token-label'; label.textContent = key;
    const isBool = typeof defaultVal === 'boolean';
    let control;
    if (isBool) {
      control = document.createElement('input'); control.type = 'checkbox';
      control.checked = prims[key] ?? defaultVal;
      control.addEventListener('change', () => {
        prims[key] = control.checked; onChange(prims);
      });
    } else {
      control = document.createElement('input'); control.className = 'token-input';
      control.value = prims[key] ?? defaultVal;
      control.addEventListener('blur', () => { prims[key] = control.value; onChange(prims); });
    }
    const reset = document.createElement('button'); reset.className = 'token-reset-btn'; reset.textContent = '↺';
    reset.addEventListener('click', () => {
      prims[key] = defaultVal;
      if (isBool) control.checked = defaultVal; else control.value = defaultVal;
      onChange(prims);
    });
    row.appendChild(label); row.appendChild(control); row.appendChild(reset);
    container.appendChild(row);
  });
}
```

- [ ] Wire `renderPrimitivesStudio()` to the Primitives nav item in `initStudio()`. Note it is `async` so wrap in an arrow:

```javascript
document.querySelector('.studio-nav-item[data-section="primitives"]')
  .addEventListener('click', () => renderPrimitivesStudio());
```

- [ ] Smoke test: open Studio → Primitives → App defaults. Toggle `layout.sidebar.visible` off → sidebar hides immediately. Reset → restores. Switch to "This book" tab → shows same controls stored in the book bundle. Values survive reload.

- [ ] Commit Stage 6:

```bash
git add index.html
git commit -m "feat: primitives system — app-wide defaults + per-book overrides (Stage 6)"
```

---

## Final — Merge + PR

- [ ] Run a full smoke test of all 6 stages together:
  1. Fresh IDB (clear site data) — sky appears on load
  2. Author a new book in Studio — appears in sky
  3. Open book from sky — reader loads
  4. Open Studio → Token Studio — change accent colour → live update
  5. Open Studio → Primitives — toggle sidebar → hides
  6. Toolbar edit mode — drag icon, right-click to resize, icon persists on reload
  7. `closeSky(true)` → reverse burst. `closeSky(false)` → instant.

- [ ] Verify no console errors on load, on sky → reader transition, on Studio open/close.

- [ ] Push branch and open PR:

```bash
git push -u origin feature/night-sky-library-studio
gh pr create \
  --title "Night Sky Library + Studio (Stages 1–6)" \
  --body "$(cat <<'EOF'
## Summary

- **Stage 1:** Night sky library with horizontal timeline burst. Replaces blank no-books state. Books open via `?id=`.
- **Stage 2:** Configurable bottom bar — drag to reorder, right-click to resize/swap icons. Config persists to localStorage.
- **Stage 3:** Full-screen Studio overlay with nav (Books, Book Editor, Tokens, Toolbar, Primitives, Export).
- **Stage 4:** Shared token store drives CSS custom properties + sky canvas renderer. Live Token Studio UI.
- **Stage 5:** Book authoring — CRUD, cover image upload (base64 in bundle), letter editor, auto + manual constellation assignment.
- **Stage 6:** Primitives system — app-wide defaults + per-book overrides for layout, letter display, and navigation.

## Test plan

- [ ] Fresh browser (cleared IDB) → sky appears
- [ ] Click constellation → burst → timeline
- [ ] Author a book in Studio → appears in sky with cover
- [ ] Token Studio: change sky hue → canvas re-draws
- [ ] Toolbar edit mode: reorder + resize icons persist
- [ ] Primitives: sidebar toggle works app-wide and per-book
- [ ] No console errors across all transitions

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Wait for review before merging.**

---

*Plan saved: `docs/superpowers/plans/2026-04-02-night-sky-library-studio.md`*
