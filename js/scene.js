/* ============================================================
   LOST MOUNTAIN — 3D bottle scene  (Three.js, global build)
   window.LostBottle.init(canvas), .setArt(canvas|null),
   .setBottleColor(hex), .setEngraveStyle(s), .setCoverage(mode),
   .setAccent(hex), .resetView()

   Interaction model:
     • Rotate (drag) and wheel-zoom only engage when the pointer is
       over — or very near — the bottle. Anywhere else the canvas is
       click-through so the page scrolls normally.
   ============================================================ */
(function () {
  const State = {
    renderer: null, scene: null, camera: null, controls: null,
    group: null, bottleMat: null, capMat: null, sleeve: null,
    sleeveMat: null, artCanvas: null, artCtx: null, artTex: null,
    hoverGlow: null, rimLight: null, baseY: 0, t0: performance.now(),
    sourceArt: null, engrave: 'laser', coverage: 'full', accent: '#4fd1e8',
    ready: false, raf: null, dragging: false, ray: null,
  };
  window.LostBottle = {};

  // default camera framing — pulled back so the whole bottle clears the nav
  const CAM_START = { x: 0, y: 2.7, z: 12.6 };
  const TARGET = { x: 0, y: 2.35, z: 0 };
  const DIST_MIN = 7.5, DIST_MAX = 17;

  /* ---- equirect studio environment for metal reflections ---- */
  function makeEnvTexture() {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 512;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, '#46525f');
    g.addColorStop(0.30, '#202832');
    g.addColorStop(0.52, '#0e131a');
    g.addColorStop(0.78, '#080b10');
    g.addColorStop(1, '#04060a');
    x.fillStyle = g; x.fillRect(0, 0, 1024, 512);
    // soft top key band (overhead studio light)
    const k = x.createRadialGradient(512, 20, 20, 512, 20, 420);
    k.addColorStop(0, 'rgba(255,255,255,0.95)');
    k.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = k; x.fillRect(0, 0, 1024, 300);
    // crisp vertical softbox reflections — read as metal
    const bands = [120, 360, 660, 900];
    bands.forEach((px, i) => {
      x.globalAlpha = i % 2 ? 0.55 : 0.8;
      const w = x.createLinearGradient(px - 70, 0, px + 70, 0);
      w.addColorStop(0, 'rgba(220,235,245,0)');
      w.addColorStop(0.5, 'rgba(226,240,250,0.95)');
      w.addColorStop(1, 'rgba(220,235,245,0)');
      x.fillStyle = w; x.fillRect(px - 70, 40, 140, 420);
    });
    x.globalAlpha = 1;
    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    if ('sRGBEncoding' in THREE) tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  /* ---- brushed-steel micro-roughness map (vertical grain) ---- */
  function makeBrushedTexture() {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#484848'; x.fillRect(0, 0, 1024, 256); // ~0.28 roughness base
    for (let i = 0; i < 2600; i++) {
      const px = Math.random() * 1024;
      const v = 50 + Math.random() * 38;     // 0.20–0.34 roughness streaks
      x.strokeStyle = `rgba(${v | 0},${v | 0},${v | 0},${0.35 + Math.random() * 0.4})`;
      x.lineWidth = Math.random() < 0.5 ? 1 : 2;
      x.beginPath(); x.moveTo(px, 0); x.lineTo(px, 256); x.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(10, 1);
    return tex;
  }

  /* ---- procedural bottle silhouette ---- */
  function buildBottle() {
    const g = new THREE.Group();
    const P = [
      [0.00, 0.00], [0.55, 0.00], [0.80, 0.02], [0.93, 0.09],
      [0.99, 0.22], [1.00, 0.42], [1.00, 3.02], [0.99, 3.30],
      [0.92, 3.56], [0.79, 3.80], [0.66, 3.99], [0.60, 4.14], [0.60, 4.24],
    ].map((p) => new THREE.Vector2(p[0], p[1]));

    const bodyGeo = new THREE.LatheGeometry(P, 200);
    State.bottleMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#c3cad2'),
      metalness: 1.0, roughness: 1.0,
      roughnessMap: makeBrushedTexture(),
      envMap: State.scene.environment, envMapIntensity: 1.4,
    });
    const body = new THREE.Mesh(bodyGeo, State.bottleMat);
    body.castShadow = true;
    g.add(body);

    // engraving sleeve (transparent decal hugging the body)
    State.artCanvas = document.createElement('canvas');
    State.artCanvas.width = 2048; State.artCanvas.height = 1024;
    State.artCtx = State.artCanvas.getContext('2d');
    drawSleeve();
    State.artTex = new THREE.CanvasTexture(State.artCanvas);
    if ('sRGBEncoding' in THREE) State.artTex.encoding = THREE.sRGBEncoding;
    State.artTex.anisotropy = 8;

    // tall sleeve so a full-wrap design covers the body top-to-base
    const sleeveGeo = new THREE.CylinderGeometry(1.006, 1.006, 2.9, 200, 1, true);
    State.sleeveMat = new THREE.MeshStandardMaterial({
      map: State.artTex,
      transparent: true,
      metalness: 0.85, roughness: 0.4,
      envMap: State.scene.environment, envMapIntensity: 0.7,
      bumpMap: State.artTex, bumpScale: -0.012,
      alphaTest: 0.02,
      depthWrite: false,
    });
    State.sleeve = new THREE.Mesh(sleeveGeo, State.sleeveMat);
    State.sleeve.position.y = 1.74;
    g.add(State.sleeve);

    // cap
    State.capMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#11161d'),
      metalness: 0.5, roughness: 0.55,
      envMap: State.scene.environment, envMapIntensity: 0.6,
    });
    const capGeo = new THREE.CylinderGeometry(0.64, 0.6, 0.62, 96);
    const cap = new THREE.Mesh(capGeo, State.capMat);
    cap.position.y = 4.46; g.add(cap);
    const lidGeo = new THREE.CylinderGeometry(0.6, 0.64, 0.12, 96);
    const lid = new THREE.Mesh(lidGeo, State.capMat);
    lid.position.y = 4.83; g.add(lid);
    // softly domed lid top
    const domeGeo = new THREE.SphereGeometry(0.6, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2);
    const dome = new THREE.Mesh(domeGeo, State.capMat);
    dome.scale.y = 0.3; dome.position.y = 4.89; g.add(dome);
    // collar ring at neck
    const ringGeo = new THREE.TorusGeometry(0.61, 0.035, 16, 96);
    const ring = new THREE.Mesh(ringGeo, State.capMat);
    ring.rotation.x = Math.PI / 2; ring.position.y = 4.16; g.add(ring);

    return g;
  }

  /* ---- draw the wrap canvas from current source art + style ---- */
  function drawSleeve() {
    const ctx = State.artCtx, W = 2048, H = 1024;
    ctx.clearRect(0, 0, W, H);

    if (!State.sourceArt) {
      // empty-state hint engraved faintly: dashed print frame + label
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.strokeStyle = 'rgba(180,200,215,0.5)';
      ctx.lineWidth = 4; ctx.setLineDash([18, 16]);
      const fw = State.coverage === 'full' ? 900 : 720;
      const fh = State.coverage === 'full' ? 760 : 600;
      roundRect(ctx, -fw / 2, -fh / 2, fw, fh, 26); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(190,205,220,0.55)';
      ctx.font = "600 46px 'Space Grotesk', sans-serif";
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('YOUR DESIGN', 0, -20);
      ctx.font = "400 26px 'Space Mono', monospace";
      ctx.fillStyle = 'rgba(150,167,180,0.5)';
      ctx.fillText(State.coverage === 'full'
        ? 'WRAPS THE WHOLE BOTTLE · 360°'
        : 'DROP AN IMAGE TO ENGRAVE', 0, 40);
      ctx.restore();
      State.artTex && (State.artTex.needsUpdate = true);
      return;
    }

    const a = State.sourceArt;
    ctx.save();
    if (State.coverage === 'full') {
      // FULL WRAP — the art covers the entire body, 360° and top-to-base.
      // Fit the art to the full wrap area ("cover"), tiled twice around so
      // a single mark reads continuously rather than stretching.
      const marginY = 70;                 // clear of lid collar / base seam
      const areaH = H - marginY * 2;
      const tiles = 2;                     // repeats around the circumference
      const tileW = W / tiles;
      const scale = Math.max(tileW / a.width, areaH / a.height);
      const dw = a.width * scale, dh = a.height * scale;
      for (let i = 0; i < tiles; i++) {
        const cx = tileW * i + tileW / 2;
        ctx.drawImage(a, cx - dw / 2, H / 2 - dh / 2, dw, dh);
      }
    } else {
      // PANEL — a single centered print area on one face.
      const areaW = 760, areaH = 760;
      const cx = W / 2, cy = H / 2;
      const scale = Math.min(areaW / a.width, areaH / a.height);
      const dw = a.width * scale, dh = a.height * scale;
      ctx.drawImage(a, cx - dw / 2, cy - dh / 2, dw, dh);
    }
    // recolor the ink according to engrave style
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = State.engrave === 'etched'
      ? 'rgba(228,236,242,0.92)'   // frosted sandblast
      : 'rgba(11,14,18,1)';        // dark laser mark
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    State.artTex && (State.artTex.needsUpdate = true);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function applyEngraveMatProps() {
    if (!State.sleeveMat) return;
    if (State.engrave === 'etched') {
      State.sleeveMat.roughness = 0.82;
      State.sleeveMat.metalness = 0.35;
      State.sleeveMat.bumpScale = 0.02;
    } else {
      State.sleeveMat.roughness = 0.38;
      State.sleeveMat.metalness = 0.85;
      State.sleeveMat.bumpScale = -0.014;
    }
    State.sleeveMat.needsUpdate = true;
  }

  /* ---------------- public API ---------------- */
  window.LostBottle.init = function (canvas) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.12;
    if ('sRGBEncoding' in THREE) r.outputEncoding = THREE.sRGBEncoding;
    State.renderer = r;
    State.ray = new THREE.Raycaster();

    const scene = new THREE.Scene();
    State.scene = scene;
    scene.environment = makeEnvTexture();

    const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    cam.position.set(CAM_START.x, CAM_START.y, CAM_START.z);
    State.camera = cam;

    // lights
    scene.add(new THREE.HemisphereLight(0x2b3540, 0x05070a, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(2.5, 6, 4); scene.add(key);
    const fill = new THREE.DirectionalLight(0xaecbe0, 0.5);
    fill.position.set(-4, 1, 3); scene.add(fill);
    State.rimLight = new THREE.PointLight(new THREE.Color(State.accent), 18, 30, 2);
    State.rimLight.position.set(-3, 3.5, -4); scene.add(State.rimLight);
    const topRim = new THREE.SpotLight(0xffffff, 3, 30, 0.6, 0.8);
    topRim.position.set(0, 9, -2); scene.add(topRim);

    // bottle
    State.group = buildBottle();
    State.baseY = 0;
    scene.add(State.group);

    // dark contact shadow on the ground for grounding
    State.scene.add(makeContactShadow());

    // hover glow pad beneath the bottle
    const glowTex = makeGlowTexture(State.accent);
    State.hoverGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xffffff, transparent: true,
      opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    State.hoverGlow.scale.set(6, 6, 1);
    State.hoverGlow.position.set(0, 0.1, 0);
    scene.add(State.hoverGlow);

    // controls — rotate only; we drive zoom manually so page scroll is free
    const ctr = new THREE.OrbitControls(cam, canvas);
    ctr.enableDamping = true; ctr.dampingFactor = 0.08;
    ctr.enablePan = false;
    ctr.enableZoom = false;
    ctr.minDistance = DIST_MIN; ctr.maxDistance = DIST_MAX;
    ctr.autoRotate = true; ctr.autoRotateSpeed = 0.55;
    ctr.rotateSpeed = 0.85;
    ctr.minPolarAngle = 0.55; ctr.maxPolarAngle = 2.35;
    ctr.target.set(TARGET.x, TARGET.y, TARGET.z);
    ctr.addEventListener('start', () => { ctr.autoRotate = false; State.dragging = true; });
    ctr.addEventListener('end', () => { State.dragging = false; });
    State.controls = ctr;

    // Canvas is click-through by default; we flip it interactive only while
    // the pointer is over/near the bottle, so the page stays easy to scroll.
    canvas.style.pointerEvents = 'none';
    const setInteractive = (on) => {
      canvas.style.pointerEvents = on ? 'auto' : 'none';
      canvas.style.cursor = on ? 'grab' : 'default';
    };
    window.addEventListener('mousemove', (e) => {
      if (State.dragging) return;
      setInteractive(isOverBottle(e.clientX, e.clientY, 0.75));
    });
    // Touch: best-effort — make interactive when a touch lands on the bottle.
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') setInteractive(isOverBottle(e.clientX, e.clientY, 0.9));
    }, true);
    // Wheel zoom — only when over the bottle (and not over UI chrome);
    // otherwise let the event through so the page scrolls.
    window.addEventListener('wheel', (e) => {
      if (!State.ready) return;
      if (e.target && e.target.closest && e.target.closest('.customizer, .nav, .twk-panel')) return;
      if (!isOverBottle(e.clientX, e.clientY, 0.85)) return;
      e.preventDefault();
      dolly(e.deltaY);
    }, { passive: false });

    applyEngraveMatProps();
    resize();
    window.addEventListener('resize', resize);
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => resize());
      ro.observe(canvas);
      if (canvas.parentElement) ro.observe(canvas.parentElement);
    }
    State.ready = true;
    animate();
  };

  // Is the screen point over — or within `pad` of — the bottle? Tests the
  // ray against a vertical cylinder around the bottle's world axis, so it
  // holds no matter how the camera is orbited.
  function isOverBottle(clientX, clientY, pad) {
    if (!State.camera || !State.renderer) return false;
    const rect = State.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    State.ray.setFromCamera(ndc, State.camera);
    const o = State.ray.ray.origin, d = State.ray.ray.direction;
    const R = 1.0 + (pad || 0);
    const a = d.x * d.x + d.z * d.z;
    if (a < 1e-6) return false;
    const b = 2 * (o.x * d.x + o.z * d.z);
    const c = o.x * o.x + o.z * o.z - R * R;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return false;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    if (t < 0) return false;
    const y = o.y + t * d.y;
    const gy = State.group ? State.group.position.y : 0;
    return y >= gy - 0.4 && y <= gy + 5.1;
  }

  function dolly(deltaY) {
    if (!State.controls) return;
    const t = State.controls.target;
    const offset = State.camera.position.clone().sub(t);
    let dist = offset.length();
    dist = Math.max(DIST_MIN, Math.min(DIST_MAX, dist * Math.exp(deltaY * 0.0014)));
    offset.setLength(dist);
    State.camera.position.copy(t).add(offset);
  }

  function makeContactShadow() {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d');
    const grd = x.createRadialGradient(128, 128, 4, 128, 128, 128);
    grd.addColorStop(0, 'rgba(0,0,0,0.55)');
    grd.addColorStop(0.55, 'rgba(0,0,0,0.28)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = grd; x.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(7, 4.2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.7, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = -0.05;
    return m;
  }

  function makeGlowTexture(hex) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d');
    const col = new THREE.Color(hex);
    const r = Math.round(col.r * 255), g = Math.round(col.g * 255), b = Math.round(col.b * 255);
    const grd = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, `rgba(${r},${g},${b},0.6)`);
    grd.addColorStop(0.4, `rgba(${r},${g},${b},0.18)`);
    grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
    x.fillStyle = grd; x.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }

  function resize() {
    const c = State.renderer.domElement;
    const w = c.clientWidth || c.parentElement.clientWidth;
    const h = c.clientHeight || c.parentElement.clientHeight;
    if (!w || !h) return;
    State.renderer.setSize(w, h, false);
    State.camera.aspect = w / h;
    State.camera.updateProjectionMatrix();
  }

  function animate() {
    State.raf = requestAnimationFrame(animate);
    const t = (performance.now() - State.t0) / 1000;
    if (State.group) {
      State.group.position.y = State.baseY + Math.sin(t * 0.85) * 0.07;
      State.group.rotation.z = Math.sin(t * 0.5) * 0.008;
    }
    if (State.hoverGlow) State.hoverGlow.material.opacity = 0.38 + Math.sin(t * 0.85) * 0.07;
    State.controls && State.controls.update();
    State.renderer.render(State.scene, State.camera);
  }

  window.LostBottle.setArt = function (artCanvasOrImg) {
    State.sourceArt = artCanvasOrImg || null;
    drawSleeve();
  };
  window.LostBottle.setEngraveStyle = function (style) {
    State.engrave = style === 'etched' ? 'etched' : 'laser';
    applyEngraveMatProps();
    drawSleeve();
  };
  window.LostBottle.setCoverage = function (mode) {
    State.coverage = mode === 'panel' ? 'panel' : 'full';
    drawSleeve();
  };
  window.LostBottle.setBottleColor = function (hex, capHex) {
    if (!State.bottleMat) return;
    State.bottleMat.color.set(hex);
    // steel stays metallic; matte colors lower metalness
    const isSteel = hex.toLowerCase() === '#c3cad2';
    State.bottleMat.metalness = isSteel ? 1.0 : 0.55;
    State.bottleMat.roughness = isSteel ? 1.0 : 0.62;
    State.bottleMat.needsUpdate = true;
    if (State.capMat) State.capMat.color.set(capHex || '#11161d');
  };
  window.LostBottle.setAccent = function (hex) {
    State.accent = hex;
    if (State.rimLight) State.rimLight.color.set(hex);
    if (State.hoverGlow) State.hoverGlow.material.map = makeGlowTexture(hex);
  };
  window.LostBottle.resetView = function () {
    if (!State.controls) return;
    State.camera.position.set(CAM_START.x, CAM_START.y, CAM_START.z);
    State.controls.target.set(TARGET.x, TARGET.y, TARGET.z);
    State.controls.autoRotate = true;
    State.controls.update();
  };
})();
