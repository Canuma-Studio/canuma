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

  for (const c of cells) {
    if (c.word && !textAlpha) continue;
    const hx = sx(c.ux + cu / 2), hy = sy(c.uy + cu / 2);
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
    const damp = age < .3 ? .93 : .88;
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

  const a = Math.min(1, Math.max(0, (p - .7) / .15));
  inside.style.opacity = a;
  inside.style.setProperty('--k', 1 - a);
  inside.style.pointerEvents = a > .9 ? 'auto' : 'none';
  dist.textContent = stops[Math.min(stops.length - 1, Math.floor(p * stops.length))];
  needle.style.left = (p * 100) + '%';
  requestAnimationFrame(tick);
}

box.addEventListener('pointermove', e => { const b = canvas.getBoundingClientRect(); mouse.x = e.clientX - b.left; mouse.y = e.clientY - b.top; });
box.addEventListener('pointerleave', () => { mouse.x = mouse.y = mouse.px = mouse.py = -9999; });
// Beim Scrollen bewegt sich die Seite unter der Maus – das zählt nicht als Mausbewegung
addEventListener('scroll', () => { mouse.px = mouse.x; mouse.py = mouse.y; }, { passive: true });
addEventListener('resize', () => { clearTimeout(resize.t); resize.t = setTimeout(resize, 150); });
resize(); tick();

// Tipp-Effekt
const t = document.querySelector('.type'), txt = t.dataset.text; let i = 0;
setTimeout(function typ() { t.textContent = txt.slice(0, ++i); if (i < txt.length) setTimeout(typ, 55); }, reduce ? 0 : 800);

// Karten: Licht folgt der Maus
document.querySelectorAll('.card').forEach(c => c.addEventListener('pointermove', e => {
  const b = c.getBoundingClientRect(); c.style.setProperty('--mx', e.clientX - b.left + 'px'); c.style.setProperty('--my', e.clientY - b.top + 'px');
}));

// Mail-Adresse würfelt sich zurecht
const m = document.querySelector('[data-scramble]'), orig = m.textContent, chars = 'abcdefghijklmnopqrstuvwxyz@.';
m.addEventListener('pointerenter', () => {
  let f = 0; clearInterval(m.t);
  m.t = setInterval(() => {
    m.textContent = [...orig].map((c, k) => k < f / 2 ? c : chars[Math.random() * chars.length | 0]).join('');
    if (++f > orig.length * 2) { clearInterval(m.t); m.textContent = orig; }
  }, 30);
});
