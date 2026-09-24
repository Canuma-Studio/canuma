// Canuma Studio – Script
const INK = '#1c1c1c';
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const stage = document.querySelector('.stage');
const box = document.querySelector('.sticky');
const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');
const svg = document.querySelector('.sticky svg.logo');
const inside = document.querySelector('.inside');
const dist = document.querySelector('.dist');
const scaleEl = document.querySelector('.scale');
for (let i = 0; i < 31; i++) scaleEl.appendChild(document.createElement('i'));
const needle = document.createElement('b'); scaleEl.appendChild(needle);
const stops = ['∞', '10 m', '5 m', '3 m', '2 m', '1.5 m', '1 m', '0.7 m', '0.5 m', '0.3 m'];

// Das Logo als Vektor-Pfade: bleibt bei jedem Zoom gestochen scharf
const RING = new Path2D(svg.querySelector('.ring').getAttribute('d'));
const DOT = new Path2D(); DOT.arc(325.56, 145, 25.5, 0, Math.PI * 2);
const LETTERS = [...svg.querySelectorAll('.word path, .sub path')].map(p => new Path2D(p.getAttribute('d')));
const VB = { x: 40, y: 45, w: 571, h: 340 };
const F = { x: 281.56, y: 145 };   // Zielpunkt: in der Lücke zwischen Ring und Punkt

function drawLogo(textAlpha, g = ctx) {
  g.fillStyle = INK; g.strokeStyle = INK; g.lineWidth = 22.525;
  g.stroke(RING); g.fill(DOT);
  if (textAlpha > 0) { g.globalAlpha = textAlpha; for (const l of LETTERS) g.fill(l, 'evenodd'); g.globalAlpha = 1; }
}
// Das Logo wird pro Bild nur EINMAL gezeichnet (hier hinein); die Stücke sind danach nur noch Bildausschnitte davon – viel schneller auf dem Handy
const off = document.createElement('canvas'), octx = off.getContext('2d');
let lastP = -1, lastMoving = 0, lastA = -1;

let W, H, dpr, k0 = 1, ox = 0, oy = 0, cu = 10, cells = [], maxS = 40;
let mouse = { x: -9999, y: -9999, px: -9999, py: -9999 };
const bursts = [];   // Antippen/Klicken: lässt das Logo an dieser Stelle zerspringen
const now = () => performance.now();

// Welche Quadrate überhaupt Logo enthalten: einmal in ein kleines Hilfsbild zeichnen und nachschauen
function build() {
  const lw = Math.min(W * .8, 640);
  k0 = lw / VB.w;
  ox = (W - lw) / 2; oy = (H - VB.h * k0) / 2 - H * .03;
  cu = (lw < 420 ? 10 : 12) / k0;   // Kantenlänge eines Stücks, in Logo-Einheiten
  const far = Math.max(...[[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => Math.hypot(x - sx(F.x), y - sy(F.y))));
  maxS = far / (18.5 * .95 * k0);

  const q = 2, t = document.createElement('canvas');
  t.width = VB.w * q; t.height = VB.h * q;
  const g = t.getContext('2d'); g.scale(q, q); g.translate(-VB.x, -VB.y);
  g.lineWidth = 22.525; g.stroke(RING); g.fill(DOT); for (const l of LETTERS) g.fill(l, 'evenodd');
  const data = g.getImageData(0, 0, t.width, t.height).data;
  cells = [];
  for (let uy = VB.y; uy < VB.y + VB.h; uy += cu) for (let ux = VB.x; ux < VB.x + VB.w; ux += cu) {
    let hit = false;
    for (let y = (uy - VB.y) * q | 0; y < Math.min((uy + cu - VB.y) * q, t.height) && !hit; y++)
      for (let x = (ux - VB.x) * q | 0; x < Math.min((ux + cu - VB.x) * q, t.width); x++)
        if (data[(y * t.width + x) * 4 + 3] > 0) { hit = true; break; }
    if (hit) cells.push({ ux, uy, word: uy > 235, dx: 0, dy: 0, vx: 0, vy: 0, r: 0, vr: 0, t: 0, loose: false });
  }
}
// Umrechnung Logo-Einheiten → Bildschirm, mit aktuellem Zoom s um den Zielpunkt F
let s = 1;
const sx = u => ox + (F.x - VB.x) * k0 + (u - F.x) * k0 * s;
const sy = u => oy + (F.y - VB.y) * k0 + (u - F.y) * k0 * s;
function toUnits() { const k = k0 * s; ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (sx(0)), dpr * (sy(0))); }

