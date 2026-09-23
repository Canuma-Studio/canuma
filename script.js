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

function drawLogo(textAlpha) {
  ctx.fillStyle = INK; ctx.strokeStyle = INK; ctx.lineWidth = 22.525;
  ctx.stroke(RING); ctx.fill(DOT);
  if (textAlpha > 0) { ctx.globalAlpha = textAlpha; for (const l of LETTERS) ctx.fill(l, 'evenodd'); ctx.globalAlpha = 1; }
}

let W, H, dpr, k0 = 1, ox = 0, oy = 0, cu = 10, cells = [], maxS = 40;
let mouse = { x: -9999, y: -9999, px: -9999, py: -9999 };
const bursts = [];   // Antippen/Klicken: lässt das Logo an dieser Stelle zerspringen
const now = () => performance.now();

// Welche Quadrate überhaupt Logo enthalten: einmal in ein kleines Hilfsbild zeichnen und nachschauen
function build() {
  const lw = Math.min(W * .8, 640);
  k0 = lw / VB.w;
  ox = (W - lw) / 2; oy = (H - VB.h * k0) / 2 - H * .03;
  cu = (lw < 420 ? 8 : 12) / k0;   // Kantenlänge eines Stücks, in Logo-Einheiten
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
  const bb = box.getBoundingClientRect(), cs = getComputedStyle(h2);
  gs = W < 640 ? 5 : 8;
  sheetT = document.createElement('canvas'); sheetT.width = W * dpr; sheetT.height = H * dpr;
  const g = sheetT.getContext('2d'); g.scale(dpr, dpr);
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
    for (let yy = y * dpr | 0; yy < (y + gs) * dpr && !hit; yy += 2) for (let xx = x * dpr | 0; xx < (x + gs) * dpr; xx += 2)
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
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const q of shards) {
    const t = Math.min(1, Math.max(0, (a2 - q.d) / (1 - q.d)));
    if (!t) continue;
    const e = 1 - Math.pow(1 - t, 3);
    const x = q.sx + (q.x - q.sx) * e, y = q.sy + (q.y - q.sy) * e;
    ctx.globalAlpha = Math.min(1, t * 4);
    ctx.save(); ctx.translate(x + gs / 2, y + gs / 2); ctx.rotate(q.r * (1 - e));
    ctx.drawImage(sheetT, q.x * dpr, q.y * dpr, gs * dpr, gs * dpr, -gs / 2, -gs / 2, gs, gs);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function resize() {
  dpr = Math.min(devicePixelRatio || 1, 2);
  W = box.clientWidth; H = box.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  s = 1; build();
}

const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

function tick() {
  const r = stage.getBoundingClientRect();
  const p = Math.min(1, Math.max(0, -r.top / (stage.offsetHeight - innerHeight)));
  const z = ease(Math.min(1, p / .72));
  s = 1 + (maxS - 1) * z * z * z;
  const textAlpha = Math.max(0, 1 - p * 6);
  const piece = cu * k0 * s;                   // Stückgrösse auf dem Bildschirm

  // Maus: Geschwindigkeit bestimmt, wie viel zerbricht
  const mvx = mouse.x - mouse.px, mvy = mouse.y - mouse.py; mouse.px = mouse.x; mouse.py = mouse.y;
  const speed = Math.min(40, Math.hypot(mvx, mvy));
  const R = Math.max(55, Math.min(piece * 1.3, 150)) + speed;
  const T = now(), moving = [];

  const hits = bursts.splice(0);
  for (const c of cells) {
    if (c.word && !textAlpha) continue;
    const hx = sx(c.ux + cu / 2), hy = sy(c.uy + cu / 2);
    for (const b of hits) {
      const ddx = hx + c.dx - b.x, ddy = hy + c.dy - b.y, d = Math.hypot(ddx, ddy) || 1, BR = Math.max(90, Math.min(piece * 2, 220));
      if (d < BR) {
        const f = (BR - d) / BR;
        c.vx += (ddx / d * 9 + (Math.random() - .5) * 4) * f; c.vy += (ddy / d * 9 + (Math.random() - .5) * 4) * f;
        c.vr += (Math.random() - .5) * f * .4; c.t = T; c.loose = true;
      }
    }
    if (speed > .5) {
      const ddx = hx + c.dx - mouse.x, ddy = hy + c.dy - mouse.y, d2 = ddx * ddx + ddy * ddy;
      if (d2 < R * R) {
        const d = Math.sqrt(d2) || 1, f = (R - d) / R;
        c.vx += (ddx / d * 2.6 + mvx * .08 + (Math.random() - .5) * 2.4) * f;
        c.vy += (ddy / d * 2.6 + mvy * .08 + (Math.random() - .5) * 2.4) * f;
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
    // Beim Hineinfliegen sollen lose Stücke schnell zurück, sonst zoomen sie als riesige Platten mit
    const hurry = Math.min(1, Math.max(0, (p - .15) / .15));
    if (hurry) { c.vx += -c.dx * .2 * hurry; c.vy += -c.dy * .2 * hurry; c.vr += -c.r * .2 * hurry; damp = Math.min(damp, .7); }
    c.vx *= damp; c.vy *= damp; c.vr *= damp;
    c.dx += c.vx; c.dy += c.vy; c.r += c.vr;
    if (age > .5 && Math.abs(c.dx) < .2 && Math.abs(c.dy) < .2 && Math.abs(c.vx) < .05 && Math.abs(c.vy) < .05 && Math.abs(c.r) < .002) {
      c.dx = c.dy = c.vx = c.vy = c.r = c.vr = 0; c.loose = false;
    } else moving.push(c);
  }

  // Zeichnen: ganzes Logo, Löcher wo Stücke fehlen, dann die Stücke selbst
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  toUnits(); drawLogo(textAlpha);
  const e = .4 / (k0 * s);
  for (const c of moving) ctx.clearRect(c.ux - e, c.uy - e, cu + 2 * e, cu + 2 * e);
  for (const c of moving) {
    const hx = sx(c.ux + cu / 2) + c.dx, hy = sy(c.uy + cu / 2) + c.dy;
    if (hx < -piece || hy < -piece || hx > W + piece || hy > H + piece) continue;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();
    ctx.translate(hx, hy); ctx.rotate(c.r); ctx.scale(k0 * s, k0 * s); ctx.translate(-(c.ux + cu / 2), -(c.uy + cu / 2));
    ctx.beginPath(); ctx.rect(c.ux, c.uy, cu, cu); ctx.clip();
    drawLogo(c.word ? textAlpha : 1);
    ctx.restore();
  }

  drawShards(p);
  const a = Math.min(1, Math.max(0, (p - .82) / .12));
  inside.style.setProperty('--a', a);
  inside.style.pointerEvents = a > .9 ? 'auto' : 'none';
  dist.textContent = stops[Math.min(stops.length - 1, Math.floor(p * stops.length))];
  needle.style.left = (p * 100) + '%';
  requestAnimationFrame(tick);
}

box.addEventListener('pointermove', e => { const b = canvas.getBoundingClientRect(); mouse.x = e.clientX - b.left; mouse.y = e.clientY - b.top; });
box.addEventListener('pointerdown', e => { const b = canvas.getBoundingClientRect(); bursts.push({ x: e.clientX - b.left, y: e.clientY - b.top }); });
box.addEventListener('pointerleave', () => { mouse.x = mouse.y = mouse.px = mouse.py = -9999; });
// Beim Scrollen bewegt sich die Seite unter der Maus – das zählt nicht als Mausbewegung
addEventListener('scroll', () => { mouse.px = mouse.x; mouse.py = mouse.y; }, { passive: true });
addEventListener('resize', () => { clearTimeout(resize.t); resize.t = setTimeout(() => { resize(); buildShards(); }, 150); });
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

// 01 ChefKlick: Aufgaben werden abgehakt, die Ringe füllen sich
const ckRows = [...document.querySelectorAll('.ck-mods li')];
const ckRings = { day: document.querySelector('[data-ring="day"]'), week: document.querySelector('[data-ring="week"]') };
document.querySelector('.ck-date').textContent = zh({ weekday: 'short', day: '2-digit', month: '2-digit' }).format(new Date());
const tm = zh({ hour: '2-digit', minute: '2-digit' });
function ckSet(li, n) {
  const total = +li.dataset.total; li.n = n;
  li.querySelector('.ct').textContent = `${n} / ${total}`;
  const done = n >= total; li.classList.toggle('done', done);
  li.querySelector('small').textContent = done ? `${li.dataset.who} · ${tm.format(new Date())}` : (li.dataset.week !== undefined ? 'diese Woche' : 'offen');
  const day = ckRows.filter(r => r.dataset.week === undefined), week = ckRows.filter(r => r.dataset.week !== undefined);
  const pct = rows => Math.round(100 * rows.reduce((a, r) => a + (r.n || 0), 0) / rows.reduce((a, r) => a + +r.dataset.total, 0));
  for (const [k, rows] of [['day', day], ['week', week]]) {
    const v = pct(rows); ckRings[k].style.setProperty('--off', 100 - v); ckRings[k].querySelector('b').textContent = v + '%';
  }
}
const loops = [
  {
    final() { ckRows.forEach(li => ckSet(li, +li.dataset.total)); },
    async run(alive) {
      while (alive()) {
        ckRows.forEach(li => ckSet(li, 0));
        await sleep(900);
        for (const li of ckRows) {
          const total = +li.dataset.total;
          for (let n = 1; n <= total; n++) { if (!alive()) return; ckSet(li, n); await sleep(total > 10 ? 70 : 420); }
          await sleep(450);
        }
        await sleep(3800);
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
  // 03 Fotografie: Sucher stellt scharf, löst aus, nächstes Bild
  (() => {
    const shots = [...document.querySelectorAll('.shot')], af = document.querySelector('.af');
    const exif = document.querySelector('.vf-exif'), flash = document.querySelector('.vf-flash');
    let i = 0;
    const show = k => {
      shots.forEach((s, j) => s.classList.toggle('on', j === k));
      const [x, y] = (shots[k].dataset.af || '50% 50%').split(' ');
      af.style.setProperty('--ax', x); af.style.setProperty('--ay', y);
      exif.textContent = shots[k].dataset.exif || '';
    };
    return {
      final() { show(0); },
      async run(alive) {
        show(i);
        while (alive()) {
          af.classList.remove('hunt'); void af.offsetWidth; af.classList.add('hunt');
          await sleep(1100); if (!alive()) return;
          flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
          await sleep(1500); if (!alive()) return;
          i = (i + 1) % shots.length; show(i);
          await sleep(700);
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
