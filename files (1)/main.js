"use strict";
const { Plugin, ItemView, Notice, PluginSettingTab, Setting } = require("obsidian");

const VIEW_TYPE = "spacyg-cosmic-graph";
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const frac = v => v - Math.floor(v);
const smooth01 = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const DEFAULTS = { liveSky: true, density: 1, pointer: true, layout: "icosahedron" };
const FOLDER_COLORS = [[183,148,255],[125,211,252],[249,168,212],[252,211,77],[134,239,172],[253,164,175],[165,180,252],[94,234,212]];
const SKY_TINTS = [[236,228,255],[255,255,255],[198,214,255],[255,236,214]];
const REDUCED = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/* soft glow sprites: drawImage keeps thousands of stars cheap and their edges smooth */
const sprites = new Map();
function glowSprite(rgb) {
  const key = rgb.join(","); if (sprites.has(key)) return sprites.get(key);
  const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"), [r, gg, b] = rgb;
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, "rgba(255,255,255,1)"); rg.addColorStop(.1, `rgba(${r},${gg},${b},.95)`); rg.addColorStop(.32, `rgba(${r},${gg},${b},.34)`); rg.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64); sprites.set(key, c); return c;
}

/* ==========================================================================================
 * LIVE SKY: drifting stars that shy away from the pointer, with the odd shooting star.
 * One shared animation loop drives every sky; hidden panes cost nothing.
 * ======================================================================================== */
class Sky {
  constructor(host, plugin) {
    this.host = host; this.plugin = plugin;
    this.canvas = document.createElement("canvas"); this.canvas.className = "spacyg-sky"; this.canvas.setAttribute("aria-hidden", "true");
    host.insertBefore(this.canvas, host.firstChild); host.classList.add("has-live-sky");
    this.ctx = this.canvas.getContext("2d"); this.stars = []; this.px = -9999; this.py = -9999; this.sx = 0; this.sy = 0; this.shoot = null;
    this.nextShoot = performance.now() + 4000 + Math.random() * 6000; this.w = 0; this.h = 0; this.last = performance.now();
    this.onMove = e => { const r = this.canvas.getBoundingClientRect(); this.px = e.clientX - r.left; this.py = e.clientY - r.top; };
    this.onLeave = () => { this.px = this.py = -9999; };
    host.addEventListener("pointermove", this.onMove, { passive: true }); host.addEventListener("pointerleave", this.onLeave, { passive: true });
    this.ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => this.resize()) : null; this.ro && this.ro.observe(host);
    this.resize(); SkyManager.add(this);
  }
  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight; if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2); this.w = w; this.h = h;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr); this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(clamp(w * h / 5200 * (this.plugin.settings.density || 1), 60, 760));
    if (n !== this.stars.length) this.stars = Array.from({ length: n }, () => this.makeStar(true));
  }
  makeStar() {
    const z = Math.random(), big = Math.random() < .07;
    return { x: Math.random() * this.w, y: Math.random() * this.h, z, r: (big ? 1.6 : .5) + z * (big ? 1.5 : 1.1), a: .2 + Math.random() * .6,
      dx: (Math.random() - .5) * .16 * (.4 + z), dy: (Math.random() - .5) * .16 * (.4 + z), ph: Math.random() * TAU, ox: 0, oy: 0, tint: SKY_TINTS[(Math.random() * 4) | 0] };
  }
  draw(now) {
    const dt = Math.min(2, (now - this.last) / 16.7); this.last = now;
    const ctx = this.ctx, w = this.w, h = this.h, moving = !REDUCED(), pointer = this.plugin.settings.pointer && moving, t = now * .001;
    ctx.clearRect(0, 0, w, h);
    for (const s of this.stars) {
      if (moving) {
        s.x += s.dx * dt; s.y += s.dy * dt; s.ox *= Math.pow(.9, dt); s.oy *= Math.pow(.9, dt);
        if (pointer) {
          const ddx = s.x + s.ox - this.px, ddy = s.y + s.oy - this.py, d = Math.hypot(ddx, ddy);
          if (d < 120 && d > 0) { const f = (120 - d) / 120 * .9; s.ox += ddx / d * f * 2.2; s.oy += ddy / d * f * 2.2; }
        }
        if (s.x < -4) s.x = w + 4; else if (s.x > w + 4) s.x = -4; if (s.y < -4) s.y = h + 4; else if (s.y > h + 4) s.y = -4;
      }
      const x = s.x + s.ox + this.sx * s.z, y = s.y + s.oy + this.sy * s.z, tw = moving ? .78 + .22 * Math.sin(t * 1.3 + s.ph) : 1, D = (s.r * 2.2 + 1.2) * 2;
      ctx.globalAlpha = Math.min(1, s.a * tw * 1.2); ctx.drawImage(glowSprite(s.tint), x - D / 2, y - D / 2, D, D);
      if (s.r > 1.9) { ctx.globalAlpha = s.a * .3 * tw; ctx.fillStyle = "rgb(205,185,255)"; ctx.fillRect(x - s.r * 2.6, y - .4, s.r * 5.2, .8); ctx.fillRect(x - .4, y - s.r * 2.6, .8, s.r * 5.2); }
    }
    ctx.globalAlpha = 1;
    if (moving) {
      if (!this.shoot && now > this.nextShoot) { const ang = .35 + Math.random() * .5; this.shoot = { x: Math.random() * w * .8, y: Math.random() * h * .4, vx: Math.cos(ang) * 9, vy: Math.sin(ang) * 9, life: 1 }; this.nextShoot = now + 9000 + Math.random() * 14000; }
      if (this.shoot) {
        const sh = this.shoot; sh.x += sh.vx * dt; sh.y += sh.vy * dt; sh.life -= .022 * dt;
        const g = ctx.createLinearGradient(sh.x, sh.y, sh.x - sh.vx * 9, sh.y - sh.vy * 9); g.addColorStop(0, `rgba(235,225,255,${.8 * sh.life})`); g.addColorStop(1, "rgba(235,225,255,0)");
        ctx.strokeStyle = g; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(sh.x - sh.vx * 9, sh.y - sh.vy * 9); ctx.stroke();
        if (sh.life <= 0) this.shoot = null;
      }
    }
  }
  destroy() {
    this.host.removeEventListener("pointermove", this.onMove); this.host.removeEventListener("pointerleave", this.onLeave);
    this.ro && this.ro.disconnect(); this.canvas.remove(); this.host.classList.remove("has-live-sky"); SkyManager.remove(this);
  }
}
const SkyManager = {
  set: new Set(), raf: 0,
  add(s) { this.set.add(s); if (!this.raf) this.raf = requestAnimationFrame(t => this.tick(t)); },
  remove(s) { this.set.delete(s); },
  tick(now) {
    this.raf = 0;
    for (const s of [...this.set]) {
      if (!s.host.isConnected) { s.destroy(); continue; }
      if (s.host.clientWidth && !document.hidden) { if (s.host.clientWidth !== s.w || s.host.clientHeight !== s.h) s.resize(); s.draw(now); }
    }
    if (this.set.size) this.raf = requestAnimationFrame(t => this.tick(t));
  }
};