// ---------- Die Studio-Überschrift setzt sich aus Scherben zusammen ----------
const h2 = inside.querySelector('h2');
let shards = [], sheetT = null, gs = 8;
function buildShards() {
  lastP = -1;
  const bb = box.getBoundingClientRect(), cs = getComputedStyle(h2);
  gs = W < 640 ? 11 : 8;   // Handy: grössere, dafür weniger Scherben (flüssiger)
  // Das Hilfsbild nur so gross wie die Überschrift machen, nicht bildschirmgross – das Handy muss viel weniger umherkopieren
  const hb = h2.getBoundingClientRect();
  const bx0 = Math.floor(hb.left - bb.left) - gs, by0 = Math.floor(hb.top - bb.top) - gs;
  sheetT = document.createElement('canvas');
  sheetT.width = Math.ceil((hb.width + gs * 3) * dpr); sheetT.height = Math.ceil((hb.height + gs * 3) * dpr);
  sheetT.ox = bx0; sheetT.oy = by0;
  const g = sheetT.getContext('2d'); g.scale(dpr, dpr); g.translate(-bx0, -by0);
  g.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; g.fillStyle = INK; g.textBaseline = 'alphabetic';
  const asc = g.measureText('Hg').fontBoundingBoxAscent;
  // Jeden Buchstaben genau dort ins Hilfsbild zeichnen, wo der Browser ihn setzt
  const node = h2.firstChild, range = document.createRange();
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (let i = 0; i < node.length; i++) {
    range.setStart(node, i); range.setEnd(node, i + 1);
    const r = range.getClientRects()[0]; if (!r || !node.data[i].trim()) continue;
    const x = r.left - bb.left, y = r.top - bb.top;
    g.fillText(node.data[i], x, y + asc);
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x + r.width); maxY = Math.max(maxY, y + r.height);
  }
  const data = g.getImageData(0, 0, sheetT.width, sheetT.height).data;
  shards = [];
  for (let y = Math.floor(minY); y < maxY; y += gs) for (let x = Math.floor(minX); x < maxX; x += gs) {
    let hit = false;
    for (let yy = (y - by0) * dpr | 0; yy < (y - by0 + gs) * dpr && !hit; yy += 2) for (let xx = (x - bx0) * dpr | 0; xx < (x - bx0 + gs) * dpr; xx += 2)
      if (data[(yy * sheetT.width + xx) * 4 + 3] > 20) { hit = true; break; }
    if (!hit) continue;
    const ang = Math.random() * Math.PI * 2, far = Math.max(W, H) * (.35 + Math.random() * .5);
    shards.push({ x, y, sx: x + Math.cos(ang) * far, sy: y + Math.sin(ang) * far, r: (Math.random() - .5) * 8, d: Math.random() * .55 });
  }
}
function drawShards(p) {
  const a2 = Math.min(1, Math.max(0, (p - .6) / .26));   // 0 = Scherben weit verstreut, 1 = fertiges Wort
  h2.style.opacity = a2 >= 1 ? 1 : 0;
  if (a2 <= 0 || a2 >= 1 || !sheetT) return;
  const gd = gs * dpr, sox = sheetT.ox, soy = sheetT.oy;
  let ga = 1;
  for (const q of shards) {
    const t = Math.min(1, Math.max(0, (a2 - q.d) / (1 - q.d)));
    if (!t) continue;
    const e = 1 - Math.pow(1 - t, 3);
    const x = q.sx + (q.x - q.sx) * e + gs / 2, y = q.sy + (q.y - q.sy) * e + gs / 2;
    if (x < -gs || y < -gs || x > W + gs || y > H + gs) continue;   // ausserhalb des Bildschirms: nicht zeichnen
    const al = Math.min(1, t * 4); if (al !== ga) ctx.globalAlpha = ga = al;
    // Drehung direkt setzen statt save/restore – spart auf dem Handy viel Zeit
    const rot = q.r * (1 - e), c = Math.cos(rot) * dpr, sn = Math.sin(rot) * dpr;
    ctx.setTransform(c, sn, -sn, c, x * dpr, y * dpr);
    ctx.drawImage(sheetT, (q.x - sox) * dpr, (q.y - soy) * dpr, gd, gd, -gs / 2, -gs / 2, gs, gs);
  }
  ctx.globalAlpha = 1; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function resize() {
  dpr = Math.min(devicePixelRatio || 1, 2);   // Handy jetzt auch 2× – schärfere Kanten
  W = box.clientWidth; H = box.clientHeight;
  canvas.width = off.width = W * dpr; canvas.height = off.height = H * dpr;
  s = 1; build(); lastP = -1;
}

const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// Auf dem Handy liefert das Scrollen die Position unregelmässig (vor allem beim Nachschwingen nach dem Wischen).
// Darum folgt der Zoom dort der Scroll-Position weich nachgezogen statt ruckartig.
const touchDev = matchMedia('(pointer: coarse)').matches;
let ps = -1, lastT = 0;

function tickInner() {
  const r = stage.getBoundingClientRect();
  if (r.bottom < 0) { lastP = -1; ps = -1; requestAnimationFrame(tick); return; }   // Bühne ganz weggescrollt: Pause
  // box-Höhe statt innerHeight: auf dem iPhone ändert sich innerHeight, wenn die Adressleiste ein-/ausfährt – das gab Sprünge
  const target = Math.min(1, Math.max(0, -r.top / (stage.offsetHeight - H)));
  const T0 = now(), dt = lastT ? Math.min(64, T0 - lastT) : 16.7; lastT = T0;
  let p = target;
  if (touchDev && !reduce) {
    if (ps < 0 || Math.abs(target - ps) > .5) ps = target;
    else ps += (target - ps) * (1 - Math.pow(.8, dt / 16.7));
    if (Math.abs(target - ps) < .0003) ps = target;
    p = ps;
  }
  const z = ease(Math.min(1, p / .72));
  s = 1 + (maxS - 1) * z * z * z;
  const textAlpha = Math.max(0, 1 - p * 6);
  const piece = cu * k0 * s;                   // Stückgrösse auf dem Bildschirm

  // Maus: Geschwindigkeit bestimmt, wie viel zerbricht
  const mvx = mouse.x - mouse.px, mvy = mouse.y - mouse.py; mouse.px = mouse.x; mouse.py = mouse.y;
  const speed = Math.min(40, Math.hypot(mvx, mvy));
  const R = Math.max(55, Math.min(piece * 1.3, 420)) + speed;
  const kf = Math.min(4, Math.max(1, piece / 30));   // grosse Stücke (beim Hineinzoomen) brauchen mehr Schwung
  if (p === lastP && !lastMoving && !bursts.length && speed <= .5) { requestAnimationFrame(tick); return; }   // Stillstand: nichts neu zeichnen
  lastP = p;
  const T = now(), moving = [];

  const hits = bursts.splice(0);
  for (const c of cells) {
    if (c.word && !textAlpha) continue;
    const hx = sx(c.ux + cu / 2), hy = sy(c.uy + cu / 2);
    for (const b of hits) {
      const ddx = hx + c.dx - b.x, ddy = hy + c.dy - b.y, d = Math.hypot(ddx, ddy) || 1, BR = Math.max(W < 640 ? 70 : 90, Math.min(piece * 2, 520));
      if (d < BR) {
        const f = (BR - d) / BR;
        c.vx += (ddx / d * 9 + (Math.random() - .5) * 4) * f * kf; c.vy += (ddy / d * 9 + (Math.random() - .5) * 4) * f * kf;
        c.vr += (Math.random() - .5) * f * .4; c.t = T; c.loose = true;
      }
    }
    if (speed > .5) {
      const ddx = hx + c.dx - mouse.x, ddy = hy + c.dy - mouse.y, d2 = ddx * ddx + ddy * ddy;
      if (d2 < R * R) {
        const d = Math.sqrt(d2) || 1, f = (R - d) / R;
        c.vx += (ddx / d * 2.6 + mvx * .08 + (Math.random() - .5) * 2.4) * f * kf;
        c.vy += (ddy / d * 2.6 + mvy * .08 + (Math.random() - .5) * 2.4) * f * kf;
        c.vr += (Math.random() - .5) * f * .2;
        c.t = T; c.loose = true;
      }
    }
    if (!c.loose) continue;
    // Erst frei schweben, dann zieht es die Stücke langsam zurück
    const age = (T - c.t) / 1000;
    const pull = age < .3 ? 0 : Math.min(1, (age - .3) / .8) ** 2 * .04;
    c.vx += -c.dx * pull; c.vy += -c.dy * pull; c.vr += -c.r * pull;
    let damp = age < .3 ? .93 : .88;
    // Erst ganz am Ende des Zooms (bevor die Studio-Überschrift kommt) alles schnell zurückholen
    const hurry = Math.min(1, Math.max(0, (p - .62) / .1));
    if (hurry) { c.vx += -c.dx * .2 * hurry; c.vy += -c.dy * .2 * hurry; c.vr += -c.r * .2 * hurry; damp = Math.min(damp, .7); }
    c.vx *= damp; c.vy *= damp; c.vr *= damp;
    c.dx += c.vx; c.dy += c.vy; c.r += c.vr;
    if (age > .5 && Math.abs(c.dx) < .2 && Math.abs(c.dy) < .2 && Math.abs(c.vx) < .05 && Math.abs(c.vy) < .05 && Math.abs(c.r) < .002) {
      c.dx = c.dy = c.vx = c.vy = c.r = c.vr = 0; c.loose = false;
    } else moving.push(c);
  }

  // Zeichnen: ganzes Logo, Löcher wo Stücke fehlen, dann die Stücke selbst
  lastMoving = moving.length;
  if (!moving.length) {
    // Nichts fliegt herum: Logo direkt zeichnen, ohne Umweg über das Hilfsbild (halbiert die Arbeit beim Scrollen)
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    { const k = k0 * s; ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * sx(0), dpr * sy(0)); }
    drawLogo(textAlpha, ctx);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawShards(p);
    const a = Math.min(1, Math.max(0, (p - .82) / .12));
    if (a !== lastA) { lastA = a; inside.style.setProperty('--a', a); inside.style.pointerEvents = a > .9 ? 'auto' : 'none'; }
    dist.textContent = stops[Math.min(stops.length - 1, Math.floor(p * stops.length))];
    needle.style.left = (p * 100) + '%';
    requestAnimationFrame(tick); return;
  }
  octx.setTransform(1, 0, 0, 1, 0, 0); octx.clearRect(0, 0, off.width, off.height);
  { const k = k0 * s; octx.setTransform(dpr * k, 0, 0, dpr * k, dpr * sx(0), dpr * sy(0)); }
  drawLogo(textAlpha, octx);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(off, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const c of moving) ctx.clearRect(sx(c.ux) - .4, sy(c.uy) - .4, piece + .8, piece + .8);
  for (const c of moving) {
    const x0 = sx(c.ux), y0 = sy(c.uy), hx = x0 + piece / 2 + c.dx, hy = y0 + piece / 2 + c.dy;
    if (hx < -piece || hy < -piece || hx > W + piece || hy > H + piece) continue;
    // Ausschnitt auf den sichtbaren Bereich begrenzen (Safari mag keine Ausschnitte ausserhalb des Bildes)
    const ax = Math.max(0, x0), ay = Math.max(0, y0), bx = Math.min(W, x0 + piece), by = Math.min(H, y0 + piece);
    if (bx <= ax || by <= ay) continue;
    ctx.save();
    ctx.translate(hx, hy); ctx.rotate(c.r);
    ctx.drawImage(off, ax * dpr, ay * dpr, (bx - ax) * dpr, (by - ay) * dpr, ax - x0 - piece / 2, ay - y0 - piece / 2, bx - ax, by - ay);
    ctx.restore();
  }

  drawShards(p);
  const a = Math.min(1, Math.max(0, (p - .82) / .12));
  if (a !== lastA) { lastA = a; inside.style.setProperty('--a', a); inside.style.pointerEvents = a > .9 ? 'auto' : 'none'; }
  dist.textContent = stops[Math.min(stops.length - 1, Math.floor(p * stops.length))];
  needle.style.left = (p * 100) + '%';
  requestAnimationFrame(tick);
}

