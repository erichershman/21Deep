(function () {
  'use strict';

  const SUITS = ['spades', 'hearts', 'clubs', 'diamonds'];
  const CARD_DIR = 'assets/cards';

  function cardPath(card) { return `${CARD_DIR}/${card.value}_${card.suit}.svg`; }
  function isAce(c)    { return c.value === 14; }
  function isTenVal(c) { return c.value >= 10 && c.value <= 13; }

  function columnTotal(cards) {
    let t = 0;
    for (const c of cards) t += isAce(c) ? 1 : Math.min(c.value, 10);
    return t;
  }

  function canMake21(cards) {
    const min = columnTotal(cards);
    const aces = cards.reduce((a, c) => a + (isAce(c) ? 1 : 0), 0);
    const d = 21 - min;
    return d >= 0 && d % 10 === 0 && d / 10 <= aces;
  }
  function isBust(cards) { return columnTotal(cards) > 21; }

  function classifyColumn(cards) {
    const total = columnTotal(cards);
    const n = cards.length;
    if (total > 21) return { clears: false, points: 0, special: 'bust' };

    if (canMake21(cards)) {
      const hasAce = cards.some(isAce);
      const hasTen = cards.some(isTenVal);
      if (n === 2 && hasAce && hasTen)
        return { clears: true, points: 21, special: 'Blackjack' };
      if (n === 3) {
        const vals = cards.map(c => c.value).sort((a, b) => a - b);
        if (vals[0] === 7 && vals[1] === 7 && vals[2] === 7)
          return { clears: true, points: 15, special: '7-7-7' };
        if (vals[0] === 6 && vals[1] === 7 && vals[2] === 8)
          return { clears: true, points: 15, special: '6-7-8' };
      }
      if (n >= 4) return { clears: true, points: 15, special: 'Large 21' };
      return { clears: true, points: 10, special: '21' };
    }

    if (n === 5 && total <= 20)
      return { clears: true, points: 5, special: '5 under 21' };

    return { clears: false, points: 0, special: null };
  }

  const FH_RECIPES = [
    { name: '6-6-3-3-3', counts: { 3: 3, 6: 2 } },
    { name: '5-5-5-3-3', counts: { 5: 3, 3: 2 } },
    { name: '9-9-A-A-A', counts: { 14: 3, 9: 2 } },
  ];
  function rankCounts(cards) {
    const m = {};
    for (const c of cards) m[c.value] = (m[c.value] || 0) + 1;
    return m;
  }
  function isFullHouse(cards) {
    if (cards.length !== 5) return false;
    const counts = rankCounts(cards);
    return FH_RECIPES.some(rec => {
      const rk = Object.keys(rec.counts);
      return rk.length === Object.keys(counts).length
          && rk.every(r => counts[r] === rec.counts[r]);
    });
  }

  // A column holding an Ace counts as either total ("7 or 17") for board clears.
  function colOptions(col) {
    const h = columnTotal(col);
    return (col.some(isAce) && h + 10 <= 21) ? [h, h + 10] : [h];
  }
  function boardClearKind(columns) {
    if (!columns.every(c => c.length > 0)) return null;
    const opts = columns.map(colOptions);
    const used = [false, false, false, false, false];
    const tryCol = i => {
      if (i === 5) return true;
      for (const v of opts[i]) {
        const k = v - 16;
        if (k >= 0 && k <= 4 && !used[k]) { used[k] = true; if (tryCol(i + 1)) return true; used[k] = false; }
      }
      return false;
    };
    if (tryCol(0)) return 'Straight';
    for (let x = 16; x <= 20; x++) if (opts.every(o => o.includes(x))) return '5 of a Kind';
    return null;
  }

  function isSuperBJ(cards) {
    return cards.length === 2
        && cards.some(c => c.value === 11 && c.suit === 'spades')
        && cards.some(c => c.value === 14 && c.suit === 'spades');
  }

  // ---- Game state ----
  const state = {
    drawPile: [],
    discards: [],
    current: null,
    columns: [[], [], [], [], []],
    score: 0,
    reshuffles: 0,
    lastBJ: false,
    over: false,
    message: null,        // { title, detail }
  };

  function buildDeck() {
    const d = [];
    for (const s of SUITS) for (let v = 2; v <= 14; v++) d.push({ value: v, suit: s });
    return d;
  }
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function refillIfEmpty() {
    if (state.drawPile.length > 0) return true;
    if (state.discards.length === 0) return false;
    state.drawPile = shuffle(state.discards);
    state.discards = [];
    state.score += 10;
    state.reshuffles += 1;
    if (state.message) state.message.detail += ' · deck reshuffled, +10';
    else state.message = { title: 'Deck reshuffled', detail: 'Scored 10 points' };
    return true;
  }

  function deal() {
    if (!refillIfEmpty()) { endGame('Out of cards'); return; }
    state.current = state.drawPile.pop();
  }

  function anyLegal() {
    if (!state.current) return false;
    for (let i = 0; i < 5; i++) {
      if (!isBust(state.columns[i].concat(state.current))) return true;
    }
    return false;
  }

  function place(col) {
    if (state.over || !state.current) return;
    if (col < 0 || col > 4) return;
    const next = state.columns[col].concat(state.current);
    if (isBust(next)) { state.message = { title: '', detail: 'That column would bust' }; render(); return; }
    state.message = null;
    state.columns[col] = next;
    state.current = null;

    const res = classifyColumn(next);
    let clearedCards = null;

    // A "5 under 21" that completes a Straight / 5 of a Kind pays the board clear instead.
    const boardFirst = res.clears && res.special === '5 under 21' && boardClearKind(state.columns);

    if (res.clears && !boardFirst && isFullHouse(next)) {
      state.score += 200;
      clearedCards = next;
      state.message = { title: 'Full House', detail: 'Scored 200 points' };
      state.lastBJ = false;
    } else if (res.clears && !boardFirst) {
      const isBJ = res.special === 'Blackjack';
      const queen = isBJ && next.some(c => c.value === 12);
      let awarded = res.points, name = res.special;
      if (isBJ && isSuperBJ(next)) { awarded = 50; name = 'Super Blackjack'; }
      else if (isBJ && state.lastBJ && queen) { awarded = 50; name = 'Double Blackjack'; }
      state.score += awarded;
      clearedCards = next;
      state.message = { title: name, detail: `Scored ${awarded} points` };
      state.lastBJ = queen;
    } else {
      state.lastBJ = false;
    }

    if (clearedCards) {
      state.discards.push(...clearedCards);
      state.columns[col] = [];
    }

    const bk = boardClearKind(state.columns);
    if (bk) {
      state.score += 100;
      state.message = { title: bk, detail: 'Scored 100 points · board cleared' };
      for (let i = 0; i < 5; i++) {
        state.discards.push(...state.columns[i]);
        state.columns[i] = [];
      }
      state.lastBJ = false;
    }

    deal();
    if (!anyLegal()) endGame('No legal moves');
    render();
  }

  function endGame(reason) {
    state.over = true;
    state.message = { title: 'Game over', detail: `${reason} · final score ${state.score}` };
    render();
  }

  function newGame() {
    state.drawPile = shuffle(buildDeck());
    state.discards = [];
    state.columns = [[], [], [], [], []];
    state.score = 0;
    state.reshuffles = 0;
    state.lastBJ = false;
    state.over = false;
    state.message = null;
    state.current = null;
    deal();
    render();
  }

  function render() {
    const root = document.getElementById('game');
    if (!root) return;

    const cur = document.getElementById('current-card');
    if (state.current) {
      cur.src = cardPath(state.current);
      cur.alt = cardAlt(state.current);
      cur.style.visibility = 'visible';
    } else {
      cur.removeAttribute('src');
      cur.alt = '';
      cur.style.visibility = 'hidden';
    }


    for (let i = 0; i < 5; i++) {
      const col = document.getElementById('col-' + i);
      col.innerHTML = state.columns[i]
        .map(c => `<img class="card" src="${cardPath(c)}" alt="${cardAlt(c)}">`)
        .join('');
      const sum = document.getElementById('sum-' + i);
      const opts = colOptions(state.columns[i]);   // an Ace that can still be 11 shows both totals
      sum.innerHTML = opts.length === 2
        ? `${opts[0]}<span class="sum-or">or</span>${opts[1]}`
        : String(opts[0]);

      const header = document.querySelector(`.col-header[data-col="${i}"]`);
      if (header) {
        const legal = state.current && !isBust(state.columns[i].concat(state.current)) && !state.over;
        header.disabled = !legal;
      }
    }

    document.getElementById('score').textContent = state.score;
    document.getElementById('draw-count').textContent = state.drawPile.length;

    const msg = document.getElementById('message');
    const m = state.message;
    msg.replaceChildren();
    msg.classList.toggle('over', state.over);
    if (m) {
      if (m.title) msg.append(Object.assign(document.createElement('div'), { className: 'msg-title', textContent: m.title }));
      msg.append(Object.assign(document.createElement('div'), { className: 'msg-detail', textContent: m.detail }));
      msg.classList.remove('pop'); void msg.offsetWidth; msg.classList.add('pop');   // replay the fade-in
    }
    const ng = document.getElementById('new-game');
    if (ng) ng.classList.toggle('attention', state.over);

    publish();
  }

  // Read-only state for the advisor. The draw pile is sorted: its contents show, never its order.
  function snapshot() {
    const copy = c => ({ value: c.value, suit: c.suit });
    const byId = (a, b) => a.value - b.value || a.suit.localeCompare(b.suit);
    return {
      columns: state.columns.map(col => col.map(copy)),
      current: state.current ? copy(state.current) : null,
      score: state.score,
      remaining: state.drawPile.map(copy).sort(byId),
      discards: state.discards.map(copy).sort(byId),
      lastBJ: state.lastBJ,
      reshuffles: state.reshuffles,
      over: state.over,
    };
  }
  function publish() {
    document.dispatchEvent(new CustomEvent('21deep:state', { detail: snapshot() }));
  }
  window.TwentyOneDeep = { snapshot };

  function cardAlt(c) {
    const rank = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[c.value] || String(c.value);
    return rank + ' of ' + c.suit;
  }

  function bind() {
    document.querySelectorAll('.col-header').forEach(btn => {
      btn.addEventListener('click', () => {
        const col = parseInt(btn.getAttribute('data-col'), 10);
        place(col);
      });
    });
    const ng = document.getElementById('new-game');
    if (ng) ng.addEventListener('click', () => {
      if (!state.over && state.score > 0 && !confirm('Abandon this game and start a new one?')) return;
      newGame();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { bind(); newGame(); });
  } else {
    bind(); newGame();
  }
})();