/* ==========================================================================================
 * SPHERE LAYOUT
 * Every note takes a place on an evenly spaced sphere (a Fibonacci lattice). The spacing is
 * recomputed for the current number of notes, so the sphere always looks complete and the
 * stars glide to their new places whenever notes are added or removed.
 * ======================================================================================== */
const GOLDEN = Math.PI * (3 - Math.sqrt(5)), SPHERE_R = .95;
function spherePoint(i, n) {
  const y = n <= 1 ? 1 : 1 - 2 * (i + .5) / n, r = Math.sqrt(Math.max(0, 1 - y * y)), th = GOLDEN * i;
  return [Math.cos(th) * r * SPHERE_R, y * SPHERE_R, Math.sin(th) * r * SPHERE_R];
}
const GLOBE = (() => {                      // a faint latitude / longitude grid so the sphere reads as a solid
  const lines = [];
  for (const lat of [-60, -30, 0, 30, 60]) { const a = lat * Math.PI / 180, pts = []; for (let k = 0; k <= 64; k++) { const t = k / 64 * TAU; pts.push([Math.cos(a) * Math.cos(t) * SPHERE_R, Math.sin(a) * SPHERE_R, Math.cos(a) * Math.sin(t) * SPHERE_R]); } lines.push(pts); }
  for (let m = 0; m < 8; m++) { const t0 = m / 8 * Math.PI, pts = []; for (let k = 0; k <= 64; k++) { const a = k / 64 * TAU; pts.push([Math.cos(a) * Math.cos(t0) * SPHERE_R, Math.sin(a) * SPHERE_R, Math.cos(a) * Math.sin(t0) * SPHERE_R]); } lines.push(pts); }
  return lines;
})();
/* ==========================================================================================
 * ICOSAHEDRON LAYOUT
 * 12 vertices come first (a cap of triangles grows from the top, so a small vault gives an
 * unfinished icosahedron), then the 30 edge midpoints, then spikes that extend outward from
 * the edges, then edge thirds and shells of ever longer spikes for very large vaults.
 * ======================================================================================== */
