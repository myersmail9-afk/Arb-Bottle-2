/* ============================================================
   LOST MOUNTAIN — Trip Studio
   Real client-side photo -> 2-tone sketch composite.
   ============================================================ */
(function () {
  const slots = [];           // {img, name}
  let resultDataURL = null;

  function $(id) { return document.getElementById(id); }

  function thumbHTML(i, s) {
    if (!s) return `<div class="ts-slot empty" data-i="${i}"><span>+</span><small>PHOTO ${i + 1}</small></div>`;
    return `<div class="ts-slot filled" data-i="${i}" style="background-image:url(${s.thumb})">
      <button class="ts-x" data-rm="${i}">×</button></div>`;
  }

  function render() {
    const grid = $('ts-grid');
    let html = '';
    for (let i = 0; i < 5; i++) html += thumbHTML(i, slots[i]);
    grid.innerHTML = html;
    grid.querySelectorAll('.ts-slot.empty').forEach((el) =>
      el.addEventListener('click', () => pick(+el.dataset.i)));
    grid.querySelectorAll('[data-rm]').forEach((b) =>
      b.addEventListener('click', (e) => { e.stopPropagation(); slots[+b.dataset.rm] = null; compact(); render(); }));
    $('ts-generate').disabled = slots.filter(Boolean).length < 1;
    $('ts-count').textContent = String(slots.filter(Boolean).length).padStart(2, '0');
  }
  function compact() { const f = slots.filter(Boolean); slots.length = 0; f.forEach((s) => slots.push(s)); }

  function pick(i) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
    inp.onchange = () => {
      const files = [...inp.files].slice(0, 5);
      let idx = slots.filter(Boolean).length;
      files.forEach((f) => {
        if (idx >= 5) return;
        const img = new Image();
        const url = URL.createObjectURL(f);
        img.onload = () => {
          const t = document.createElement('canvas'); t.width = 160; t.height = 160;
          const x = t.getContext('2d');
          const s = Math.max(160 / img.width, 160 / img.height);
          x.drawImage(img, (160 - img.width * s) / 2, (160 - img.height * s) / 2, img.width * s, img.height * s);
          slots[idx] = { img, name: f.name, thumb: t.toDataURL() };
          idx++; URL.revokeObjectURL(url); render();
        };
        img.src = url;
      });
    };
    inp.click();
  }

  /* 2-tone sketch conversion of one image into a target box (paper=white, ink=black) */
  function sketchInto(ctx, img, dx, dy, dw, dh, thr) {
    const tmp = document.createElement('canvas');
    const s = Math.max(dw / img.width, dh / img.height);
    tmp.width = dw; tmp.height = dh;
    const tx = tmp.getContext('2d');
    tx.drawImage(img, (dw - img.width * s) / 2, (dh - img.height * s) / 2, img.width * s, img.height * s);
    const id = tx.getImageData(0, 0, dw, dh); const d = id.data;
    // luminance + ordered-ish dither threshold for a screenprint feel
    for (let p = 0, i = 0; i < d.length; i += 4, p++) {
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const x = p % dw, y = (p / dw) | 0;
      const bayer = (((x & 3) * 4 + (y & 3)) / 16 - 0.5) * 46;
      const ink = lum + bayer < thr;
      const v = ink ? 18 : 255;
      d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
    }
    tx.putImageData(id, 0, 0);
    ctx.drawImage(tmp, dx, dy, dw, dh);
  }

  function mountainLine(ctx, x, y, w, h) {
    ctx.save();
    ctx.strokeStyle = '#18181a'; ctx.lineWidth = Math.max(2, w / 360);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    const pts = [[0, .82], [.12, .66], [.2, .74], [.32, .4], [.41, .56], [.52, .2], [.63, .52], [.72, .42], [.83, .7], [.92, .58], [1, .74]];
    pts.forEach((p, i) => { const px = x + p[0] * w, py = y + p[1] * h; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
    ctx.stroke();
    ctx.restore();
  }

  function generate() {
    const used = slots.filter(Boolean);
    if (!used.length) return;
    const layout = document.querySelector('[data-layout].active').dataset.layout;
    const thr = +$('ts-contrast').value;
    const W = 1100, H = 1500;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = '#f4f1ea'; x.fillRect(0, 0, W, H);          // paper
    // subtle paper grain
    const pad = 90; const innerW = W - pad * 2;

    // header
    x.fillStyle = '#18181a';
    x.font = "700 30px 'Space Mono', monospace";
    x.textAlign = 'left';
    x.fillText('LOST MOUNTAIN', pad, 110);
    x.font = "400 18px 'Space Mono', monospace";
    x.fillText('TRIP COMPOSITE · ' + new Date().getFullYear(), pad, 142);
    x.textAlign = 'right';
    x.fillText(used.length + ' FRAMES', W - pad, 142);
    x.textAlign = 'left';

    const top = 190, bottomReserve = 250;
    const areaH = H - top - bottomReserve;

    if (layout === 'horizon') {
      // overlapping band collage
      const bandH = areaH / used.length;
      used.forEach((s, i) => sketchInto(x, s.img, pad, top + i * bandH, innerW, bandH - 14, thr));
    } else {
      // stack: large hero + smaller frames
      if (used.length === 1) {
        sketchInto(x, used[0].img, pad, top, innerW, areaH, thr);
      } else {
        const heroH = areaH * 0.55;
        sketchInto(x, used[0].img, pad, top, innerW, heroH - 12, thr);
        const rest = used.slice(1);
        const cols = Math.min(rest.length, 2);
        const rows = Math.ceil(rest.length / cols);
        const gw = (innerW - (cols - 1) * 14) / cols;
        const gh = (areaH - heroH - (rows - 1) * 14) / rows;
        rest.forEach((s, i) => {
          const cc = i % cols, rr = (i / cols) | 0;
          sketchInto(x, s.img, pad + cc * (gw + 14), top + heroH + rr * (gh + 14), gw, gh, thr);
        });
      }
    }

    // footer mountain + caption
    mountainLine(x, pad, H - 230, innerW, 120);
    x.fillStyle = '#18181a';
    x.textAlign = 'center';
    x.font = "700 26px 'Space Grotesk', sans-serif";
    const title = ($('ts-title').value || 'Untitled Expedition').toUpperCase();
    x.fillText(title, W / 2, H - 70);
    x.font = "400 15px 'Space Mono', monospace";
    x.fillStyle = '#55534d';
    x.fillText(($('ts-coords').value || '41.7°N 111.8°W'), W / 2, H - 42);

    resultDataURL = c.toDataURL('image/png');
    showResult(c);
  }

  function showResult(canvas) {
    const r = $('ts-result');
    r.classList.add('done');
    const img = $('ts-out');
    img.src = resultDataURL;
    // engraved preview tint handled by CSS toggle
    $('ts-empty').style.display = 'none';
    $('ts-actions').style.display = 'flex';
  }

  function init() {
    if (!$('ts-grid')) return;
    render();
    $('ts-generate').addEventListener('click', () => {
      const r = $('ts-result'); r.classList.add('processing');
      $('ts-empty').style.display = 'flex';
      $('ts-empty').innerHTML = '<div class="ts-load"><div class="ts-ring"></div><span>COMPOSING YOUR TRIP…</span></div>';
      setTimeout(() => { r.classList.remove('processing'); generate(); }, 1500);
    });
    document.querySelectorAll('[data-layout]').forEach((b) => b.addEventListener('click', () => {
      document.querySelectorAll('[data-layout]').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
    }));
    $('ts-invert') && $('ts-invert').addEventListener('click', () => {
      $('ts-invert').classList.toggle('on');
      $('ts-out').classList.toggle('engraved');
    });
    $('ts-download') && $('ts-download').addEventListener('click', () => {
      if (!resultDataURL) return;
      const a = document.createElement('a'); a.href = resultDataURL; a.download = 'lost-mountain-trip.png'; a.click();
    });
    $('ts-toBottle') && $('ts-toBottle').addEventListener('click', () => {
      if (!resultDataURL) return;
      try { localStorage.setItem('lm_pending_art', resultDataURL); } catch (e) {}
      window.location.href = 'index.html';
    });
  }
  document.addEventListener('DOMContentLoaded', init);
})();
