/*
 * Alpha21: the 21Deep advisor engine. A value network judges positions; a two-card
 * expectimax look-ahead picks the move. No DOM, no network access.
 *
 *   Alpha21.advise({ columns, current, score, remaining, discards, lastBJ, reshuffles })
 *     → { best, moves: [{ column, value, clears, searched }] }
 *   card = { value: 2..14 (11 J, 12 Q, 13 K, 14 A), suit } · value = expected final score
 *
 * Generated: edit tools/engine.template.js, then run `node tools/extract-engine.js`.
 */
(function (root) {
  'use strict';

  const SUITS = ['spades', 'hearts', 'clubs', 'diamonds'];

  function card(c) { return { value: c.value, suit: c.suit, id: c.value + '_' + c.suit }; }
  function isAce(c) { return c.value === 14; }
  function isTenValue(c) { return c.value >= 10 && c.value <= 13; }

  // Aces count 1; a column clears if promoting Aces (+10 each) reaches 21.
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
    const total = columnTotal(cards), n = cards.length;
    if (total > 21) return { clears: false, points: 0, special: 'bust' };
    if (canMake21(cards)) {
      if (n === 2 && cards.some(isAce) && cards.some(isTenValue)) return { clears: true, points: 21, special: 'Blackjack' };
      if (n === 3) {
        const v = cards.map(c => c.value).sort((a, b) => a - b);
        if (v[0] === 7 && v[1] === 7 && v[2] === 7) return { clears: true, points: 15, special: '7-7-7' };
        if (v[0] === 6 && v[1] === 7 && v[2] === 8) return { clears: true, points: 15, special: '6-7-8' };
      }
      if (n >= 4) return { clears: true, points: 15, special: 'Large 21' };
      return { clears: true, points: 10, special: '21' };
    }
    if (n === 5 && total <= 20) return { clears: true, points: 5, special: '5 under 21' };
    return { clears: false, points: 0, special: null };
  }

  const FULL_HOUSE_VALUE = 200;
  const FH_ALL = [{ 3: 3, 6: 2 }, { 5: 3, 3: 2 }, { 14: 3, 9: 2 }];
  function rankCounts(cards) { const m = {}; for (const c of cards) m[c.value] = (m[c.value] || 0) + 1; return m; }
  function isFullHouse(cards) {
    if (cards.length !== 5) return false;
    const m = rankCounts(cards), km = Object.keys(m);
    return FH_ALL.some(r => { const kr = Object.keys(r); return kr.length === km.length && kr.every(k => m[k] === r[k]); });
  }

  // Rules the network was trained on: Queen-only Double Blackjack on consecutive cards,
  // Ace-flexible totals for board clears, and a board clear outranks "5 under 21".
  const RULES = { dbjTens: 'queen', dbjChain: 'placement', boardSums: 'either', bcFirst: true };

  function colOptions(col) {
    const h = columnTotal(col);
    return (col.some(isAce) && h + 10 <= 21) ? [h, h + 10] : [h];
  }
  // 'Straight' (totals 16,17,18,19,20 in any order), '5 of a Kind' (all equal, >= 16), or null.
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
    for (let X = 16; X <= 20; X++) if (opts.every(o => o.includes(X))) return '5 of a Kind';
    return null;
  }

  function isSuperBJCards(cards) { return cards.length === 2 && cards.some(c => c.id === '11_spades') && cards.some(c => c.id === '14_spades'); }
  function bjQualifies(cards) { return cards.some(c => c.value === 12); }

  // Points, cleared columns and Blackjack-chain flag for a card already placed in board[ci].
  function resolveR(board, ci, lastBJ) {
    const col = board[ci], res = classifyColumn(col);
    if (res.clears && res.special === '5 under 21' && RULES.bcFirst && boardClearKind(board)) return { pts: 100, cc: [0, 1, 2, 3, 4], bj: false };
    if (res.clears) {
      let pts = res.points, bj = false;
      if (isFullHouse(col)) pts = FULL_HOUSE_VALUE;
      else if (res.special === 'Blackjack') { bj = bjQualifies(col); pts = isSuperBJCards(col) ? 50 : ((lastBJ && bj) ? 50 : 21); }
      return { pts, cc: [ci], bj };
    }
    if (boardClearKind(board)) return { pts: 100, cc: [0, 1, 2, 3, 4], bj: false };
    return { pts: 0, cc: [], bj: false };
  }
  function nextLastBJR(lastBJ, r) { return !!r.bj; }

  // ---- neural network: position encoder, inference, weights (generated) ----