box.addEventListener('pointermove', e => { if (e.pointerType === 'touch') return; const b = canvas.getBoundingClientRect(); mouse.x = e.clientX - b.left; mouse.y = e.clientY - b.top; });
// Maus: sofort beim Klicken. Finger: erst beim Loslassen und nur, wenn es ein echtes Antippen war –
// sonst zerspringt das Logo jedes Mal, wenn man zum Scrollen den Finger aufsetzt
let down = null;
box.addEventListener('pointerdown', e => {
  const b = canvas.getBoundingClientRect(), pt = { x: e.clientX - b.left, y: e.clientY - b.top };
  if (e.pointerType === 'mouse') bursts.push(pt); else down = { ...pt, cx: e.clientX, cy: e.clientY, t: now() };
});
box.addEventListener('pointerup', e => {
  if (!down || e.pointerType === 'mouse') return;
  if (Math.hypot(e.clientX - down.cx, e.clientY - down.cy) < 12 && now() - down.t < 400) bursts.push({ x: down.x, y: down.y });
  down = null;
});
box.addEventListener('pointercancel', () => { down = null; });
box.addEventListener('pointerleave', () => { mouse.x = mouse.y = mouse.px = mouse.py = -9999; });
// Beim Scrollen bewegt sich die Seite unter der Maus – das zählt nicht als Mausbewegung
addEventListener('scroll', () => { mouse.px = mouse.x; mouse.py = mouse.y; }, { passive: true });
addEventListener('resize', () => {
  if (box.clientWidth === W && box.clientHeight === H) return;
  clearTimeout(resize.t); resize.t = setTimeout(() => { resize(); buildShards(); }, 150);
});
// Messanzeige: canuma.ch/?fps zeigt oben links Bilder pro Sekunde und Rechenzeit pro Bild
const fpsEl = /[?&]fps/.test(location.search) ? Object.assign(document.body.appendChild(document.createElement('div')), { style: 'position:fixed;left:8px;top:64px;z-index:99;font:12px/1.3 monospace;background:#1c1c1c;color:#eee8dd;padding:6px 8px;border-radius:6px;pointer-events:none;white-space:pre' }) : null;
let fN = 0, fT = now(), fWork = 0, fMax = 0, fSlow = 0, fPrev = 0;
function tick() {
  if (!fpsEl) return tickInner();
  const a = now(); tickInner(); const w = now() - a;
  fN++; fWork += w; if (fPrev && a - fPrev > 25) fSlow++; fPrev = a; fMax = Math.max(fMax, w);
  if (a - fT > 1000) {
    fpsEl.textContent = `${Math.round(fN * 1000 / (a - fT))} fps\nRechnen Ø ${(fWork / fN).toFixed(1)} ms · max ${fMax.toFixed(0)} ms\nHänger ${fSlow}\ndpr ${dpr} · ${W}×${H}`;
    fN = 0; fT = a; fWork = 0; fMax = 0; fSlow = 0;
  }
}
resize(); tick();
document.fonts.ready.then(buildShards);

