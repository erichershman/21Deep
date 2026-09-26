// ==UserScript==
// @name         21Deep Advisor (Alpha21)
// @namespace    https://github.com/erichershman/21deep
// @version      1.0.0
// @description  Reads the 21Deep board, tracks the deck, and highlights the best column using the Alpha21 value network.
// @author       Eric Hershman
// @match        https://*.github.io/*
// @match        http://localhost/*
// @match        http://localhost:*/*
// @match        http://127.0.0.1:*/*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

/*
 * Alpha21 run from outside the page: reads the board, tracks the deck, draws an overlay. Never clicks.
 * Generated: edit tools/userscript.template.js, then run `node tools/build-userscript.js`.
 */

/*__ENGINE__*/

(function () {
  'use strict';

  // Only run on a 21Deep page.
  const $ = sel => document.querySelector(sel);
  if (!$('#game #columns') || !$('#current-card') || !$('#draw-count')) return;
  const A = window.Alpha21;
  if (!A) return;
  document.documentElement.setAttribute('data-alpha21-userscript', '');

  const SUITS = ['spades', 'hearts', 'clubs', 'diamonds'];
  const FULL_52 = [];
  for (const s of SUITS) for (let v = 2; v <= 14; v++) FULL_52.push({ value: v, suit: s, id: v + '_' + s });
  const SYM = { spades: '♠', hearts: '♥', clubs: '♣', diamonds: '♦' };
  const RANK = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  const label = c => (RANK[c.value] || c.value) + SYM[c.suit];

  // ---- read the board from the DOM ----
  const CARD_RE = /\/(\d+)_([a-z]+)\.svg/i;
  function parseCard(img) {
    const m = img && img.getAttribute('src') && CARD_RE.exec(img.getAttribute('src'));
    if (!m || (img.style && img.style.visibility === 'hidden')) return null;
    const value = +m[1], suit = m[2].toLowerCase();
    return { value, suit, id: value + '_' + suit };
  }
  function readBoard() {
    const num = id => { const n = parseInt(($(id) || {}).textContent, 10); return isNaN(n) ? null : n; };
    return {
      current: parseCard($('#current-card')),
      columns: [0, 1, 2, 3, 4].map(i => [...document.querySelectorAll(`#col-${i} img`)].map(parseCard).filter(Boolean)),
      score: num('#score') || 0,
      draw: num('#draw-count'),
    };
  }

  // ---- deck tracker: what has been seen since the last reshuffle ----
  const Tracker = {
    seen: new Set(), reshuffles: 0, lastBJ: false, prev: null,
    visibleIds(b) { return [...(b.current ? [b.current.id] : []), ...b.columns.flat().map(c => c.id)]; },
    reset(b) { this.seen = new Set(this.visibleIds(b)); this.reshuffles = 0; this.lastBJ = false; },
    observe(b) {
      const p = this.prev;
      const fresh = b.score === 0 && b.draw === 51 && b.columns.every(c => !c.length);
      if (!p || (fresh && !(p.score === 0 && p.draw === 51))) this.reset(b);
      else if (b.draw != null && p.draw != null && b.draw > p.draw) {
        // draw pile grew: the discards were reshuffled in
        this.seen = new Set(this.visibleIds(b)); this.reshuffles++;
      }
      if (p && p.current && (!b.current || b.current.id !== p.current.id)) this.inferChain(p, b);
      for (const id of this.visibleIds(b)) this.seen.add(id);
      this.prev = b;
    },
    // was the last placement an Ace + Queen Blackjack? (for Double Blackjack)
    inferChain(p, b) {
      const placed = p.current;
      if (b.columns.some(col => col.some(c => c.id === placed.id))) { this.lastBJ = false; return; }
      const emptied = [0, 1, 2, 3, 4].filter(i => p.columns[i].length && !b.columns[i].length);
      if (emptied.length !== 1) { this.lastBJ = false; return; }
      const cards = p.columns[emptied[0]].concat(placed);
      const res = A.rules.classifyColumn(cards);
      this.lastBJ = res.special === 'Blackjack' && cards.some(c => c.value === 12);
    },
    position(b) {
      const onBoard = new Set(this.visibleIds(b));
      return {
        columns: b.columns, current: b.current, score: b.score,
        remaining: FULL_52.filter(c => !this.seen.has(c.id)),
        discards: FULL_52.filter(c => this.seen.has(c.id) && !onBoard.has(c.id)),
        lastBJ: this.lastBJ, reshuffles: this.reshuffles,
      };
    },
  };

  // ---- overlay (Shadow DOM) ----
  const host = document.createElement('div');
  host.style.cssText = 'all:initial;position:fixed;inset:0 auto auto 0;width:0;height:0;z-index:2147483647;';
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      .glow { position: fixed; pointer-events: none; border-radius: 12px; box-sizing: border-box; opacity: 0; transition: opacity .12s; }
      .glow.on { opacity: 1; border: 2px solid #22d3ee; box-shadow: 0 0 20px rgba(34,211,238,.5), inset 0 0 12px rgba(124,108,255,.25); }
      .panel { position: fixed; top: 14px; right: 14px; width: 240px; font: 12px/1.45 ui-monospace, 'Cascadia Code', Consolas, monospace;
               color: #e8eaf1; background: rgba(15,17,23,.94); border: 1px solid rgba(124,108,255,.35); border-radius: 12px;
               box-shadow: 0 12px 34px rgba(0,0,0,.45); overflow: hidden; }
      header { display: flex; align-items: center; justify-content: space-between; padding: 7px 10px; cursor: move; user-select: none;
               background: linear-gradient(90deg, rgba(124,108,255,.22), rgba(34,211,238,.12)); border-bottom: 1px solid rgba(255,255,255,.08); }
      header b { font: 650 11px system-ui, sans-serif; letter-spacing: .08em; text-transform: uppercase; }
      header button { all: unset; cursor: pointer; color: #8b93a7; padding: 0 4px; font-size: 14px; }
      .body { padding: 8px 10px; }
      .rec { font-size: 13px; font-weight: 700; }
      .rec .c { color: #22d3ee; }
      .muted { color: #8b93a7; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1px 10px; margin-top: 6px; }
      .grid b { color: #e8eaf1; font-weight: 600; }
      .collapsed .body { display: none; }
    </style>
    <div class="glow"></div><div class="glow"></div><div class="glow"></div><div class="glow"></div><div class="glow"></div>
    <div class="panel">
      <header><b>21Deep Advisor · userscript</b><button data-act="collapse" title="Collapse">–</button></header>
      <div class="body">
        <div class="rec" data-f="rec">Waiting for a card…</div>
        <div class="muted" data-f="why"></div>
        <div class="grid" data-f="deck"></div>
      </div>
    </div>`;
  const glows = [...root.querySelectorAll('.glow')];
  const panel = root.querySelector('.panel');
  const f = k => root.querySelector(`[data-f="${k}"]`);
  root.querySelector('[data-act="collapse"]').addEventListener('click', () => panel.classList.toggle('collapsed'));
  (function drag(handle) {
    let sx, sy, ox, oy, on = false;
    handle.addEventListener('mousedown', e => { on = true; sx = e.clientX; sy = e.clientY; const r = panel.getBoundingClientRect(); ox = r.left; oy = r.top; panel.style.right = 'auto'; e.preventDefault(); });
    window.addEventListener('mousemove', e => { if (on) { panel.style.left = ox + e.clientX - sx + 'px'; panel.style.top = oy + e.clientY - sy + 'px'; } });
    window.addEventListener('mouseup', () => { on = false; });
  })(root.querySelector('header'));

  let bestCol = -1;
  function place() {
    glows.forEach((g, i) => {
      const col = $(`.column[data-col="${i}"]`);
      if (!col) return;
      const r = col.getBoundingClientRect();
      Object.assign(g.style, { top: r.top - 4 + 'px', left: r.left - 4 + 'px', width: r.width + 8 + 'px', height: r.height + 8 + 'px' });
      g.classList.toggle('on', i === bestCol);
    });
  }
  window.addEventListener('resize', place, { passive: true });
  window.addEventListener('scroll', place, { passive: true });

  // ---- main loop ----
  let lastSig = '';
  function tick() {
    const b = readBoard();
    const sig = JSON.stringify([b.current && b.current.id, b.columns.map(c => c.map(x => x.id)), b.score, b.draw]);
    if (sig === lastSig) { place(); return; }
    lastSig = sig;
    Tracker.observe(b);
    const pos = Tracker.position(b);
    const tens = pos.remaining.filter(c => c.value >= 10 && c.value <= 13).length;
    const aces = pos.remaining.filter(c => c.value === 14).length;
    const miss = b.draw != null ? pos.remaining.length - b.draw : 0;
    f('deck').innerHTML =
      `<span>left <b>${pos.remaining.length}</b></span><span>seen <b>${Tracker.seen.size}</b></span>` +
      `<span>tens <b>${tens}</b></span><span>aces <b>${aces}</b></span>` +
      `<span>reshuffles <b>${Tracker.reshuffles}</b></span><span>chain <b>${Tracker.lastBJ ? 'live' : 'off'}</b></span>` +
      (miss ? `<span style="grid-column:1/-1;color:#fbbf24">tracker off by ${miss} (loaded mid-game?)</span>` : '');
    if (!b.current) { bestCol = -1; f('rec').textContent = 'Waiting for a card…'; f('why').textContent = ''; place(); return; }
    const r = A.advise(pos);
    if (!r.best) { bestCol = -1; f('rec').textContent = 'No legal move'; f('why').textContent = ''; place(); return; }
    bestCol = r.best.column;
    f('rec').innerHTML = `Play ${label(b.current)} → column <span class="c">${bestCol + 1}</span>`;
    f('why').textContent = `expected final ≈ ${Math.round(r.best.value)}` +
      (r.moves[1] ? ` · next: col ${r.moves[1].column + 1} ≈ ${Math.round(r.moves[1].value)}` : '');
    place();
  }

  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; tick(); });
  }).observe($('#game'), { subtree: true, childList: true, attributes: true, characterData: true, attributeFilter: ['src', 'style'] });
  tick();
  console.log('[21Deep Advisor] userscript running · Alpha21 v' + A.version);
})();