/*__NEURAL__*/

  // Search: two cards ahead, averaged over the ranks left in the deck, expanding the best K moves.
  const DEPTH = 2, K = 2;
  const nnEnc = new Uint8Array(NN.ENC_LEN);
  function nnValue(cols, score, cnt, disc, rem, lastBJ, sJ, sA, resh) {
    NN.encodeState(cols.map(c => c.map(x => x.value)), cnt, disc, rem, score, lastBJ, sJ, sA, resh, nnEnc);
    return score + 1000 * NN.judge.eval(nnEnc)[1];
  }
  function nnMoves(st, c, depth, k = 5) {
    if (depth >= 1 && k < 5) {
      const base = nnMoves(st, c, depth - 1, k);
      if (base.length <= k) return nnExpand(st, c, depth, null, k);
      base.sort((a, b) => b.v - a.v);
      return nnExpand(st, c, depth, base.slice(0, k).map(m => m.i), k);
    }
    return nnExpand(st, c, depth, null, k);
  }
  function nnExpand(st, c, depth, only, k) {
    const out = [];
    for (let i = 0; i < 5; i++) {
      if (only && !only.includes(i)) continue;
      if (isBust(st.board[i].concat(c))) continue;
      const nb = st.board.map(col => col.slice()); nb[i] = nb[i].concat(c);
      const r = resolveR(nb, i, st.lastBJ), disc = st.disc.slice();
      for (const ci of r.cc) { for (const x of nb[ci]) disc[x.value]++; nb[ci] = []; }
      const sc = st.score + r.pts, lbj = nextLastBJR(st.lastBJ, r);
      let v;
      if (depth === 0) v = nnValue(nb, sc, st.cnt, disc, st.rem, lbj, st.sJ, st.sA, st.resh);
      else {
        let tot = 0, w = 0;
        for (let rk = 2; rk <= 14; rk++) {
          const n = st.cnt[rk]; if (!n) continue;
          const cnt2 = st.cnt.slice(); cnt2[rk]--;
          const kids = nnMoves({ board: nb, score: sc, cnt: cnt2, disc, rem: st.rem - 1, lastBJ: lbj, sJ: st.sJ, sA: st.sA, resh: st.resh },
            { value: rk, suit: 'x', id: rk + '_x' }, depth - 1, k);
          tot += n * (kids.length ? Math.max(...kids.map(m => m.v)) : sc);   // no legal move: the game ends at sc
          w += n;
        }
        v = w ? tot / w : nnValue(nb, sc, st.cnt, disc, st.rem, lbj, st.sJ, st.sA, st.resh);
      }
      out.push({ i, v, clears: r.cc.length > 0 });
    }
    return out;
  }

  function advise(pos) {
    if (!pos || !pos.current) return { best: null, moves: [], note: 'No current card.' };
    const cur = card(pos.current);
    const columns = pos.columns.map(col => col.map(card));
    const remaining = (pos.remaining || []).map(card);
    const cnt = new Array(15).fill(0); for (const c of remaining) cnt[c.value]++;
    const disc = new Array(15).fill(0); for (const c of pos.discards || []) disc[c.value]++;
    const st = {
      board: columns, score: pos.score || 0, cnt, disc, rem: remaining.length, lastBJ: !!pos.lastBJ,
      sJ: remaining.some(c => c.id === '11_spades'), sA: remaining.some(c => c.id === '14_spades'), resh: pos.reshuffles || 0,
    };
    const searched = nnMoves(st, cur, DEPTH, K).sort((a, b) => b.v - a.v);
    if (!searched.length) return { best: null, moves: [], note: 'No legal move.' };
    // pruned moves, ranked without look-ahead
    const rest = nnMoves(st, cur, 0).filter(m => !searched.some(x => x.i === m.i)).sort((a, b) => b.v - a.v);
    const moves = searched.map(m => ({ column: m.i, value: m.v, clears: m.clears, searched: true }))
      .concat(rest.map(m => ({ column: m.i, value: m.v, clears: m.clears, searched: false })));
    return { best: moves[0], moves, note: '' };
  }

  const api = { version: '1.0.0', advise, rules: { columnTotal, classifyColumn, isFullHouse, boardClearKind, isSuperBJCards }, SUITS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Alpha21 = api;
})(typeof window !== 'undefined' ? window : globalThis);
