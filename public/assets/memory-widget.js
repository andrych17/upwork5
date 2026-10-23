// Stand-in game for the widget slot: flip two cards, keep them if they match.
(() => {
  const root = document.querySelector('[data-memory]');
  if (!root) return;

  const icons = {
    lantern: '<path d="M9 5a3 3 0 0 1 6 0M8 6h8M7.5 8h9v10a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2zM12 11c1.6 1.9 2 3 2 4a2 2 0 0 1-4 0c0-1 .4-2.1 2-4z"/>',
    moon: '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/>',
    leaf: '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14zM5 19l7-7"/>',
    cup: '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10h1.5a2.5 2.5 0 0 1 0 5H16M9 3c0 1.5 1 1.5 1 3M12 3c0 1.5 1 1.5 1 3"/>',
    wave: '<path d="M3 9c3-3 6 3 9 0s6 3 9 0M3 15c3-3 6 3 9 0s6 3 9 0"/>',
    star: '<path d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
  };
  const board = root.querySelector('[data-board]');
  const movesEl = root.querySelector('[data-moves]');
  const pairsEl = root.querySelector('[data-pairs]');
  const winEl = root.querySelector('[data-win]');
  let open = [];
  let moves = 0;
  let pairs = 0;

  function shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  function deal() {
    open = [];
    moves = 0;
    pairs = 0;
    movesEl.textContent = '0';
    pairsEl.textContent = '0';
    winEl.textContent = '';
    board.replaceChildren(...shuffle([...Object.keys(icons), ...Object.keys(icons)]).map((name) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'card';
      card.dataset.name = name;
      card.setAttribute('aria-label', 'Hidden card');
      card.innerHTML = '<span class="face back"></span><span class="face front"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + icons[name] + '</svg></span>';
      return card;
    }));
  }

  board.addEventListener('click', (event) => {
    const card = event.target.closest('.card');
    if (!card || card.classList.contains('open') || open.length === 2) return;
    card.classList.add('open');
    card.setAttribute('aria-label', card.dataset.name);
    open.push(card);
    if (open.length < 2) return;

    moves += 1;
    movesEl.textContent = String(moves);
    const [a, b] = open;
    if (a.dataset.name === b.dataset.name) {
      a.classList.add('done');
      b.classList.add('done');
      open = [];
      pairs += 1;
      pairsEl.textContent = String(pairs);
      if (pairs === 6) winEl.textContent = `All pairs found in ${moves} moves.`;
      return;
    }
    setTimeout(() => {
      for (const c of open) {
        c.classList.remove('open');
        c.setAttribute('aria-label', 'Hidden card');
      }
      open = [];
    }, 800);
  });

  root.querySelector('[data-reset]').addEventListener('click', deal);
  deal();
})();
