// Canuma Studio – Script
const INK = '#1c1c1c';
const EDGE = '#b39462';   // Farbe der Bruchkanten: gedämpftes Gold (Kintsugi) – hier ändern, um den Ton anzupassen
const EDGE_A = .55;        // wie stark die Kanten sichtbar sind (0 = gar nicht, 1 = voll)
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
// Touch-Geräte (Handy/Tablet): Logo zerbröckelt beim Scrollen, statt dass die Kamera hineinzoomt
const touchDev = matchMedia('(pointer: coarse)').matches;
const stage = document.querySelector('.stage');
const box = document.querySelector('.sticky');
const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');
const svg = document.querySelector('.sticky svg.logo');
const inside = document.querySelector('.inside');
const dist = document.querySelector('.dist');
const scaleEl = document.querySelector('.scale');
if (touchDev) dist.style.visibility = 'hidden';   // Handy: kein Zoom, also auch keine Meter-Anzeige
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
  g.fillStyle = INK; g.strokeStyle = INK; g.lineWidth = 22.525; g.lineCap = 'butt';
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

// ---------- Glasscherben ----------
// Das Logo wird in unregelmässige Scherben zerlegt (Voronoi – wie zerbrochenes Glas).
// Nahe beieinander liegende Scherben sind zu grösseren Brocken zusammengefasst:
// Wo man trifft, splittert es in einzelne Scherben, weiter weg fliegen ganze Brocken.
let shardsL = [], clusters = [], fu = 12, seams = [];
function build() {
  const lw = Math.min(W * .8, 640);
  k0 = lw / VB.w;
  ox = (W - lw) / 2; oy = (H - VB.h * k0) / 2 - H * .03;
  fu = (touchDev ? 12 : 15) / k0;   // Grösse einer Scherbe, in Logo-Einheiten
  cu = fu;
  const far = Math.max(...[[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => Math.hypot(x - sx(F.x), y - sy(F.y))));
  maxS = far / (18.5 * .95 * k0);

  // Hilfsbild: wo ist überhaupt Logo?
  const q = 1, t = document.createElement('canvas');
  t.width = VB.w * q; t.height = VB.h * q;
  const g = t.getContext('2d'); g.scale(q, q); g.translate(-VB.x, -VB.y);
  g.lineWidth = 22.525; g.stroke(RING); g.fill(DOT); for (const l of LETTERS) g.fill(l, 'evenodd');
  const data = g.getImageData(0, 0, t.width, t.height).data;
  const ink = (x, y) => { x = (x - VB.x) * q | 0; y = (y - VB.y) * q | 0; return x >= 0 && y >= 0 && x < t.width && y < t.height && data[(y * t.width + x) * 4 + 3] > 40; };

  // Zufällig verschobenes Raster als Startpunkte → gleichmässig grosse, aber unregelmässige Scherben
  const x0 = VB.x - fu, y0 = VB.y - fu, nx = Math.ceil((VB.w + 2 * fu) / fu), ny = Math.ceil((VB.h + 2 * fu) / fu);
  const seed = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) seed.push([x0 + (i + .12 + Math.random() * .76) * fu, y0 + (j + .12 + Math.random() * .76) * fu]);
  const clip = (poly, px, py, nx_, ny_) => {   // Teil des Vielecks behalten, der auf der eigenen Seite der Mittellinie liegt
    const out = [];
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k], b = poly[(k + 1) % poly.length];
      const da = (a[0] - px) * nx_ + (a[1] - py) * ny_, db = (b[0] - px) * nx_ + (b[1] - py) * ny_;
      if (da <= 0) out.push(a);
      if ((da <= 0) !== (db <= 0)) { const tt = da / (da - db); out.push([a[0] + (b[0] - a[0]) * tt, a[1] + (b[1] - a[1]) * tt]); }
    }
    return out;
  };
  // Brocken: grobes Raster, jede Scherbe gehört zum nächsten Brocken-Mittelpunkt
  const cs = fu * 3.3, cnx = Math.ceil((VB.w + 2 * fu) / cs) + 1, cny = Math.ceil((VB.h + 2 * fu) / cs) + 1, cseed = [];
  for (let j = 0; j < cny; j++) for (let i = 0; i < cnx; i++) cseed.push([x0 + (i + .2 + Math.random() * .6) * cs, y0 + (j + .2 + Math.random() * .6) * cs]);
  const cmap = new Map();
  shardsL = []; clusters = []; seams = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const [px, py] = seed[j * nx + i], h = fu * 2.2;
    let poly = [[px - h, py - h], [px + h, py - h], [px + h, py + h], [px - h, py + h]];
    for (let jj = j - 2; jj <= j + 2; jj++) for (let ii = i - 2; ii <= i + 2; ii++) {
      if ((ii === i && jj === j) || ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
      const [qx, qy] = seed[jj * nx + ii];
      poly = clip(poly, (px + qx) / 2, (py + qy) / 2, qx - px, qy - py);
      if (poly.length < 3) break;
    }
    if (poly.length < 3) continue;
    // Enthält die Scherbe Logo? (Punkte im Innern abtasten)
    let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9, cx = 0, cy = 0;
    for (const [x, y] of poly) { minx = Math.min(minx, x); miny = Math.min(miny, y); maxx = Math.max(maxx, x); maxy = Math.max(maxy, y); cx += x; cy += y; }
    cx /= poly.length; cy /= poly.length;
    const inside = (x, y) => { let c = false; for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) { const [xa, ya] = poly[a], [xb, yb] = poly[b]; if ((ya > y) !== (yb > y) && x < (xb - xa) * (y - ya) / (yb - ya) + xa) c = !c; } return c; };
    let hit = false;
    for (let y = miny; y <= maxy && !hit; y += 1.5) for (let x = minx; x <= maxx; x += 1.5) if (ink(x, y) && inside(x, y)) { hit = true; break; }
    if (!hit) continue;
    const path = new Path2D(); path.moveTo(poly[0][0], poly[0][1]); for (let k = 1; k < poly.length; k++) path.lineTo(poly[k][0], poly[k][1]); path.closePath();
    // nächster Brocken
    let best = 0, bd = 1e18;
    const ci = Math.floor((cx - x0) / cs), cj = Math.floor((cy - y0) / cs);
    for (let jj = cj - 1; jj <= cj + 1; jj++) for (let ii = ci - 1; ii <= ci + 1; ii++) {
      if (ii < 0 || jj < 0 || ii >= cnx || jj >= cny) continue;
      const k = jj * cnx + ii, d = (cseed[k][0] - cx) ** 2 + (cseed[k][1] - cy) ** 2;
      if (d < bd) { bd = d; best = k; }
    }
    // Brocken nicht über die Lücke zwischen Zeichen und Schriftzug hinweg bilden
    const key = best * 2 + (cy > 232 ? 1 : 0);
    if (!cmap.has(key)) { const c = body({ cx: 0, cy: 0, sh: [] }); cmap.set(key, c); clusters.push(c); }
    const cl = cmap.get(key);
    const sh = body({ path, poly, si: j * nx + i, cx, cy, cl, word: cy > 232, free: false, bb: [minx, miny, maxx, maxy], scar: 0,
      fx: Math.random() * 2 - 1, fy: Math.random(), fr: Math.random() * 2 - 1, cd: 0, cr: 0, jit: 0 });
    cl.sh.push(sh); shardsL.push(sh);
  }
  // Kintsugi: Gold nur auf den Kanten ZWISCHEN den Brocken, nicht auf jeder kleinen Scherbe
  const bySeed = new Map(shardsL.map(sh => [sh.si, sh]));
  const nearest = (x, y) => {
    const i = Math.floor((x - x0) / fu), j = Math.floor((y - y0) / fu); let best = -1, bd = 1e18;
    for (let jj = j - 2; jj <= j + 2; jj++) for (let ii = i - 2; ii <= i + 2; ii++) {
      if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
      const k = jj * nx + ii, d = (seed[k][0] - x) ** 2 + (seed[k][1] - y) ** 2; if (d < bd) { bd = d; best = k; }
    }
    return best;
  };
  for (const sh of shardsL) {
    sh.gpath = new Path2D();
    const P = sh.poly;
    for (let k = 0; k < P.length; k++) {
      const a = P[k], b = P[(k + 1) % P.length], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      const ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey) || 1, e = fu * .08;
      let nb = nearest(mx + ey / L * e, my - ex / L * e);
      if (nb === sh.si) nb = nearest(mx - ey / L * e, my + ex / L * e);
      const other = bySeed.get(nb);
      if (other && other.cl !== sh.cl) { sh.gpath.moveTo(a[0], a[1]); sh.gpath.lineTo(b[0], b[1]); }
    }
  }
  scarPath = null;
  for (const c of clusters) { c.cx = c.sh.reduce((a, b) => a + b.cx, 0) / c.sh.length; c.cy = c.sh.reduce((a, b) => a + b.cy, 0) / c.sh.length; c.m = Math.sqrt(c.sh.length); }
  // Handy: Reihenfolge beim Zerbröckeln – aussen zuerst, der Punkt ganz zuletzt (plus etwas Zufall)
  const dist = c => Math.hypot(c.cx - 325.56, c.cy - 145);
  const maxD = Math.max(...shardsL.map(dist));
  for (const c of shardsL) c.cd = Math.min(1, Math.max(0, .8 * (1 - dist(c) / maxD) + .2 * Math.random()));
  pattern = null; off.key = '';
  buildAtlas();
}
// Jede Scherbe einmal als kleines fertiges Bild vorbereiten (in einem Sammelbild) –
// danach muss beim Fliegen nur noch verschoben werden statt ausgeschnitten: viel schneller
const atlas = document.createElement('canvas'), mask = document.createElement('canvas'), atlasB = document.createElement('canvas');   // mask: harte Schablone zum Ausstanzen · atlasB: Scherben mit blauer Bruchkante
function buildAtlas() {
  const BX = ox - VB.x * k0, BY = oy - VB.y * k0;   // Logo-Ursprung auf dem Bildschirm bei Zoom 1
  const lg = document.createElement('canvas'); lg.width = W * dpr; lg.height = H * dpr;
  const lc = lg.getContext('2d'); lc.setTransform(dpr * k0, 0, 0, dpr * k0, dpr * BX, dpr * BY); drawLogo(1, lc);
  // Platz im Sammelbild verteilen (Reihe für Reihe)
  const AW = 1024 / dpr; let x = 0, y = 0, rowH = 0;
  for (const sh of shardsL) {
    const b = sh.bb, sx0 = BX + b[0] * k0 - 2, sy0 = BY + b[1] * k0 - 2, w = (b[2] - b[0]) * k0 + 4, h = (b[3] - b[1]) * k0 + 4;
    if (x + w > AW) { x = 0; y += rowH + 1; rowH = 0; }
    sh.sp = { ax: x, ay: y, w, h, sx0, sy0 };
    x += w + 1; rowH = Math.max(rowH, h);
  }
  atlas.width = Math.ceil(AW * dpr); atlas.height = Math.ceil((y + rowH + 2) * dpr);
  const g = atlas.getContext('2d');
  const pat = g.createPattern(lg, 'no-repeat');
  pat.setTransform(new DOMMatrix([1 / (dpr * k0), 0, 0, 1 / (dpr * k0), -BX / k0, -BY / k0]));
  g.fillStyle = pat; g.strokeStyle = pat; g.lineWidth = 1 / k0; g.lineJoin = 'round';
  mask.width = atlas.width; mask.height = atlas.height;
  const mg = mask.getContext('2d'); mg.fillStyle = mg.strokeStyle = '#000'; mg.lineWidth = 1.2 / k0; mg.lineJoin = 'round';
  for (const sh of shardsL) {
    const q = sh.sp;
    // Bildschirm → Sammelbild, dann Logo-Einheiten
    g.setTransform(dpr * k0, 0, 0, dpr * k0, dpr * (q.ax - q.sx0 + BX), dpr * (q.ay - q.sy0 + BY));
    g.fill(sh.path); g.stroke(sh.path);   // Kontur mitzeichnen: Scherbe minim grösser, so gibt es keine Haarlinien zwischen Nachbarn
    mg.setTransform(dpr * k0, 0, 0, dpr * k0, dpr * (q.ax - q.sx0 + BX), dpr * (q.ay - q.sy0 + BY));
    mg.fill(sh.path); mg.stroke(sh.path);
  }
  // Fliegende Scherben: gleiche Bilder, aber mit blauer Bruchkante – nur auf dem Logo, nicht daneben
  atlasB.width = atlas.width; atlasB.height = atlas.height;
  const bg = atlasB.getContext('2d'); bg.drawImage(atlas, 0, 0);
  bg.globalCompositeOperation = 'source-atop'; bg.strokeStyle = EDGE; bg.globalAlpha = EDGE_A; bg.lineWidth = 1.5 / k0; bg.lineJoin = 'round';
  for (const sh of shardsL) {
    const q = sh.sp;
    bg.setTransform(dpr * k0, 0, 0, dpr * k0, dpr * (q.ax - q.sx0 + BX), dpr * (q.ay - q.sy0 + BY));
    bg.stroke(sh.gpath);
  }
}
function body(o) { return Object.assign(o, { dx: 0, dy: 0, vx: 0, vy: 0, r: 0, vr: 0, tl: 0, vt: 0, t: 0, loose: false }); }
let pattern = null, scarPath = null;

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
  const ink = (x, y) => { const xx = (x - bx0) * dpr | 0, yy = (y - by0) * dpr | 0; return xx >= 0 && yy >= 0 && xx < sheetT.width && yy < sheetT.height && data[(yy * sheetT.width + xx) * 4 + 3] > 30; };
  // Dieselben Glasscherben wie beim Logo (Voronoi), hier in Bildschirm-Pixeln
  const size = W < 640 ? 13 : 15;
  shards = voronoi(minX - size, minY - size, maxX - minX + 2 * size, maxY - minY + 2 * size, size, ink);
  for (const q of shards) {
    const ang = Math.random() * Math.PI * 2, far = Math.max(W, H) * (.35 + Math.random() * .5);
    if (touchDev) { q.sx = q.cx + (Math.random() - .5) * W * .6; q.sy = H + size + Math.random() * H * .35; }
    else { q.sx = q.cx + Math.cos(ang) * far; q.sy = q.cy + Math.sin(ang) * far; }
    q.r = (Math.random() - .5) * 8; q.d = Math.random() * .55;
  }
  // Scherbenbilder (mit schlichter Goldkante) in ein Sammelbild
  const AW = 1024 / dpr; let x = 0, y = 0, rowH = 0;
  for (const q of shards) {
    const w = q.bb[2] - q.bb[0] + 4, h = q.bb[3] - q.bb[1] + 4;
    if (x + w > AW) { x = 0; y += rowH + 1; rowH = 0; }
    q.sp = { ax: x, ay: y, w, h, sx0: q.bb[0] - 2, sy0: q.bb[1] - 2 }; x += w + 1; rowH = Math.max(rowH, h);
  }
  atlasH.width = Math.ceil(AW * dpr); atlasH.height = Math.ceil((y + rowH + 2) * dpr);
  const hg = atlasH.getContext('2d'), pat = hg.createPattern(sheetT, 'no-repeat');
  pat.setTransform(new DOMMatrix([1 / dpr, 0, 0, 1 / dpr, bx0, by0]));
  hg.lineJoin = 'round';
  for (const q of shards) {
    const sp = q.sp;
    hg.setTransform(dpr, 0, 0, dpr, dpr * (sp.ax - sp.sx0), dpr * (sp.ay - sp.sy0));
    hg.globalCompositeOperation = 'source-over'; hg.globalAlpha = 1; hg.fillStyle = hg.strokeStyle = pat; hg.lineWidth = 1;
    hg.fill(q.path); hg.stroke(q.path);
    hg.globalCompositeOperation = 'source-atop'; hg.globalAlpha = EDGE_A; hg.strokeStyle = EDGE; hg.lineWidth = 1.5;
    hg.stroke(q.path);
  }
}
const atlasH = document.createElement('canvas');
// Voronoi-Scherben in einem Rechteck; ink(x, y) sagt, ob an der Stelle etwas ist
function voronoi(x0, y0, bw, bh, size, ink) {
  const nx = Math.ceil(bw / size), ny = Math.ceil(bh / size), seed = [], out = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) seed.push([x0 + (i + .12 + Math.random() * .76) * size, y0 + (j + .12 + Math.random() * .76) * size]);
  const clip = (poly, px, py, vx, vy) => {
    const o = [];
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k], b = poly[(k + 1) % poly.length];
      const da = (a[0] - px) * vx + (a[1] - py) * vy, db = (b[0] - px) * vx + (b[1] - py) * vy;
      if (da <= 0) o.push(a);
      if ((da <= 0) !== (db <= 0)) { const t = da / (da - db); o.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    }
    return o;
  };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const [px, py] = seed[j * nx + i], h = size * 2.2;
    let poly = [[px - h, py - h], [px + h, py - h], [px + h, py + h], [px - h, py + h]];
    for (let jj = j - 2; jj <= j + 2; jj++) for (let ii = i - 2; ii <= i + 2; ii++) {
      if ((ii === i && jj === j) || ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
      const [qx, qy] = seed[jj * nx + ii];
      poly = clip(poly, (px + qx) / 2, (py + qy) / 2, qx - px, qy - py);
      if (poly.length < 3) break;
    }
    if (poly.length < 3) continue;
    let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9, cx = 0, cy = 0;
    for (const [x, y] of poly) { minx = Math.min(minx, x); miny = Math.min(miny, y); maxx = Math.max(maxx, x); maxy = Math.max(maxy, y); cx += x; cy += y; }
    cx /= poly.length; cy /= poly.length;
    const inside = (x, y) => { let c = false; for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) { const [xa, ya] = poly[a], [xb, yb] = poly[b]; if ((ya > y) !== (yb > y) && x < (xb - xa) * (y - ya) / (yb - ya) + xa) c = !c; } return c; };
    let hit = false;
    for (let y = miny; y <= maxy && !hit; y += 1.5) for (let x = minx; x <= maxx; x += 1.5) if (ink(x, y) && inside(x, y)) { hit = true; break; }
    if (!hit) continue;
    const path = new Path2D(); path.moveTo(poly[0][0], poly[0][1]); for (let k = 1; k < poly.length; k++) path.lineTo(poly[k][0], poly[k][1]); path.closePath();
    out.push({ path, cx, cy, bb: [minx, miny, maxx, maxy] });
  }
  return out;
}
function drawShards(p) {
  const a2 = Math.min(1, Math.max(0, (p - .6) / .26));   // 0 = Scherben weit verstreut, 1 = fertiges Wort
  h2.style.opacity = a2 >= 1 ? 1 : 0;
  if (a2 <= 0 || a2 >= 1 || !sheetT) return;
  let ga = 1;
  for (const q of shards) {
    const t = Math.min(1, Math.max(0, (a2 - q.d) / (1 - q.d)));
    if (!t) continue;
    const e = 1 - Math.pow(1 - t, 3);
    const x = q.sx + (q.cx - q.sx) * e, y = q.sy + (q.cy - q.sy) * e;
    if (x < -30 || y < -30 || x > W + 30 || y > H + 30) continue;   // ausserhalb des Bildschirms: nicht zeichnen
    const al = Math.min(1, t * 4); if (al !== ga) ctx.globalAlpha = ga = al;
    // um die Scherbenmitte gedreht an die aktuelle Stelle
    const rot = q.r * (1 - e), co = Math.cos(rot), si = Math.sin(rot), sp = q.sp;
    ctx.setTransform(dpr * co, dpr * si, -dpr * si, dpr * co, dpr * (x - co * q.cx + si * q.cy), dpr * (y - si * q.cx - co * q.cy));
    ctx.drawImage(atlasH, sp.ax * dpr, sp.ay * dpr, sp.w * dpr, sp.h * dpr, sp.sx0, sp.sy0, sp.w, sp.h);
  }
  ctx.globalAlpha = 1; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function resize() {
  dpr = Math.min(devicePixelRatio || 1, 2);   // Handy jetzt auch 2× – schärfere Kanten
  W = box.clientWidth; H = box.clientHeight;
  canvas.width = off.width = W * dpr; canvas.height = off.height = H * dpr;
  s = 1; build(); lastP = -1; off.key = '';
}

const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// Auf dem Handy liefert das Scrollen die Position unregelmässig (vor allem beim Nachschwingen nach dem Wischen).
// Darum folgt der Zoom dort der Scroll-Position weich nachgezogen statt ruckartig.
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
  const crumb = touchDev;   // Handy: Logo zerbröckelt, statt dass hineingezoomt wird
  const z = ease(Math.min(1, p / .72));
  s = crumb ? 1 : 1 + (maxS - 1) * z * z * z;
  const textAlpha = crumb ? 1 : Math.max(0, 1 - p * 6);
  const pc = crumb ? Math.min(1, p / .58) : 0;   // 0 = Logo ganz, 1 = alles weggebröckelt
  const K = k0 * s, BX = sx(0), BY = sy(0);
  const piece = fu * K;                        // Scherbengrösse auf dem Bildschirm

  // Maus: Geschwindigkeit bestimmt, wie viel zerbricht
  if (mouse.px < -9000) { mouse.px = mouse.x; mouse.py = mouse.y; }   // Maus kommt gerade ins Bild: kein Riesensprung
  const mvx = Math.max(-60, Math.min(60, mouse.x - mouse.px)), mvy = Math.max(-60, Math.min(60, mouse.y - mouse.py)); mouse.px = mouse.x; mouse.py = mouse.y;
  const speed = Math.min(40, Math.hypot(mvx, mvy));
  const R = Math.max(55, Math.min(piece * 1.3, 420)) + speed;
  const kf = Math.min(4, Math.max(1, piece / 30));   // grosse Stücke (beim Hineinzoomen) brauchen mehr Schwung
  if (p === lastP && !lastMoving && !bursts.length && speed <= .5) { requestAnimationFrame(tick); return; }   // Stillstand: nichts neu zeichnen
  lastP = p;
  const T = now();

  if (crumb && pc >= 1) {   // Logo ist komplett weggebröckelt: nur noch die Überschrift
    lastMoving = 0; bursts.length = 0; seams.length = 0;
    for (const c of clusters) reset(c); for (const c of shardsL) { reset(c); c.free = false; }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawShards(p); ui(p);
    requestAnimationFrame(tick); return;
  }

  // ---- Treffer: Klick/Antippen (stark) und Mausbewegung (sanft) ----
  const hits = bursts.splice(0).map(b => ({ x: b.x, y: b.y, R: Math.max(W < 640 ? 70 : 90, Math.min(piece * 2, 520)), f: 9, mx: 0, my: 0, rnd: 4 }));
  if (speed > .5) hits.push({ x: mouse.x, y: mouse.y, R, f: 2.6, mx: mvx * .08, my: mvy * .08, rnd: 2.4 });
  const push = (b, hx, hy, h, scale) => {
    const ddx = hx - h.x, ddy = hy - h.y, d = Math.hypot(ddx, ddy) || 1;
    if (d >= h.R) return;
    const f = (h.R - d) / h.R * kf * scale;
    b.vx += (ddx / d * h.f + h.mx + (Math.random() - .5) * h.rnd) * f;
    b.vy += (ddy / d * h.f + h.my + (Math.random() - .5) * h.rnd) * f;
    b.vr += (Math.random() - .5) * f * (h.f > 5 ? .35 : .18) / scale;
    b.vt += (Math.random() - .5) * f * (h.f > 5 ? .5 : .25);     // Kippen nach vorne/hinten
    b.t = T; b.loose = true;
  };
  if (hits.length) {
    for (const c of clusters) {
      const cxs = BX + c.cx * K, cys = BY + c.cy * K;
      for (const h of hits) {
        const hcx = cxs + c.dx, hcy = cys + c.dy, dC = Math.hypot(hcx - h.x, hcy - h.y);
        if (dC > h.R + piece * 3) continue;
        // Nahe am Treffer: in einzelne Scherben zersplittern
        for (const sh of c.sh) {
          if (sh.free || (sh.word && !textAlpha) || sh.cr) continue;
          const e = eff(sh, K, BX, BY);
          if (Math.hypot(e.cx + e.dx - h.x, e.cy + e.dy - h.y) < h.R * .42) {
            sh.free = true; sh.dx = e.dx; sh.dy = e.dy; sh.r = e.r; sh.tl = e.tl; sh.vx = c.vx; sh.vy = c.vy; sh.vr = c.vr; sh.vt = c.vt;
          }
        }
        // Weiter weg: der ganze Brocken fliegt (schwerer, dreht sich weniger)
        if (c.sh.some(sh => !sh.free)) push(c, hcx, hcy, h, 1 / (c.m * .55 + .45));
      }
    }
    for (const sh of shardsL) if (sh.free && !(sh.word && !textAlpha)) for (const h of hits) push(sh, BX + sh.cx * K + sh.dx, BY + sh.cy * K + sh.dy, h, 1);
  }

  // ---- Bewegung ----
  for (const c of clusters) if (c.loose) step(c, T, p);
  for (const sh of shardsL) {
    if (sh.free) { if (sh.loose) step(sh, T, p); else if (!sh.cl.loose) sh.free = false; }   // wieder eingerastet
    if (crumb) {
      // Wie weit ist diese Scherbe schon abgebröckelt? Kurz davor zittert sie etwas
      const st = sh.cd * .7;
      sh.cr = Math.min(1, Math.max(0, (pc - st) / .3));
      sh.jit = !sh.cr && pc > 0 && pc > st - .06 ? Math.sin(pc * 900 + sh.cx * .7) * 1.3 * (1 - (st - pc) / .06) : 0;
    }
  }
  // Handy/Kintsugi: Scherben, die vom Zerbröckeln zurückkommen, rasten mit Goldnaht ein und behalten eine feine Spur
  if (crumb) {
    const back = [];
    for (const sh of shardsL) {
      if (sh.cr || sh.jit) sh.away = true;
      else if (sh.away) { sh.away = false; sh.scar = 1; back.push(sh); }
    }
    if (back.length) { seams.push({ T, list: back }); scarPath = null; }
  }
  const moving = [];
  for (const sh of shardsL) {
    if (sh.word && !textAlpha) continue;
    if ((sh.free ? sh.loose : sh.cl.loose) || sh.cr || sh.jit) moving.push(sh);
  }
  const now2 = T; seams = seams.filter(m => now2 - m.T < 900);

  lastMoving = moving.length + seams.length;
  if (!moving.length) {
    // Nichts fliegt herum: Logo direkt zeichnen, ohne Umweg über das Hilfsbild
    if (off.key && off.key.startsWith('atlas')) off.key = '';
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * K, 0, 0, dpr * K, dpr * BX, dpr * BY);
    drawLogo(textAlpha, ctx); drawSeams(T, K);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawShards(p); ui(p);
    requestAnimationFrame(tick); return;
  }
  // Schatten (leicht versetzt, je höher die Scherbe "fliegt", desto weiter weg), dann die Scherben
  const list = [];
  for (const sh of moving) {
    const e = eff(sh, K, BX, BY);
    let al = 1;
    if (sh.cr) {
      const t = sh.cr; if (t >= 1) continue;
      // löst sich, hüpft minim hoch und fällt dann immer schneller nach unten weg – und kippt dabei
      e.dx += sh.fx * t * 50;
      e.dy += t * t * H * (.55 + sh.fy * .45) - Math.sin(t * Math.PI) * 14;
      e.r += sh.fr * t * 5; e.tl += sh.fr * t * 4;
      al = t < .5 ? 1 : 1 - (t - .5) / .5;
    }
    e.dx += sh.jit;
    const hx = e.cx + e.dx, hy = e.cy + e.dy;
    if (hx < -piece * 2 || hy < -piece * 2 || hx > W + piece * 2 || hy > H + piece * 2) continue;
    e.al = al; e.lift = Math.min(1, Math.hypot(e.dx, e.dy) / 40 + Math.abs(Math.sin(e.tl)) * .5);
    e.sh = sh; list.push(e);
  }
  const useAtlas = s < 1.0005 && textAlpha === 1;
  if (useAtlas) {
    // ---- schneller Weg: vorbereitete Scherbenbilder ----
    // Das Hilfsbild ist das "stehende" Logo: Scherben, die sich lösen, werden EINMAL daraus ausgestanzt
    // und beim Einrasten wieder eingesetzt – statt in jedem Bild alle Löcher neu zu stanzen
    if (off.key !== 'atlas|' + W + '|' + H) {
      off.key = 'atlas|' + W + '|' + H;
      octx.setTransform(1, 0, 0, 1, 0, 0); octx.clearRect(0, 0, off.width, off.height);
      octx.setTransform(dpr * K, 0, 0, dpr * K, dpr * BX, dpr * BY); drawLogo(1, octx);
      for (const sh of shardsL) sh.baked = false;
    }
    for (const sh of moving) sh.mv = T;
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let bakedN = 0;
    for (const sh of shardsL) {
      const want = sh.mv === T;
      if (want !== !!sh.baked) {
        const q = sh.sp;
        octx.globalCompositeOperation = want ? 'destination-out' : 'source-over';
        octx.drawImage(want ? mask : atlas, q.ax * dpr, q.ay * dpr, q.w * dpr, q.h * dpr, q.sx0, q.sy0, q.w, q.h);
        sh.baked = want;
      }
      if (sh.baked) bakedN++;
    }
    octx.globalCompositeOperation = 'source-over';
    if (!bakedN) off.key = '';   // alles wieder an seinem Platz: nächstes Mal sauber neu zeichnen
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(off, 0, 0);
    ctx.setTransform(dpr * K, 0, 0, dpr * K, dpr * BX, dpr * BY); drawSeams(T, K);
    // Schatten nur, solange nicht zu viele Scherben gleichzeitig fliegen (spart beim Zerbröckeln auf dem Handy)
    // (beim Zerbröckeln auf dem Handy ohne Schatten – die Stücke fallen ohnehin weg, und so bleibt es flüssig)
    if (list.length < 140) for (const e of list) { if (e.lift < .05 || e.sh.cr) continue; ctx.globalAlpha = .13 * e.lift * e.al; spr(e, 2 + e.lift * 5, 3 + e.lift * 8); }
    for (const e of list) { ctx.globalAlpha = e.al * (1 - .38 * Math.abs(Math.sin(e.tl))); spr(e, 0, 0); }
  } else {
    // Hilfsbild nur neu zeichnen, wenn sich Zoom oder Schrift geändert haben
    const offKey = s + '|' + textAlpha + '|' + W + '|' + H;
    if (offKey !== off.key || !pattern) {
      off.key = offKey;
      octx.setTransform(1, 0, 0, 1, 0, 0); octx.clearRect(0, 0, off.width, off.height);
      octx.setTransform(dpr * K, 0, 0, dpr * K, dpr * BX, dpr * BY);
      drawLogo(textAlpha, octx);
      pattern = ctx.createPattern(off, 'no-repeat');
    }
    // Das Muster so legen, dass es in Logo-Einheiten genau auf dem Logo liegt
    pattern.setTransform(new DOMMatrix([1 / (dpr * K), 0, 0, 1 / (dpr * K), -BX / K, -BY / K]));

    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(off, 0, 0);
    // Löcher, wo Scherben fehlen
    ctx.setTransform(dpr * K, 0, 0, dpr * K, dpr * BX, dpr * BY);
    // mit voller Deckkraft ausschneiden (sonst bleibt ein feiner Umriss stehen)
    ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = '#000'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.1 / K; ctx.lineJoin = 'round';
    for (const sh of moving) { ctx.fill(sh.path); ctx.stroke(sh.path); }
    ctx.globalCompositeOperation = 'source-over';
    drawSeams(T, K);

    ctx.fillStyle = pattern; ctx.strokeStyle = pattern; ctx.lineWidth = .9 / K;
    for (const e of list) {   // Schatten
      if (e.lift < .05) continue;
      ctx.globalAlpha = .13 * e.lift * e.al;
      setM(e, K, BX, BY, 2 + e.lift * 5, 3 + e.lift * 8);
      ctx.fill(e.sh.path);
    }
    for (const e of list) {   // Scherben: beim Kippen fängt die Kante Licht (wird etwas heller)
      ctx.globalAlpha = e.al * (1 - .38 * Math.abs(Math.sin(e.tl)));
      setM(e, K, BX, BY, 0, 0);
      ctx.fill(e.sh.path); ctx.stroke(e.sh.path);
      // blaue Bruchkante: Muster als Schablone – nur wo die Scherbe Logo enthält
      ctx.save(); ctx.clip(e.sh.path); ctx.globalCompositeOperation = 'source-atop';
      ctx.strokeStyle = EDGE; ctx.globalAlpha *= EDGE_A; ctx.lineWidth = 1.5 / K; ctx.stroke(e.sh.gpath);
      ctx.restore(); ctx.strokeStyle = pattern; ctx.lineWidth = .9 / K;
    }
  }
  ctx.globalAlpha = 1; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  drawShards(p); ui(p);
  requestAnimationFrame(tick);
}
function reset(b) { b.dx = b.dy = b.vx = b.vy = b.r = b.vr = b.tl = b.vt = 0; b.loose = false; }
// Federn: erst frei schweben, dann zurückziehen – mit leichtem Überschwingen beim Einrasten
function step(b, T, p) {
  const age = (T - b.t) / 1000;
  const pull = age < .3 ? 0 : Math.min(1, (age - .3) / .8) ** 2 * .055;
  b.vx += -b.dx * pull; b.vy += -b.dy * pull; b.vr += -b.r * pull; b.vt += -b.tl * pull * 1.4;
  let damp = age < .3 ? .93 : .86;
  // Erst ganz am Ende des Zooms (bevor die Studio-Überschrift kommt) alles schnell zurückholen
  const hurry = Math.min(1, Math.max(0, (p - .62) / .1));
  if (hurry) { b.vx += -b.dx * .2 * hurry; b.vy += -b.dy * .2 * hurry; b.vr += -b.r * .2 * hurry; b.vt += -b.tl * .2 * hurry; damp = Math.min(damp, .7); }
  b.vx *= damp; b.vy *= damp; b.vr *= damp; b.vt *= damp;
  b.dx += b.vx; b.dy += b.vy; b.r += b.vr; b.tl += b.vt;
  if (age > .5 && Math.abs(b.dx) < .2 && Math.abs(b.dy) < .2 && Math.abs(b.vx) < .05 && Math.abs(b.vy) < .05 && Math.abs(b.r) < .002 && Math.abs(b.tl) < .01) {
    reset(b);
    // eingerastet: Bruchlinien kurz als feine Nähte zeigen
    const list = b.sh ? b.sh.filter(x => !x.free) : [b];
    seams.push({ T, list });
    // Kintsugi: die Bruchstelle bleibt als hauchfeine Goldlinie im Logo (bis zum Neuladen)
    for (const x of list) x.scar = 1;
    scarPath = null;
  }
}
// Aktuelle Lage einer Scherbe auf dem Bildschirm: eigene Bewegung, oder die ihres Brockens
function eff(sh, K, BX, BY) {
  const cx = BX + sh.cx * K, cy = BY + sh.cy * K;
  if (sh.free || !sh.cl.loose) return { cx, cy, dx: sh.free ? sh.dx : 0, dy: sh.free ? sh.dy : 0, r: sh.free ? sh.r : 0, tl: sh.free ? sh.tl : 0 };
  const c = sh.cl, Cx = BX + c.cx * K, Cy = BY + c.cy * K, ct = Math.cos(c.tl), co = Math.cos(c.r), si = Math.sin(c.r);
  const vx = (cx - Cx) * ct, vy = cy - Cy;
  const nx = Cx + c.dx + co * vx - si * vy, ny = Cy + c.dy + si * vx + co * vy;
  return { cx, cy, dx: nx - cx, dy: ny - cy, r: c.r, tl: c.tl };
}
// Transformation: Logo-Einheiten → Bildschirm, gedreht und gekippt um die Scherbenmitte
function setM(e, K, BX, BY, ox_, oy_) {
  const co = Math.cos(e.r), si = Math.sin(e.r), ct = Math.cos(e.tl);
  const a = co * ct, b = si * ct, c = -si, d = co;
  const ex = e.cx + e.dx + ox_, ey = e.cy + e.dy + oy_;
  ctx.setTransform(dpr * K * a, dpr * K * b, dpr * K * c, dpr * K * d,
    dpr * (a * (BX - e.cx) + c * (BY - e.cy) + ex), dpr * (b * (BX - e.cx) + d * (BY - e.cy) + ey));
}
// Scherbenbild gedreht und gekippt um die Scherbenmitte zeichnen (nur bei Zoom 1)
function spr(e, ox_, oy_) {
  const co = Math.cos(e.r), si = Math.sin(e.r), ct = Math.cos(e.tl);
  const a = co * ct, b = si * ct, c = -si, d = co, q = e.sh.sp;
  const ex = e.cx + e.dx + ox_, ey = e.cy + e.dy + oy_;
  ctx.setTransform(dpr * a, dpr * b, dpr * c, dpr * d, dpr * (ex - a * e.cx - c * e.cy), dpr * (ey - b * e.cx - d * e.cy));
  ctx.drawImage(atlasB, q.ax * dpr, q.ay * dpr, q.w * dpr, q.h * dpr, q.sx0, q.sy0, q.w, q.h);
}
// Feine helle Nähte an frisch eingerasteten Scherben, die schnell verblassen
const SCAR_A = .38;   // Kintsugi-Narben: Anteil der Kanten-Stärke, der dauerhaft bleibt (0 = keine Narben)
function drawSeams(T, K) {
  // Narben: alle Stellen, die schon einmal gebrochen sind – als EIN Pfad, damit es schnell bleibt
  if (scarPath === null) { scarPath = new Path2D(); let n = 0; for (const sh of shardsL) if (sh.scar) { scarPath.addPath(sh.gpath); n++; } if (!n) scarPath = false; }
  if (!seams.length && !scarPath) return;
  // Gold nur auf dem Logo (source-atop), nie daneben
  ctx.strokeStyle = EDGE; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.lineWidth = 1.1 / K;
  ctx.globalCompositeOperation = 'source-atop';
  if (scarPath) { ctx.globalAlpha = EDGE_A * SCAR_A; ctx.stroke(scarPath); }
  // frisch eingerastet: glimmt kurz etwas stärker und klingt dann auf die Narbe ab
  for (const m of seams) {
    ctx.globalAlpha = Math.max(0, 1 - (T - m.T) / 900) * EDGE_A * (1 - SCAR_A);
    for (const sh of m.list) ctx.stroke(sh.gpath);
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'butt';
}
function ui(p) {
  const a = Math.min(1, Math.max(0, (p - .82) / .12));
  if (a !== lastA) { lastA = a; inside.style.setProperty('--a', a); inside.style.pointerEvents = a > .9 ? 'auto' : 'none'; }
  if (!touchDev) dist.textContent = stops[Math.min(stops.length - 1, Math.floor(p * stops.length))];
  needle.style.left = (p * 100) + '%';
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
