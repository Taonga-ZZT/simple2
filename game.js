(() => {
  'use strict';

  // ---- Config ----------------------------------------------------------
  const COLS = 24;
  const ROWS = 24;
  const CELL = 20;
  const BASE_MS = 130;     // time per step at the start
  const MIN_MS = 70;       // fastest the snake gets
  const START_LAG = 12;    // how many steps the echo trails behind your tail
  const MIN_LAG = 3;       // closest the echo can get

  // ---- DOM -------------------------------------------------------------
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  canvas.width = COLS * CELL;
  canvas.height = ROWS * CELL;

  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const lagEl = document.getElementById('lag');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayMsg = document.getElementById('overlay-msg');

  // ---- Input maps ------------------------------------------------------
  const DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };

  const KEYS = {
    ArrowUp: 'up', w: 'up', W: 'up',
    ArrowDown: 'down', s: 'down', S: 'down',
    ArrowLeft: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right',
  };

  // ---- State -----------------------------------------------------------
  let snake, dir, queue, food, history, score, lag, stepMs, acc, last;
  let state = 'ready'; // 'ready' | 'playing' | 'paused' | 'over'
  let best = 0;

  try {
    best = Number(localStorage.getItem('echoSnakeBest')) || 0;
  } catch (e) { /* storage unavailable, that's fine */ }

  // ---- Game logic ------------------------------------------------------
  function reset() {
    const cx = Math.floor(COLS / 2);
    const cy = Math.floor(ROWS / 2);
    snake = [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }];
    // history of every cell the head has ever visited, oldest first
    history = [{ x: cx - 2, y: cy }, { x: cx - 1, y: cy }, { x: cx, y: cy }];
    dir = DIRS.right;
    queue = [];
    score = 0;
    lag = START_LAG;
    stepMs = BASE_MS;
    acc = 0;
    food = spawnFood();
    updateHud();
  }

  // The echo replays your path, `lag` steps behind your tail.
  function echoCells() {
    const len = Math.min(8, 4 + Math.floor(score / 5));
    const headIdx = history.length - snake.length - lag;
    const cells = [];
    for (let i = 0; i < len; i++) {
      const idx = headIdx - i;
      if (idx < 0) break;
      cells.push(history[idx]);
    }
    return cells;
  }

  function spawnFood() {
    const taken = new Set();
    snake.forEach(c => taken.add(c.x + ',' + c.y));
    echoCells().forEach(c => taken.add(c.x + ',' + c.y));
    const free = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (!taken.has(x + ',' + y)) free.push({ x, y });
      }
    }
    return free.length ? free[Math.floor(Math.random() * free.length)] : { x: -1, y: -1 };
  }

  function tick() {
    if (queue.length) dir = queue.shift();

    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS) {
      return die('You hit the wall.');
    }

    const ate = head.x === food.x && head.y === food.y;
    snake.unshift(head);
    history.push(head);
    if (!ate) snake.pop();

    for (let i = 1; i < snake.length; i++) {
      if (snake[i].x === head.x && snake[i].y === head.y) {
        return die('You bit your own tail.');
      }
    }

    if (echoCells().some(c => c.x === head.x && c.y === head.y)) {
      return die('Your echo caught you.');
    }

    if (ate) {
      score++;
      if (score % 3 === 0 && lag > MIN_LAG) lag--;
      stepMs = Math.max(MIN_MS, BASE_MS - score * 2);
      food = spawnFood();
      updateHud();
    }
  }

  function die(reason) {
    state = 'over';
    if (score > best) {
      best = score;
      try { localStorage.setItem('echoSnakeBest', String(best)); } catch (e) { /* ignore */ }
    }
    updateHud();
    showOverlay('GAME OVER', reason + ' Score: ' + score + '. Press Space to retry.');
  }

  // ---- UI --------------------------------------------------------------
  function updateHud() {
    scoreEl.textContent = score;
    bestEl.textContent = best;
    lagEl.textContent = lag;
  }

  function showOverlay(title, msg) {
    overlayTitle.textContent = title;
    overlayMsg.textContent = msg;
    overlay.classList.remove('hidden');
  }

  function hideOverlay() {
    overlay.classList.add('hidden');
  }

  function start() {
    if (state === 'over') reset();
    state = 'playing';
    last = 0;
    hideOverlay();
  }

  function togglePause() {
    if (state === 'playing') {
      state = 'paused';
      showOverlay('PAUSED', 'Press Space to resume');
    } else if (state === 'paused') {
      start();
    }
  }

  function action() {
    if (state === 'playing' || state === 'paused') togglePause();
    else start();
  }

  function steer(name) {
    const d = DIRS[name];
    const ref = queue.length ? queue[queue.length - 1] : dir;
    if (d.x === -ref.x && d.y === -ref.y) return; // no U-turns
    if (d.x === ref.x && d.y === ref.y) return;   // already going that way
    if (queue.length < 2) queue.push(d);
  }

  // ---- Controls --------------------------------------------------------
  document.addEventListener('keydown', e => {
    const name = KEYS[e.key];
    if (name) {
      e.preventDefault();
      if (state === 'paused') return;
      if (state === 'ready' || state === 'over') start();
      steer(name);
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      action();
    } else if (e.key === 'p' || e.key === 'P') {
      togglePause();
    }
  });

  let touchStart = null;
  canvas.addEventListener('touchstart', e => {
    const t = e.touches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });

  canvas.addEventListener('touchend', e => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
    if (state === 'paused') return;
    if (state === 'ready' || state === 'over') start();
    if (Math.abs(dx) > Math.abs(dy)) steer(dx > 0 ? 'right' : 'left');
    else steer(dy > 0 ? 'down' : 'up');
  }, { passive: true });

  overlay.addEventListener('click', action);

  // ---- Rendering -------------------------------------------------------
  function cellRect(c, inset) {
    ctx.fillRect(c.x * CELL + inset, c.y * CELL + inset, CELL - inset * 2, CELL - inset * 2);
  }

  function draw(t) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#0b0f14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // faint grid dots
    ctx.fillStyle = '#16212b';
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        ctx.fillRect(x * CELL + CELL / 2 - 1, y * CELL + CELL / 2 - 1, 2, 2);
      }
    }

    // food (pulsing)
    if (food.x >= 0) {
      const pulse = 1 + Math.sin(t / 160) * 1.5;
      ctx.shadowColor = '#ffb84d';
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#ffb84d';
      ctx.beginPath();
      ctx.arc(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, CELL / 2 - 4 + pulse, 0, Math.PI * 2);
      ctx.fill();
    }

    // echo (ghost of your past path)
    const echo = echoCells();
    ctx.shadowColor = '#5ee7ff';
    ctx.shadowBlur = 14;
    echo.forEach((c, i) => {
      ctx.globalAlpha = Math.max(0.25, 0.85 - i * 0.1);
      ctx.fillStyle = '#5ee7ff';
      cellRect(c, i === 0 ? 2 : 4);
    });
    ctx.globalAlpha = 1;

    // snake
    ctx.shadowColor = '#5dff8f';
    ctx.shadowBlur = 8;
    snake.forEach((c, i) => {
      ctx.fillStyle = i === 0 ? '#b6ffcc' : '#5dff8f';
      cellRect(c, i === 0 ? 1 : 2);
    });

    // eyes
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#0b0f14';
    const h = snake[0];
    const ex = h.x * CELL + CELL / 2;
    const ey = h.y * CELL + CELL / 2;
    const px = dir.y !== 0 ? 4 : 0; // perpendicular offsets
    const py = dir.x !== 0 ? 4 : 0;
    ctx.fillRect(ex + dir.x * 3 - px - 1, ey + dir.y * 3 - py - 1, 3, 3);
    ctx.fillRect(ex + dir.x * 3 + px - 1, ey + dir.y * 3 + py - 1, 3, 3);
  }

  // ---- Main loop -------------------------------------------------------
  function frame(t) {
    if (!last) last = t;
    const dt = Math.min(100, t - last);
    last = t;

    if (state === 'playing') {
      acc += dt;
      while (acc >= stepMs && state === 'playing') {
        acc -= stepMs;
        tick();
      }
    }

    draw(t);
    requestAnimationFrame(frame);
  }

  reset();
  showOverlay('ECHO SNAKE', 'Press an arrow key or Space to start');
  requestAnimationFrame(frame);
})();