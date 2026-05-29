/* ============================================================
   LOST MOUNTAIN — customizer + shared site behaviour (vanilla)
   ============================================================ */
(function () {
  /* ---------- shared: nav scroll, reveal, year ---------- */
  function shared() {
    const nav = document.querySelector('.nav');
    if (nav) {
      const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 30);
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add('in'); });
    }, { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
    document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
  }

  /* ---------- vectorizer: image -> 2-tone ink mask ---------- */
  function vectorize(img, threshold, invert) {
    const max = 900;
    let w = img.width, h = img.height;
    const s = Math.min(1, max / Math.max(w, h));
    w = Math.round(w * s); h = Math.round(h * s);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0, w, h);
    const id = x.getImageData(0, 0, w, h);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const a = d[i + 3];
      let ink = lum < threshold;
      if (invert) ink = !ink;
      if (a < 20) ink = false;            // respect transparency
      if (ink) { d[i] = d[i + 1] = d[i + 2] = 0; d[i + 3] = 255; }
      else { d[i + 3] = 0; }
    }
    x.putImageData(id, 0, 0);
    return c;
  }

  /* ---------- customizer ---------- */
  function customizer() {
    const canvas = document.getElementById('bottle-canvas');
    if (!canvas || !window.LostBottle) return;
    LostBottle.init(canvas);
    document.dispatchEvent(new Event('lostbottle:ready'));

    const els = {
      drop: document.getElementById('dropzone'),
      file: document.getElementById('file-input'),
      stage: document.getElementById('stage'),
      thresholdWrap: document.getElementById('threshold-wrap'),
      threshold: document.getElementById('threshold'),
      invert: document.getElementById('invert'),
      reupload: document.getElementById('reupload'),
      designName: document.getElementById('design-name'),
      qty: document.getElementById('qty'),
      qtyVal: document.getElementById('qty-val'),
      price: document.getElementById('price'),
      buy: document.getElementById('buy'),
      reset: document.getElementById('reset-view'),
      swatches: document.querySelectorAll('[data-bottle]'),
      engraveBtns: document.querySelectorAll('[data-engrave]'),
      coverageBtns: document.querySelectorAll('[data-coverage]'),
      designState: document.getElementById('design-state'),
    };

    let currentImg = null;
    const UNIT = 48;

    function reprocess() {
      if (!currentImg) return;
      const art = vectorize(currentImg, +els.threshold.value, els.invert.classList.contains('on'));
      LostBottle.setArt(art);
    }

    function loadFile(file) {
      if (!file || !file.type.startsWith('image/')) return;
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        currentImg = img;
        URL.revokeObjectURL(url);
        els.designState && els.designState.classList.add('has-art');
        els.thresholdWrap && els.thresholdWrap.classList.add('show');
        if (els.designName) els.designName.textContent = (file.name || 'design').replace(/\.[^.]+$/, '').slice(0, 28);
        reprocess();
      };
      img.src = url;
    }

    function updateSliderFill() {
      if (!els.threshold) return;
      const r = els.threshold;
      const pct = ((r.value - r.min) / (r.max - r.min)) * 100;
      r.style.setProperty('--p', pct + '%');
    }
    els.file && els.file.addEventListener('change', (e) => loadFile(e.target.files[0]));
    els.threshold && els.threshold.addEventListener('input', () => { updateSliderFill(); reprocess(); });
    updateSliderFill();
    els.invert && els.invert.addEventListener('click', () => { els.invert.classList.toggle('on'); reprocess(); });
    els.reupload && els.reupload.addEventListener('click', () => els.file.click());

    // drag & drop onto the whole stage
    if (els.stage) {
      ['dragenter', 'dragover'].forEach((ev) => els.stage.addEventListener(ev, (e) => {
        e.preventDefault(); els.stage.classList.add('dragging');
      }));
      ['dragleave', 'drop'].forEach((ev) => els.stage.addEventListener(ev, (e) => {
        e.preventDefault(); if (ev === 'dragleave' && e.target !== els.stage) return;
        els.stage.classList.remove('dragging');
      }));
      els.stage.addEventListener('drop', (e) => {
        const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) loadFile(f);
      });
    }

    // bottle color swatches
    els.swatches.forEach((sw) => sw.addEventListener('click', () => {
      els.swatches.forEach((s) => s.classList.remove('active'));
      sw.classList.add('active');
      LostBottle.setBottleColor(sw.dataset.bottle, sw.dataset.cap);
    }));

    // engrave style
    els.engraveBtns.forEach((b) => b.addEventListener('click', () => {
      els.engraveBtns.forEach((s) => s.classList.remove('active'));
      b.classList.add('active');
      LostBottle.setEngraveStyle(b.dataset.engrave);
    }));

    // coverage: full-wrap vs single panel
    els.coverageBtns.forEach((b) => b.addEventListener('click', () => {
      els.coverageBtns.forEach((s) => s.classList.remove('active'));
      b.classList.add('active');
      LostBottle.setCoverage && LostBottle.setCoverage(b.dataset.coverage);
    }));

    // quantity + price
    let qty = 1;
    function renderPrice() {
      els.qtyVal && (els.qtyVal.textContent = String(qty).padStart(2, '0'));
      const total = qty * UNIT;
      const unit = qty >= 12 ? 41 : qty >= 5 ? 44 : UNIT;
      const t = qty * unit;
      if (els.price) els.price.textContent = '$' + t.toFixed(0);
    }
    document.querySelectorAll('[data-qty]').forEach((b) => b.addEventListener('click', () => {
      qty = Math.max(1, Math.min(99, qty + (+b.dataset.qty)));
      renderPrice();
    }));
    renderPrice();

    els.reset && els.reset.addEventListener('click', () => LostBottle.resetView());

    // pick up a design sent over from Trip Studio
    try {
      const pending = localStorage.getItem('lm_pending_art');
      if (pending) {
        localStorage.removeItem('lm_pending_art');
        const img = new Image();
        img.onload = () => {
          currentImg = img;
          els.designState && els.designState.classList.add('has-art');
          els.thresholdWrap && els.thresholdWrap.classList.add('show');
          if (els.designName) els.designName.innerHTML = 'trip-composite<small>FROM TRIP STUDIO</small>';
          els.threshold.value = 200; updateSliderFill();
          reprocess();
          showToast('Your Trip Studio composite is on the bottle — spin it around.');
        };
        img.src = pending;
      }
    } catch (e) {}

    // purchase
    els.buy && els.buy.addEventListener('click', () => {
      const ok = !!currentImg;
      showToast(ok
        ? `Order started — ${qty} × Summit 32oz with your engraving. Routing to checkout…`
        : 'Upload a design first, then your bottle is ready to order.');
    });
  }

  /* ---------- toast ---------- */
  function showToast(msg) {
    let t = document.getElementById('toast');
    if (!t) {
      t = document.createElement('div'); t.id = 'toast';
      t.className = 'toast glass'; document.body.appendChild(t);
    }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._to); t._to = setTimeout(() => t.classList.remove('show'), 4200);
  }
  window.LMToast = showToast;

  /* ---------- design-tweak hook (called by React tweaks app) ---------- */
  function lerpHex(a, b, t) {
    const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
    const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
    const r = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
    return '#' + r.map((v) => v.toString(16).padStart(2, '0')).join('');
  }
  window.LMApplyTweaks = function (t) {
    const root = document.documentElement;
    if (t.accent) {
      root.style.setProperty('--accent', t.accent);
      // derive glow
      root.style.setProperty('--accent-glow', hexA(t.accent, 0.55));
      window.LostBottle && LostBottle.setAccent && LostBottle.setAccent(t.accent);
    }
    if (typeof t.voidDark === 'number') {
      root.style.setProperty('--void', lerpHex('#040507', '#0e141b', t.voidDark));
      root.style.setProperty('--void-2', lerpHex('#080b10', '#131d27', t.voidDark));
    }
    if (typeof t.hud === 'boolean') {
      document.querySelectorAll('.hud').forEach((h) => h.style.display = t.hud ? '' : 'none');
    }
    if (t.headline) {
      const el = document.querySelector('[data-headline]');
      if (el) el.innerHTML = t.headline;
    }
  };
  function hexA(hex, a) {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  document.addEventListener('DOMContentLoaded', () => { shared(); customizer(); });
})();