const PHI = (1 + Math.sqrt(5)) / 2;
const ICO = (() => {
  const raw = [[0,1,PHI],[0,-1,PHI],[0,1,-PHI],[0,-1,-PHI],[1,PHI,0],[-1,PHI,0],[1,-PHI,0],[-1,-PHI,0],[PHI,0,1],[-PHI,0,1],[PHI,0,-1],[-PHI,0,-1]];
  const n = Math.hypot(1, PHI), a = Math.atan2(PHI, 1), ca = Math.cos(a), sa = Math.sin(a), R = .92;
  let V = raw.map(v => { const y = v[1] * ca + v[2] * sa, z = -v[1] * sa + v[2] * ca; return [v[0] / n * R, y / n * R, z / n * R]; });
  V.sort((p, q) => Math.abs(q[1] - p[1]) > .05 ? q[1] - p[1] : Math.atan2(p[2], p[0]) - Math.atan2(q[2], q[0]));      // top, upper ring, lower ring, bottom
  let min = 1e9; for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) min = Math.min(min, Math.hypot(V[i][0]-V[j][0], V[i][1]-V[j][1], V[i][2]-V[j][2]));
  const E = []; for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) if (Math.hypot(V[i][0]-V[j][0], V[i][1]-V[j][1], V[i][2]-V[j][2]) < min * 1.02) E.push([i, j]);
  E.sort((p, q) => p[1] - q[1] || p[0] - q[0]);
  const adj = new Set(E.map(e => e[0] * 12 + e[1])), F = [];
  for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) for (let k = j + 1; k < 12; k++) if (adj.has(i * 12 + j) && adj.has(j * 12 + k) && adj.has(i * 12 + k)) F.push([i, j, k]);
  return { V, E, F };
})();
const SLOTS = []; let slotStage = 0;
const norm3 = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
function extendSlots() {
  const V = ICO.V, E = ICO.E, st = slotStage++;
  const mid = e => [(V[e[0]][0] + V[e[1]][0]) / 2, (V[e[0]][1] + V[e[1]][1]) / 2, (V[e[0]][2] + V[e[1]][2]) / 2];
  if (st === 0) { V.forEach(v => SLOTS.push({ p: v.slice(), parents: [], tier: 0 })); }
  else if (st === 1) { E.forEach(e => SLOTS.push({ p: mid(e), parents: [e[0], e[1]], tier: 1 })); }
  else if (st === 2) { E.forEach((e, k) => { const m = mid(e), n = norm3(m); SLOTS.push({ p: [m[0] + n[0] * .30, m[1] + n[1] * .30, m[2] + n[2] * .30], parents: [12 + k], tier: 2 }); }); }
  else if (st === 3) {
    E.forEach((e, k) => [1 / 3, 2 / 3].forEach((t, q) => {
      const a = V[e[0]], b = V[e[1]], p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      SLOTS.push({ p, parents: [q === 0 ? e[0] : e[1], 12 + k], tier: 3 });
    }));
  }
  else if (st === 4) { const b0 = 72; for (let i = 0; i < 60; i++) { const t = SLOTS[b0 + i], n = norm3(t.p); SLOTS.push({ p: [t.p[0] + n[0] * .24, t.p[1] + n[1] * .24, t.p[2] + n[2] * .24], parents: [b0 + i], tier: 4 }); } }
  else {                                                                                            // shells: longer and longer spikes, fanned slightly along each edge
    const lvl = st - 4, prevBase = lvl === 1 ? 42 : SLOTS.length - 30;
    E.forEach((e, k) => {
      const m = mid(e), n = norm3(m), ed = norm3([V[e[1]][0]-V[e[0]][0], V[e[1]][1]-V[e[0]][1], V[e[1]][2]-V[e[0]][2]]), side = (lvl % 2 ? 1 : -1) * .1 * (1 + lvl * .15), h = .30 + .26 * lvl;
      SLOTS.push({ p: [m[0] + n[0] * h + ed[0] * side, m[1] + n[1] * h + ed[1] * side, m[2] + n[2] * h + ed[2] * side], parents: [prevBase + k], tier: 5 });
    });
  }
}
function slotAt(i) { while (SLOTS.length <= i) extendSlots(); return SLOTS[i]; }
function scatterPos() { const u = Math.random() * 2 - 1, a = Math.random() * TAU, r = 2 + Math.random() * 2.4, s = Math.sqrt(1 - u * u); return [r * s * Math.cos(a), r * u, r * s * Math.sin(a)]; }

/* ==========================================================================================
 * COSMIC GRAPH VIEW
 * ======================================================================================== */
