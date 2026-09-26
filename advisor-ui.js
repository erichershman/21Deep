// Robot toggle: highlights the best column and shows each column's expected final score.
// engine.js (~250 KB) loads on the first click.
(function () {
  'use strict';

  const KEY = '21deep.advisor';
  const robot = document.getElementById('robot');
  const status = document.getElementById('advisor-status');
  if (!robot) return;

  let on = false, engine = null, loading = null, pending = null, timer = 0;

  function load() {
    if (window.Alpha21) return Promise.resolve(window.Alpha21);
    if (!loading) loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'engine.js';
      s.onload = () => resolve(window.Alpha21);
      s.onerror = () => { loading = null; reject(new Error('engine.js failed to load')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  // The userscript marks the page while running and draws its own highlights.
  function userscriptActive() { return document.documentElement.hasAttribute('data-alpha21-userscript'); }

  function clear() {
    document.querySelectorAll('.column').forEach(col => {
      col.classList.remove('advice-best', 'advice-alt');
      const ev = col.querySelector('.col-ev');
      if (ev) ev.remove();
    });
  }

  function show(result) {
    clear();
    if (!result.best) return;
    for (const m of result.moves) {
      const col = document.querySelector(`.column[data-col="${m.column}"]`);
      if (!col) continue;
      col.classList.add(m === result.best ? 'advice-best' : 'advice-alt');
      const ev = document.createElement('div');
      ev.className = 'col-ev';
      ev.textContent = Math.round(m.value);
      ev.title = m.searched ? 'Expected final score (two cards ahead)' : 'Expected final score (no look-ahead; pruned)';
      col.querySelector('.col-header').after(ev);
    }
  }

  function update(snap) {
    if (!on) return;
    if (userscriptActive()) { clear(); status.textContent = 'Userscript is advising'; return; }
    status.textContent = '';
    if (!snap || snap.over || !snap.current) { clear(); return; }
    pending = snap;
    clearTimeout(timer);
    // let the board paint first; the search takes ~0.1–0.3 s
    timer = setTimeout(() => {
      const s = pending; pending = null;
      if (!on || !s) return;
      show(engine.advise(s));
    }, 30);
  }

  function setOn(v) {
    on = v;
    robot.setAttribute('aria-pressed', String(on));
    robot.classList.toggle('on', on);
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
    if (!on) { clearTimeout(timer); clear(); status.textContent = ''; return; }
    status.textContent = 'Loading Alpha21…';
    load().then(A => { engine = A; update(window.TwentyOneDeep && window.TwentyOneDeep.snapshot()); })
      .catch(() => { status.textContent = 'Could not load the advisor.'; setOn(false); });
  }

  robot.addEventListener('click', () => setOn(!on));
  document.addEventListener('21deep:state', e => { if (engine) update(e.detail); });
  new MutationObserver(() => { if (engine) update(window.TwentyOneDeep.snapshot()); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-alpha21-userscript'] });

  let saved = false;
  try { saved = localStorage.getItem(KEY) === '1'; } catch (e) {}
  if (saved) setOn(true);
})();