// Tipp-Effekt
const t = document.querySelector('.type'), txt = t.dataset.text; let i = 0;
setTimeout(function typ() { t.textContent = txt.slice(0, ++i); if (i < txt.length) setTimeout(typ, 55); }, reduce ? 0 : 800);


// Mail-Adresse würfelt sich zurecht
const m = document.querySelector('[data-scramble]'), orig = m.textContent, chars = 'abcdefghijklmnopqrstuvwxyz@.';
m.addEventListener('pointerenter', () => {
  let f = 0; clearInterval(m.t);
  m.t = setInterval(() => {
    m.textContent = [...orig].map((c, k) => k < f / 2 ? c : chars[Math.random() * chars.length | 0]).join('');
    if (++f > orig.length * 2) { clearInterval(m.t); m.textContent = orig; }
  }, 30);
});

// ---------- Projekte: Reiter ----------
const work = document.querySelector('.work');
const tabs = [...document.querySelectorAll('[role="tab"]')];
const ink = document.querySelector('.tab-ink');
const zh = (o) => new Intl.DateTimeFormat('de-CH', { timeZone: 'Europe/Zurich', ...o });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let current = 0, workVisible = false;

function moveInk() {
  const t = tabs[current];
  ink.style.width = t.offsetWidth + 'px';
  ink.style.transform = `translateX(${t.offsetLeft}px)`;
}
function selectTab(i, focus) {
  current = (i + tabs.length) % tabs.length;
  tabs.forEach((t, k) => {
    const on = k === current, p = document.getElementById(t.getAttribute('aria-controls'));
    t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1;
    p.hidden = !on; p.classList.toggle('in', on);
  });
  if (focus) tabs[current].focus();
  moveInk(); runLoops();
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => selectTab(i));
  t.addEventListener('keydown', e => {
    const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (k) { e.preventDefault(); selectTab(current + k, true); }
    if (e.key === 'Home') { e.preventDefault(); selectTab(0, true); }
    if (e.key === 'End') { e.preventDefault(); selectTab(tabs.length - 1, true); }
  });
});
addEventListener('resize', moveInk);
document.fonts.ready.then(moveInk); moveInk();