class CosmicGraphView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin; this.stars = []; this.slots = []; this.starOf = new Map(); this.links = []; this.frame = []; this.faces = null; this.folders = []; this.layout = (plugin.settings && plugin.settings.layout) || "icosahedron";
    this.rotationY = .6; this.rotationX = -.28; this.velY = 0; this.zoom = 1;
    this.autoRotate = true; this.arrange = true; this.showLinks = true; this.showFrame = true; this.focusFolder = null;
    this.dragging = false; this.grab = null; this.hover = null; this.pointers = new Map(); this.pinch = 0; this.pointerMoved = false;
    this.assembled = 0; this.raf = 0; this.last = 0; this.cam = null; this.boundResize = () => this.resize();
  }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return "Cosmic Graph"; }
  getIcon() { return "orbit"; }

  async onOpen() {
    const host = this.contentEl || this.containerEl;
    this.containerEl.addClass("spacyg-cosmic-view"); host.empty();
    const root = host.createDiv({ cls: "sg-cosmos" }); this.root = root;
    const header = root.createDiv({ cls: "sg-header" });
    const tw = header.createDiv({ cls: "sg-title-wrap" });
    tw.createDiv({ cls: "sg-kicker", text: "SPACYG • COSMIC GRAPH" });
    this.titleEl = tw.createEl("h2", { text: "" });
    this.subEl = tw.createDiv({ cls: "sg-subtitle", text: "" });
    const controls = header.createDiv({ cls: "sg-controls" });
    const btn = (label, fn) => { const b = controls.createEl("button", { text: label, cls: "sg-button" }); b.addEventListener("click", () => fn(b)); return b; };
    const toggle = (label, key) => { const b = btn(label, () => { this[key] = !this[key]; b.classList.toggle("is-on", this[key]); b.setAttribute("aria-pressed", String(this[key])); this.relink(); }); b.classList.add("is-on"); b.setAttribute("aria-pressed", "true"); return b; };
    btn("Reset view", () => { this.rotationX = -.28; this.rotationY = .6; this.zoom = 1; this.velY = 0; });
    btn("Replay assembly", () => this.replay());
    this.layoutBtn = btn("", () => { this.layout = this.layout === "icosahedron" ? "sphere" : "icosahedron"; if (this.plugin.settings) { this.plugin.settings.layout = this.layout; this.plugin.saveSettings && this.plugin.saveSettings(); } this.relink(); this.applyLayoutText(); });
    toggle("Shape", "arrange"); toggle("Links", "showLinks"); this.frameBtn = toggle("Frame", "showFrame"); toggle("Auto-rotate", "autoRotate");
    btn("Refresh", () => this.loadNotes(true));

    const stage = root.createDiv({ cls: "sg-stage" }); this.stage = stage;
    this.sky = new Sky(stage, this.plugin);
    this.canvas = stage.createEl("canvas", { cls: "sg-canvas" }); this.ctx = this.canvas.getContext("2d");
    this.hud = stage.createDiv({ cls: "sg-hud" });
    this.hud.createDiv({ cls: "sg-hud-label", text: "YOUR KNOWLEDGE COSMOS" });
    this.countEl = this.hud.createDiv({ cls: "sg-count", text: "Mapping your vault…" });
    this.folderEl = stage.createDiv({ cls: "sg-folders" });
    this.tooltip = stage.createDiv({ cls: "sg-tooltip" }); this.tooltip.style.display = "none";
    stage.createDiv({ cls: "sg-hint", text: "Drag a star to pull its links  ·  Drag space to rotate  ·  Scroll or pinch to zoom  ·  Click a star to open it" });
    const footer = root.createDiv({ cls: "sg-footer" });
    this.footShape = footer.createSpan({ text: "" }); footer.createSpan({ text: "AUTO-SYNC ENABLED" }); footer.createSpan({ text: "LOCAL VAULT ONLY" });

    this.applyLayoutText();
    const cv = this.canvas;
    cv.addEventListener("pointerdown", e => {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
      this.pointerMoved = false; this.velY = 0; this.downAt = { x: e.clientX, y: e.clientY };
      if (this.pointers.size === 1) {
        const hit = this.nearest(e.clientX, e.clientY, 10);
        if (hit) { this.grab = { star: hit, tx: hit.p[0], ty: hit.p[1], tz: hit.p[2] }; hit.pinned = true; cv.classList.add("is-grabbing"); }
        else { this.dragging = true; cv.classList.add("is-dragging"); }
      } else { this.releaseGrab(); this.dragging = true; const [a, b] = [...this.pointers.values()]; this.pinch = Math.hypot(a.x - b.x, a.y - b.y); }
    });
    cv.addEventListener("pointermove", e => {
      const p = this.pointers.get(e.pointerId);
      if (!p) { this.updateHover(e.clientX, e.clientY); return; }
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 4) this.pointerMoved = true;
      if (this.pointers.size === 2) { const [a, b] = [...this.pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (this.pinch) this.zoom = clamp(this.zoom * d / this.pinch, .45, 3.2); this.pinch = d; return; }
      if (this.grab) { this.dragTo(e.clientX, e.clientY); return; }
      if (this.dragging) { this.rotationY += dx * .006; this.velY = dx * .0014; this.rotationX = clamp(this.rotationX + dy * .006, -1.45, 1.45); }
    });
    const end = e => {
      if (!this.pointers.has(e.pointerId)) return; this.pointers.delete(e.pointerId);
      if (!this.pointers.size) {
        const g = this.grab; if (g && !this.pointerMoved && e.type === "pointerup") this.app.workspace.openLinkText(g.star.file.path, "", false);
        this.releaseGrab(); this.dragging = false; cv.classList.remove("is-dragging");
      }
      this.pinch = 0;
    };
    cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
    cv.addEventListener("pointerleave", () => { if (!this.pointers.size) this.setHover(null); });
    cv.addEventListener("wheel", e => { e.preventDefault(); this.zoom = clamp(this.zoom * (e.deltaY > 0 ? .92 : 1.087), .45, 3.2); }, { passive: false });
    this.ro = new ResizeObserver(this.boundResize); this.ro.observe(stage); window.addEventListener("resize", this.boundResize);
    await this.loadNotes(); this.resize(); this.last = performance.now(); this.animate();
  }
  target(s) { return this.layout === "sphere" ? spherePoint(s.slot, this.stars.length) : slotAt(s.slot).p; }
  applyLayoutText() {
    const ico = this.layout === "icosahedron";
    this.titleEl.setText(ico ? "Your vault as an icosahedron" : "Your vault as a sphere");
    this.subEl.setText(ico ? "Notes lock onto the shape. Grab any star and the notes it links to follow." : "Notes settle onto a sphere. Grab any star and the notes it links to follow.");
    this.footShape.setText(ico ? "ICOSAHEDRON" : "SPHERE");
    this.layoutBtn.textContent = ico ? "Layout: Icosahedron" : "Layout: Sphere";
    this.frameBtn.textContent = ico ? "Frame" : "Globe";
  }
  releaseGrab() { if (this.grab) { this.grab.star.pinned = false; this.grab = null; } this.canvas && this.canvas.classList.remove("is-grabbing"); }

  /* ---- vault -> stars ---- */
  async loadNotes(showNotice = false) {
    const files = this.app.vault.getMarkdownFiles().filter(f => !f.path.split("/").some(part => part.toLowerCase().includes("copilot")));
    const present = new Set(files), now = performance.now();
    for (const [f, st] of this.starOf) if (!present.has(f)) { this.slots[st.slot] = null; this.starOf.delete(f); }
    const fresh = files.filter(f => !this.starOf.has(f)).sort((a, b) => ((a.stat && a.stat.ctime) || 0) - ((b.stat && b.stat.ctime) || 0) || a.path.localeCompare(b.path));
    fresh.forEach((f, k) => {
      let slot = this.slots.indexOf(null); if (slot === -1) slot = this.slots.length;
      const st = { file: f, slot, p: scatterPos(), v: [0, 0, 0], pinned: false, startAt: now + 250 + Math.random() * 800 + k * 3, size: 2.7, phase: slot * .73, sx: 0, sy: 0, sr: 2, z2: 0, rgb: FOLDER_COLORS[0], deg: 0, p2: [0, 0, 0, 1] };
      this.slots[slot] = st; this.starOf.set(f, st);
    });
    const n = files.length;
    while (this.slots.length > n) { const last = this.slots.pop(); if (last) { const free = this.slots.indexOf(null); this.slots[free] = last; last.slot = free; } }
    this.stars = this.slots.filter(Boolean);
    const folderOf = f => (f.path.includes("/") ? f.path.split("/")[0] : "Root");
    const counts = new Map(); for (const f of files) counts.set(folderOf(f), (counts.get(folderOf(f)) || 0) + 1);
    this.folders = [...counts.keys()].sort((a, b) => a.localeCompare(b));
    for (const st of this.stars) { st.rgb = FOLDER_COLORS[this.folders.indexOf(folderOf(st.file)) % FOLDER_COLORS.length]; st.folder = folderOf(st.file); }
    this.relink();
    this.countEl && this.countEl.setText(`${n} notes · ${this.folders.length} folders · ${this.links.length} links`);
    if (this.folderEl) {
      this.folderEl.empty(); this.folderEl.createDiv({ cls: "sg-folder-title", text: "FOLDERS IN THIS UNIVERSE" });
      for (const folder of this.folders) {
        const item = this.folderEl.createDiv({ cls: "sg-folder" + (this.focusFolder === folder ? " is-focus" : "") }), c = FOLDER_COLORS[this.folders.indexOf(folder) % FOLDER_COLORS.length];
        const dot = item.createSpan({ cls: "sg-folder-dot" }); dot.style.background = `rgb(${c.join(",")})`;
        item.createSpan({ cls: "sg-folder-name", text: folder }); item.createSpan({ cls: "sg-folder-count", text: String(counts.get(folder)) });
        item.addEventListener("click", () => { this.focusFolder = this.focusFolder === folder ? null : folder; this.loadNotes(); });
      }
    }
    if (showNotice) new Notice(`Cosmic Graph refreshed: ${n} notes mapped (Copilot folders excluded).`);
  }
  /* links between notes, plus the icosahedron's own frame; both act as springs while you drag */
  relink() {
    const byPath = new Map(); for (const st of this.stars) byPath.set(st.file.path, st);
    const lk = (this.app.metadataCache && this.app.metadataCache.resolvedLinks) || {}, seen = new Set(); this.links = [];
    for (const st of this.stars) st.deg = 0;
    for (const src of Object.keys(lk)) {
      const a = byPath.get(src); if (!a) continue;
      for (const dst of Object.keys(lk[src])) {
        const b = byPath.get(dst); if (!b || a === b) continue;
        const key = a.slot < b.slot ? a.slot + ":" + b.slot : b.slot + ":" + a.slot; if (seen.has(key)) continue; seen.add(key);
        const A = this.target(a), B = this.target(b); this.links.push([a, b, Math.hypot(A[0]-B[0], A[1]-B[1], A[2]-B[2])]); a.deg++; b.deg++;
      }
    }
    for (const st of this.stars) st.size = 2.5 + Math.min(2.6, Math.sqrt(st.deg) * .8);
    this.frame = []; this.faces = null;
    if (this.layout === "icosahedron") {                       // the icosahedron's own frame; it acts as a rubber skeleton while you drag
      const bySlot = i => this.slots[i] || null;
      for (const st of this.stars) for (const par of slotAt(st.slot).parents) { const pr = bySlot(par); if (pr) { const A = slotAt(st.slot).p, B = slotAt(par).p; this.frame.push([st, pr, Math.hypot(A[0]-B[0], A[1]-B[1], A[2]-B[2]), slotAt(st.slot).tier]); } }
      for (const [i, j] of ICO.E) { const a = bySlot(i), b = bySlot(j); if (a && b) this.frame.push([a, b, Math.hypot(...ICO.V[i].map((c, k) => c - ICO.V[j][k])), 0]); }
      this.faces = ICO.F.filter(f => f.every(i => bySlot(i))).map(f => f.map(i => this.slots[i]));
    }
  }
  replay() { const now = performance.now(); this.stars.forEach((st, k) => { st.p = scatterPos(); st.v = [0, 0, 0]; st.startAt = now + 150 + Math.random() * 800 + k * 3; }); this.assembled = 0; this.latched = false; }

  /* ---- interaction ---- */
  nearest(cx, cy, pad) {
    const r = this.canvas.getBoundingClientRect(), x = cx - r.left, y = cy - r.top; let best = null, bd = 1e9;
    for (const st of this.stars) { const d = Math.hypot(st.sx - x, st.sy - y), lim = st.sr * 1.4 + pad; if (d < lim && (d - st.z2 * 3) < bd) { bd = d - st.z2 * 3; best = st; } }
    return best;
  }
  updateHover(cx, cy) { this.setHover(this.nearest(cx, cy, 6), cx, cy); }
  setHover(st, cx, cy) {
    this.hover = st; this.canvas.style.cursor = st ? "grab" : "";
    if (!st) { this.tooltip.style.display = "none"; return; }
    const r = this.canvas.getBoundingClientRect(), x = cx - r.left, y = cy - r.top;
    if (this.tipStar !== st) { this.tooltip.empty(); this.tooltip.createDiv({ cls: "sg-tip-note", text: st.file.basename }); this.tooltip.createDiv({ cls: "sg-tip-folder", text: `Folder: ${(st.file.parent && st.file.parent.path) || "Root"} · ${st.deg} link${st.deg === 1 ? "" : "s"}` }); this.tipStar = st; }
    this.tooltip.style.display = "block"; this.tooltip.style.left = `${Math.max(8, Math.min(r.width - 230, x + 14))}px`; this.tooltip.style.top = `${Math.max(8, Math.min(r.height - 65, y + 14))}px`;
  }
  dragTo(cx, cy) {                                  // move the grabbed star in the plane facing the camera, at its own depth
    const c = this.cam, g = this.grab; if (!c || !g) return;
    const r = this.canvas.getBoundingClientRect(), st = g.star, f = c.CAM / (c.CAM - st.p2[2]);
    const x1 = (cx - r.left - c.ox) / (c.scale * f), y1 = -(cy - r.top - c.oy) / (c.scale * f), z2 = st.p2[2];
    const y = y1 * c.cx + z2 * c.sx, z1 = -y1 * c.sx + z2 * c.cx;
    g.tx = x1 * c.cy - z1 * c.sy; g.ty = y; g.tz = x1 * c.sy + z1 * c.cy;
  }
  resize() {
    if (!this.canvas) return; const r = this.canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.floor(r.width * dpr)); this.canvas.height = Math.max(1, Math.floor(r.height * dpr)); this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ---- physics: a pinned star drags its link neighbours, like the default graph ---- */
  step(dt, now) {
    const S = this.stars, shape = this.arrange, ks = shape ? 9 : 0, kl = shape ? 17 : 4.5, kf = 4, damp = shape ? 5.2 : 2.8;
    for (const s of S) { s.a0 = 0; s.a1 = 0; s.a2 = 0; }
    for (const s of S) {
      if (now < s.startAt || s.pinned) continue;
      if (shape) { const T = this.target(s); s.a0 += ks * (T[0] - s.p[0]); s.a1 += ks * (T[1] - s.p[1]); s.a2 += ks * (T[2] - s.p[2]); }
      else { s.a0 -= .6 * s.p[0]; s.a1 -= .6 * s.p[1]; s.a2 -= .6 * s.p[2]; }
    }
    const spring = (a, b, rest, k) => {
      const dx = b.p[0] - a.p[0], dy = b.p[1] - a.p[1], dz = b.p[2] - a.p[2], d = Math.hypot(dx, dy, dz) || 1e-4, f = k * (d - rest) / d;
      if (!a.pinned) { a.a0 += f * dx; a.a1 += f * dy; a.a2 += f * dz; } if (!b.pinned) { b.a0 -= f * dx; b.a1 -= f * dy; b.a2 -= f * dz; }
    };
    for (const l of this.links) spring(l[0], l[1], shape ? l[2] : .5, kl);
    if (shape) { for (const f of this.frame) spring(f[0], f[1], f[2], kf); }
    else if (S.length <= 450) {                       // free mode: nodes push apart like the default graph
      for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) {
        const a = S[i], b = S[j], dx = a.p[0] - b.p[0], dy = a.p[1] - b.p[1], dz = a.p[2] - b.p[2], d2 = dx * dx + dy * dy + dz * dz + .002;
        if (d2 < .16) { const f = .012 / d2; a.a0 += f * dx; a.a1 += f * dy; a.a2 += f * dz; b.a0 -= f * dx; b.a1 -= f * dy; b.a2 -= f * dz; }
      }
    }
    const dec = Math.exp(-damp * dt), g = this.grab;
    for (const s of S) {
      if (s.pinned && g && g.star === s) { s.p[0] += (g.tx - s.p[0]) * .5; s.p[1] += (g.ty - s.p[1]) * .5; s.p[2] += (g.tz - s.p[2]) * .5; s.v[0] = s.v[1] = s.v[2] = 0; continue; }
      if (now < s.startAt) continue;
      s.v[0] = (s.v[0] + s.a0 * dt) * dec; s.v[1] = (s.v[1] + s.a1 * dt) * dec; s.v[2] = (s.v[2] + s.a2 * dt) * dec;
      s.p[0] += s.v[0] * dt; s.p[1] += s.v[1] * dt; s.p[2] += s.v[2] * dt;
      const l = Math.hypot(s.p[0], s.p[1], s.p[2]); if (l > 7) { s.p[0] *= 7 / l; s.p[1] *= 7 / l; s.p[2] *= 7 / l; }
    }
  }

  /* ---- frame ---- */
  animate() {
    if (!this.ctx || !this.canvas || !this.canvas.isConnected) return;
    const now = performance.now(), dt = Math.min(.05, (now - this.last) / 1000); this.last = now;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight, ctx = this.ctx, t = now / 1000;
    if (!this.dragging && !this.grab) { this.rotationY += this.velY; this.velY *= .94; if (this.autoRotate && !REDUCED() && Math.abs(this.velY) < .0015) this.rotationY += .12 * dt; }
    const c = { cy: Math.cos(this.rotationY), sy: Math.sin(this.rotationY), cx: Math.cos(this.rotationX), sx: Math.sin(this.rotationX), CAM: 4.4, scale: Math.min(w / 2.3, h / 2.1) * this.zoom, ox: w / 2, oy: h / 2 + h * .01 };
    this.cam = c;
    const px = Math.min(w, h) / 700, proj = (x, y, z, o) => { const x1 = x * c.cy + z * c.sy, z1 = -x * c.sy + z * c.cy, y1 = y * c.cx - z1 * c.sx, z2 = y * c.sx + z1 * c.cx, f = c.CAM / (c.CAM - z2); o[0] = c.ox + x1 * c.scale * f; o[1] = c.oy - y1 * c.scale * f; o[2] = z2; o[3] = f; };
    const sub = Math.max(1, Math.ceil(dt / (1 / 90))); for (let k = 0; k < sub; k++) this.step(dt / sub, now);
    let settled = 0;
    for (const s of this.stars) {
      const T = this.target(s); if (Math.hypot(T[0] - s.p[0], T[1] - s.p[1], T[2] - s.p[2]) < .05) settled++;
      const br = this.arrange && !s.pinned ? .005 * Math.sin(t * .9 + s.phase) : 0;
      proj(s.p[0] + br, s.p[1] + br * .7, s.p[2], s.p2); s.sx = s.p2[0]; s.sy = s.p2[1]; s.z2 = s.p2[2]; s.sr = clamp(s.size * s.p2[3] * px * 1.3, 1.3, 11);
    }
    const target = this.stars.length ? settled / this.stars.length : 1; this.assembled += (target - this.assembled) * Math.min(1, dt * 3);
    if (this.assembled > .9) this.latched = true;
    const lineA = this.latched ? 1 : smooth01(.4, .95, this.assembled);        // once built, the frame stays visible while you drag
    if (this.sky) { this.sky.sx = -this.rotationY * 26; this.sky.sy = this.rotationX * 20; }
    ctx.clearRect(0, 0, w, h);
    const glow = ctx.createRadialGradient(w * .5, h * .5, 2, w * .5, h * .5, Math.max(w, h) * .6);
    glow.addColorStop(0, "rgba(93,54,180,.15)"); glow.addColorStop(1, "rgba(6,4,16,0)"); ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
    const hv = this.grab ? this.grab.star : this.hover, nb = new Set();
    if (hv) for (const l of this.links) { if (l[0] === hv) nb.add(l[1]); else if (l[1] === hv) nb.add(l[0]); }
    if (this.layout === "sphere") {                          // the globe: faint latitude and longitude lines, banded by depth
      if (this.showFrame && this.arrange && lineA > .01) {
        const bands = [[], [], []], tmp = [0, 0, 0, 0];
        for (const line of GLOBE) { let prev = null; for (const q of line) { proj(q[0], q[1], q[2], tmp); const cur = [tmp[0], tmp[1], tmp[2]]; if (prev) { const z = (prev[2] + cur[2]) / 2, bi = z < -.3 ? 0 : z < .3 ? 1 : 2; bands[bi].push(prev[0], prev[1], cur[0], cur[1]); } prev = cur; } }
        ctx.lineCap = "round";
        bands.forEach((seg, bi) => { ctx.beginPath(); for (let i = 0; i < seg.length; i += 4) { ctx.moveTo(seg[i], seg[i + 1]); ctx.lineTo(seg[i + 2], seg[i + 3]); } ctx.strokeStyle = `rgba(176,148,255,${(.05 + bi * .06) * lineA})`; ctx.lineWidth = (.8 + bi * .3) * Math.max(.8, px * 1.05); ctx.stroke(); });
      }
    } else if (this.showFrame && this.arrange && lineA > .01) {      // icosahedron: glassy faces, then the frame (edges and the spikes growing from them)
      if (this.faces) {
        const fs = this.faces.map(f => ({ f, z: (f[0].z2 + f[1].z2 + f[2].z2) / 3 })).sort((a, b) => a.z - b.z);
        for (const q of fs) { ctx.beginPath(); ctx.moveTo(q.f[0].sx, q.f[0].sy); ctx.lineTo(q.f[1].sx, q.f[1].sy); ctx.lineTo(q.f[2].sx, q.f[2].sy); ctx.closePath(); ctx.fillStyle = `rgba(124,92,235,${(.035 + .045 * clamp((q.z + 1) / 2, 0, 1)) * lineA})`; ctx.fill(); }
      }
      const bands = [[], [], []];
      for (const f of this.frame) { const z = (f[0].z2 + f[1].z2) / 2, bi = z < -.3 ? 0 : z < .3 ? 1 : 2; bands[bi].push(f); }
      ctx.lineCap = "round";
      bands.forEach((list, bi) => { ctx.beginPath(); for (const f of list) { ctx.moveTo(f[0].sx, f[0].sy); ctx.lineTo(f[1].sx, f[1].sy); } ctx.strokeStyle = `rgba(176,148,255,${(.16 + bi * .14) * lineA})`; ctx.lineWidth = (.9 + bi * .4) * Math.max(.8, px * 1.1); ctx.stroke(); });
    }
    if (this.showLinks && this.links.length) {
      const lowA = Math.min(.2, 8 / Math.sqrt(this.links.length + 1) * .05 + .06);
      ctx.beginPath(); for (const l of this.links) if (!hv || (l[0] !== hv && l[1] !== hv)) { ctx.moveTo(l[0].sx, l[0].sy); ctx.lineTo(l[1].sx, l[1].sy); }
      ctx.strokeStyle = `rgba(139,233,253,${lowA * smooth01(.1, .8, this.assembled)})`; ctx.lineWidth = .8; ctx.stroke();
      if (hv) { ctx.beginPath(); for (const l of this.links) if (l[0] === hv || l[1] === hv) { ctx.moveTo(l[0].sx, l[0].sy); ctx.lineTo(l[1].sx, l[1].sy); } ctx.strokeStyle = "rgba(139,233,253,.9)"; ctx.lineWidth = 1.6; ctx.stroke(); }
    }
    const order = this.stars.slice().sort((a, b) => a.z2 - b.z2);
    ctx.globalCompositeOperation = "lighter";
    for (const s of order) {
      const cue = clamp(.45 + .55 * ((s.z2 + 1.2) / 2.4), .3, 1), tw = .88 + .12 * Math.sin(t * 1.7 + s.phase);
      let a = cue * tw, r = s.sr;
      if (this.focusFolder && s.folder !== this.focusFolder) a *= .16;
      if (s === hv) { r *= 1.7; a = 1; } else if (nb.has(s)) { r *= 1.35; a = 1; }
      const D = r * 7; ctx.globalAlpha = Math.min(1, a); ctx.drawImage(glowSprite(s.rgb), s.sx - D / 2, s.sy - D / 2, D, D);
      if (r > 2.2) { ctx.fillStyle = "rgb(255,250,255)"; ctx.beginPath(); ctx.arc(s.sx, s.sy, r * .5, 0, TAU); ctx.fill(); }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    if (hv) { ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(hv.sx, hv.sy, hv.sr * 2.3 + 3, 0, TAU); ctx.stroke(); }
    this.raf = requestAnimationFrame(() => this.animate());
  }
  async onClose() {
    if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0;
    this.ro && this.ro.disconnect(); window.removeEventListener("resize", this.boundResize);
    this.sky && this.sky.destroy(); this.root && this.root.remove();
  }
}

class CosmicSettingTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const { containerEl } = this, s = this.plugin.settings; containerEl.empty();
    new Setting(containerEl).setName("Live sky in graph views").setDesc("Drifting, pointer-reactive stars behind the real graph view and the local graph.").addToggle(t => t.setValue(s.liveSky).onChange(async v => { s.liveSky = v; await this.plugin.saveSettings(); this.plugin.refreshSkies(); }));
    new Setting(containerEl).setName("Stars react to the pointer").setDesc("Stars shy away from your cursor.").addToggle(t => t.setValue(s.pointer).onChange(async v => { s.pointer = v; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("Star density").setDesc("More stars look richer; fewer stars are lighter on slow machines.").addSlider(sl => sl.setLimits(.4, 2, .1).setValue(s.density).setDynamicTooltip().onChange(async v => { s.density = v; await this.plugin.saveSettings(); this.plugin.refreshSkies(true); }));
  }
}

module.exports = class SpacyGCosmicGraph extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULTS, await this.loadData()); this.skies = new Map();
    this.registerView(VIEW_TYPE, leaf => new CosmicGraphView(leaf, this));
    this.addRibbonIcon("orbit", "Open Cosmic Graph", () => this.activateView());
    this.addCommand({ id: "open-cosmic-graph", name: "Open Cosmic Graph", callback: () => this.activateView() });
    this.addCommand({ id: "replay-cosmic-assembly", name: "Replay Cosmic Graph assembly", callback: () => { for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) leaf.view.replay(); } });
    this.addSettingTab(new CosmicSettingTab(this.app, this));
    const md = f => f && f.extension === "md";
    this.registerEvent(this.app.vault.on("create", f => { if (md(f)) this.refreshViews(); }));
    this.registerEvent(this.app.vault.on("delete", f => { if (md(f)) this.refreshViews(); }));
    this.registerEvent(this.app.vault.on("rename", f => { if (md(f)) this.refreshViews(); }));
    if (this.app.metadataCache && this.app.metadataCache.on) this.registerEvent(this.app.metadataCache.on("resolved", () => this.refreshViews(900)));
    const scan = () => this.refreshSkies();
    this.registerEvent(this.app.workspace.on("layout-change", scan)); this.registerEvent(this.app.workspace.on("active-leaf-change", scan));
    this.app.workspace.onLayoutReady(scan);
  }
  async saveSettings() { await this.saveData(this.settings); }
  refreshViews(delay = 250) { clearTimeout(this._t); this._t = setTimeout(() => { for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) if (leaf.view && leaf.view.loadNotes) leaf.view.loadNotes(); }, delay); }
  /* put a live sky behind Obsidian's own graph panes */
  refreshSkies(rebuild = false) {
    if (rebuild || !this.settings.liveSky) { for (const sky of this.skies.values()) sky.destroy(); this.skies.clear(); }
    if (!this.settings.liveSky) return;
    for (const [host, sky] of [...this.skies]) if (!host.isConnected) { sky.destroy(); this.skies.delete(host); }
    for (const type of ["graph", "localgraph"]) for (const leaf of this.app.workspace.getLeavesOfType(type)) {
      const host = leaf.view && (leaf.view.contentEl || (leaf.view.containerEl && leaf.view.containerEl.querySelector(".view-content")));
      if (host && !this.skies.has(host)) this.skies.set(host, new Sky(host, this));
    }
  }
  onunload() { clearTimeout(this._t); for (const sky of this.skies.values()) sky.destroy(); this.skies.clear(); }
  async activateView() {
    const { workspace } = this.app; let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) { leaf = workspace.getLeaf("tab"); await leaf.setViewState({ type: VIEW_TYPE, active: true }); }
    workspace.revealLeaf(leaf);
  }
};