// Licht folgt der Maus auf den dunklen Flächen
document.querySelectorAll('.visual').forEach(c => c.addEventListener('pointermove', e => {
  const b = c.getBoundingClientRect(); c.style.setProperty('--mx', e.clientX - b.left + 'px'); c.style.setProperty('--my', e.clientY - b.top + 'px');
}));

// Jede Vorschau läuft nur, wenn ihr Reiter offen und der Bereich sichtbar ist
let runId = 0;
function runLoops() {
  const id = ++runId, alive = () => id === runId;
  if (!workVisible || reduce) { loops.forEach(l => l.final()); return; }
  loops[current].run(alive);
}
new IntersectionObserver(([e]) => { workVisible = e.isIntersecting; runLoops(); }, { threshold: .15 }).observe(work);

// 01 ChefKlick: Aufgaben werden abgehakt, dann scrollt der Bildschirm zum Monatsring
const ckScreen = document.querySelector('.ck'), ckScroll = document.querySelector('.ck-scroll');
const ckPills = [...document.querySelectorAll('.ck-pill[data-total]')], ckRingsEl = document.querySelector('.ck-rings');
const ckTicks = document.querySelector('.ck-ticks');
const today = new Date(), zDay = +zh({ day: 'numeric' }).format(today);
const zY = +zh({ year: 'numeric' }).format(today), zM = +zh({ month: 'numeric' }).format(today);
const daysInMonth = new Date(zY, zM, 0).getDate();
document.querySelector('.ck-date').textContent = zh({ weekday: 'long', day: 'numeric', month: 'long' }).format(today);
document.querySelector('.ck-mname').textContent = zh({ month: 'long', year: 'numeric' }).format(today);
(function tickTime() { document.querySelector('.ck-time').textContent = zh({ hour: '2-digit', minute: '2-digit' }).format(new Date()); setTimeout(tickTime, 15000); })();
// Monatsring: ein Strich pro Tag – vergangene Tage grün (ein paar rot = offen), heute länger, Rest grau
const openDays = [5, 12, 17];
let nOk = 0, nOpen = 0;
for (let d = 1; d <= daysInMonth; d++) {
  const a = (-90 + (d - .5) * 360 / daysInMonth) * Math.PI / 180, isToday = d === zDay;
  const r1 = isToday ? 50 : 57, r2 = isToday ? 72 : 69;
  const cls = d > zDay ? 'f' : (d < zDay && openDays.includes(d)) ? 'r' : 'g';
  if (d < zDay) cls === 'r' ? nOpen++ : nOk++;
  const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  l.setAttribute('x1', 80 + Math.cos(a) * r1); l.setAttribute('y1', 80 + Math.sin(a) * r1);
  l.setAttribute('x2', 80 + Math.cos(a) * r2); l.setAttribute('y2', 80 + Math.sin(a) * r2);
  l.setAttribute('class', cls); ckTicks.appendChild(l);
}
document.querySelector('.n-ok').textContent = nOk; document.querySelector('.n-open').textContent = nOpen;
const tickLines = [...ckTicks.querySelectorAll('line')];   // alle Tage, auch die kommenden (grau) – der Ring baut sich komplett auf
function ckSet(pill, n) {
  const total = +pill.dataset.total; pill.querySelector('em').textContent = `${n}/${total}`;
  ckRingsEl.style.setProperty(pill.classList.contains('p-check') ? '--o1' : '--o2', 100 - 100 * n / total);
}
const ckY = y => ckScroll.style.setProperty('--y', y);
const ckMax = () => Math.max(0, ckScroll.offsetHeight - ckScreen.clientHeight);
const loops = [
  {
    final() { ckPills.forEach(p => ckSet(p, +p.dataset.total)); ckTicks.classList.remove('hide'); tickLines.forEach(l => l.style.opacity = ''); ckY(0); },
    async run(alive) {
      while (alive()) {
        ckY(0); ckPills.forEach(p => ckSet(p, 0));
        tickLines.forEach(l => l.style.opacity = 0);
        await sleep(1600); if (!alive()) return;
        for (const p of ckPills) {
          const total = +p.dataset.total;
          for (let n = 1; n <= total; n++) { if (!alive()) return; ckSet(p, n); await sleep(total > 10 ? 80 : 380); }
          await sleep(300);
        }
        await sleep(1200); if (!alive()) return;
        ckY(ckMax()); await sleep(1300);
        for (const l of tickLines) { if (!alive()) return; l.style.opacity = ''; await sleep(45); }
        await sleep(2800); if (!alive()) return;
        ckY(0); await sleep(1500);
      }
    }
  },
  // 02 Webseiten: Skizze -> Gestaltung -> Handy
  (() => {
    const br = document.querySelector('.browser'), ph = [...document.querySelectorAll('.phase li')];
    const show = (styled, mobile, i) => { br.classList.toggle('styled', styled); br.classList.toggle('mobile', mobile); ph.forEach((l, k) => l.classList.toggle('on', k === i)); };
    return {
      final() { show(true, false, 1); },
      async run(alive) {
        while (alive()) {
          show(false, false, 0); await sleep(1900); if (!alive()) return;
          show(true, false, 1); await sleep(2800); if (!alive()) return;
          show(true, true, 2); await sleep(3000); if (!alive()) return;
          show(true, false, 1); await sleep(1400);
        }
      }
    };
  })(),
  // 03 Fotografie: Sucher sucht den Fokus, stellt scharf, löst aus – der Teller dreht sich langsam
  (() => {
    const plate = document.querySelector('.plate'), af = document.querySelector('.af'), flash = document.querySelector('.vf-flash');
    const spots = [['38%', '40%'], ['66%', '44%'], ['50%', '52%']];
    let k = 0;
    return {
      final() { plate.classList.add('sharp'); af.classList.add('gone'); },
      async run(alive) {
        while (alive()) {
          plate.classList.remove('sharp'); af.classList.remove('gone', 'hunt');
          const [x, y] = spots[k++ % spots.length]; af.style.setProperty('--ax', x); af.style.setProperty('--ay', y);
          await sleep(900); if (!alive()) return;
          void af.offsetWidth; af.classList.add('hunt');
          await sleep(650); if (!alive()) return;
          plate.classList.add('sharp');
          await sleep(500); if (!alive()) return;
          flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
          await sleep(600); af.classList.add('gone');
          await sleep(5200);
        }
      }
    };
  })()
];
loops.forEach(l => l.final());

// ---------- Kontakt: Zürcher Uhrzeit live, Mail-Adresse wird vom Cursor angezogen ----------
const clock = document.querySelector('.clock');
const clFmt = new Intl.DateTimeFormat('de-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit', second: '2-digit' });
(function tickClock() { clock.textContent = clFmt.format(new Date()); setTimeout(tickClock, 1000 - Date.now() % 1000); })();
const kontakt = document.querySelector('#kontakt');
if (matchMedia('(pointer: fine)').matches && !reduce) {
  kontakt.addEventListener('pointermove', e => {
    const b = m.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    const dx = e.clientX - cx, dy = e.clientY - cy, d = Math.hypot(dx, dy), reach = Math.max(260, b.width * .7);
    m.style.transform = d < reach ? `translate(${dx * .18}px, ${dy * .3}px)` : '';
  });
  kontakt.addEventListener('pointerleave', () => { m.style.transform = ''; });
}
