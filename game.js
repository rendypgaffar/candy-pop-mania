
"use strict";

// CANDY POP MANIA - STABLE GAME ENGINE

const board = document.getElementById("board");
const scoreDisplay = document.getElementById("score");
const bestDisplay = document.getElementById("best");
const timerDisplay = document.getElementById("timer");
const startButton = document.getElementById("start");
const soundToggle = document.getElementById("soundToggle");
const message = document.getElementById("message");

const SIZE = 8;
const TOTAL = SIZE * SIZE;
const COLORS = ["🍬", "🍭", "🍫", "🍒", "🍋", "🍇"];

let cells = [];
let score = 0;
let bestScore = 0;
let timeLeft = 60;
let selected = null;
let playing = false;
let busy = false;
let clock = null;
let soundOn = true;
let audioContext = null;
let pointerStart = null;
let suppressClick = false;

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

try {
  bestScore = Number(localStorage.getItem("candyPopManiaBest") || 0);
} catch (e) {}

bestDisplay.textContent = bestScore;

// SOUND
function playSound(kind = "match") {
  if (!soundOn) return;

  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;

    if (!audioContext) audioContext = new Audio();
    if (audioContext.state === "suspended") audioContext.resume();

    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.connect(gain);
    gain.connect(audioContext.destination);

    const settings = {
      match: [500, 950, 0.15],
      bomb: [180, 45, 0.30],
      lightning: [750, 1600, 0.25]
    };

    const [start, end, duration] = settings[kind] || settings.match;

    osc.type = kind === "bomb" ? "sawtooth" : "sine";
    osc.frequency.setValueAtTime(start, now);
    osc.frequency.exponentialRampToValueAtTime(end, now + duration);

    gain.gain.setValueAtTime(0.10, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.start(now);
    osc.stop(now + duration);
  } catch (e) {}
}

soundToggle.addEventListener("click", () => {
  soundOn = !soundOn;
  soundToggle.textContent = soundOn ? "🔊 SOUND ON" : "🔇 SOUND OFF";
  if (soundOn) playSound();
});

// CANDIES
function randomCandy() {
  return {
    type: "normal",
    color: COLORS[Math.floor(Math.random() * COLORS.length)]
  };
}

function createBoard() {
  cells = Array.from({ length: TOTAL }, randomCandy);

  // Remove starting matches.
  let attempts = 0;

  while (findMatches().size && attempts < 200) {
    findMatches().forEach(i => {
      cells[i] = randomCandy();
    });
    attempts++;
  }

  renderBoard();
}

function renderBoard() {
  board.innerHTML = "";

  cells.forEach((candy, index) => {
    const tile = document.createElement("div");
    tile.className = "cell";
    tile.dataset.index = index;

    if (!candy) {
      tile.textContent = "";
    } else if (candy.type === "bomb") {
      tile.textContent = "💣";
      tile.classList.add("bomb");
    } else if (candy.type === "lightning") {
      tile.textContent = "⚡";
      tile.classList.add("lightning");
    } else {
      tile.textContent = candy.color;
    }

    if (selected === index) tile.classList.add("selected");

    board.appendChild(tile);
  });
}

// FIND MATCHES
function findRuns() {
  const runs = [];

  // Horizontal runs
  for (let row = 0; row < SIZE; row++) {
    let col = 0;

    while (col < SIZE) {
      const candy = cells[row * SIZE + col];

      if (!candy || candy.type !== "normal") {
        col++;
        continue;
      }

      let end = col + 1;

      while (end < SIZE) {
        const next = cells[row * SIZE + end];

        if (!next || next.type !== "normal" ||
            next.color !== candy.color) break;

        end++;
      }

      if (end - col >= 3) {
        const run = [];

        for (let c = col; c < end; c++) {
          run.push(row * SIZE + c);
        }

        runs.push(run);
      }

      col = end;
    }
  }

  // Vertical runs
  for (let col = 0; col < SIZE; col++) {
    let row = 0;

    while (row < SIZE) {
      const candy = cells[row * SIZE + col];

      if (!candy || candy.type !== "normal") {
        row++;
        continue;
      }

      let end = row + 1;

      while (end < SIZE) {
        const next = cells[end * SIZE + col];

        if (!next || next.type !== "normal" ||
            next.color !== candy.color) break;

        end++;
      }

      if (end - row >= 3) {
        const run = [];

        for (let r = row; r < end; r++) {
          run.push(r * SIZE + col);
        }

        runs.push(run);
      }

      row = end;
    }
  }

  return runs;
}

function findMatches() {
  const result = new Set();

  findRuns().forEach(run => {
    run.forEach(index => result.add(index));
  });

  return result;
}

// NEIGHBOURS
function areNeighbours(a, b) {
  const sameRow = Math.floor(a / SIZE) === Math.floor(b / SIZE);

  return (
    (sameRow && Math.abs(a - b) === 1) ||
    Math.abs(a - b) === SIZE
  );
}

// PLAYER INPUT
function selectCandy(index) {
  if (!playing || busy) return;

  const candy = cells[index];
  if (!candy) return;

  // Tapping a bomb activates it.
  if (candy.type === "bomb") {
    selected = null;
    activateSpecial(index, "bomb");
    return;
  }

  if (selected === null) {
    selected = index;
    renderBoard();
    return;
  }

  const first = selected;
  selected = null;

  if (first === index) {
    renderBoard();
    return;
  }

  if (!areNeighbours(first, index)) {
    selected = index;
    renderBoard();
    return;
  }

  swapCandies(first, index);
}

function swapCandies(a, b) {
  if (!playing || busy) return;

  const first = cells[a];
  const second = cells[b];

  if (!first || !second) return;

  // Lightning clears the colour of the candy it touches.
  if (first.type === "lightning" || second.type === "lightning") {
    const specialIndex = first.type === "lightning" ? a : b;
    const target = first.type === "lightning" ? second : first;

    activateSpecial(specialIndex, "lightning",
      target.type === "normal" ? target.color : null);
    return;
  }

  // Bomb swap activates the bomb.
  if (first.type === "bomb" || second.type === "bomb") {
    const bombIndex = first.type === "bomb" ? a : b;
    activateSpecial(bombIndex, "bomb");
    return;
  }

  cells[a] = second;
  cells[b] = first;

  if (findMatches().size === 0) {
    cells[a] = first;
    cells[b] = second;
    renderBoard();
    return;
  }

  selected = null;
  busy = true;
  playSound();
  renderBoard();

  runResolution(b);
}

// SPECIAL CANDIES
function activateSpecial(index, kind, color = null) {
  if (!playing || busy) return;

  busy = true;
  selected = null;

  const clear = new Set();

  if (kind === "bomb") {
    const row = Math.floor(index / SIZE);
    const col = index % SIZE;

    for (let r = row - 1; r <= row + 1; r++) {
      for (let c = col - 1; c <= col + 1; c++) {
        if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) {
          clear.add(r * SIZE + c);
        }
      }
    }

    message.textContent = "💣 BOOM! 3 × 3 BLAST!";
    playSound("bomb");
  } else {
    cells.forEach((candy, i) => {
      if (color === null ||
          (candy && candy.type === "normal" && candy.color === color)) {
        clear.add(i);
      }
    });

    clear.add(index);
    message.textContent = "⚡ LIGHTNING BLAST!";
    playSound("lightning");
  }

  renderBoard();
  runResolution(-1, clear);
}

// SPECIAL CHAIN REACTIONS
function expandBlast(clear) {
  const queue = [...clear];

  while (queue.length) {
    const index = queue.pop();
    const candy = cells[index];

    if (!candy) continue;

    if (candy.type === "bomb") {
      const row = Math.floor(index / SIZE);
      const col = index % SIZE;

      for (let r = row - 1; r <= row + 1; r++) {
        for (let c = col - 1; c <= col + 1; c++) {
          if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) {
            const next = r * SIZE + c;

            if (!clear.has(next)) {
              clear.add(next);
              queue.push(next);
            }
          }
        }
      }
    }

    if (candy.type === "lightning") {
      cells.forEach((other, i) => {
        if (other && !clear.has(i)) {
          clear.add(i);
          queue.push(i);
        }
      });
    }
  }

  return clear;
}

// CLEAR, DROP AND REFILL
async function clearAndDrop(initialClear) {
  const clear = expandBlast(new Set(initialClear));

  clear.forEach(index => {
    cells[index] = null;
  });

  updateScore(clear.size * 10);
  renderBoard();

  await wait(180);

  // Gravity: move candies down each column.
  for (let col = 0; col < SIZE; col++) {
    const remaining = [];

    for (let row = SIZE - 1; row >= 0; row--) {
      const candy = cells[row * SIZE + col];
      if (candy) remaining.push(candy);
    }

    for (let row = SIZE - 1; row >= 0; row--) {
      const index = row * SIZE + col;
      cells[index] = remaining[SIZE - 1 - row] || randomCandy();
    }
  }

  renderBoard();
  await wait(180);
}

// RESOLVE ALL MATCHES AND UNLOCK BOARD
async function runResolution(preferredIndex, firstClear = null) {
  try {
    if (firstClear) {
      await clearAndDrop(firstClear);
    }

    let rounds = 0;

    while (playing && rounds < 40) {
      const runs = findRuns();

      if (!runs.length) break;

      const matched = new Set();
      runs.forEach(run => run.forEach(i => matched.add(i)));

      // Create special candy from the longest run.
      const longest = [...runs].sort((a, b) => b.length - a.length)[0];

      if (longest.length >= 4) {
        const keepIndex = longest.includes(preferredIndex)
          ? preferredIndex
          : longest[0];

        cells[keepIndex] = longest.length >= 5
          ? { type: "lightning", color: null }
          : { type: "bomb", color: null };

        matched.delete(keepIndex);

        message.textContent = longest.length >= 5
          ? "⚡ LIGHTNING CREATED!"
          : "💣 BOMB CREATED!";
      }

      playSound();
      await clearAndDrop(matched);

      preferredIndex = -1;
      rounds++;
    }

    if (rounds >= 40) {
      console.warn("Match chain limit reached.");
    }

  } catch (error) {
    console.error("Game resolution error:", error);
    message.textContent = "Game recovered. Try again!";
  } finally {
    // Always unlock the board.
    busy = false;
    selected = null;
    renderBoard();

    if (playing && timeLeft > 0) {
      if (message.textContent !== "⚡ LIGHTNING CREATED!" &&
          message.textContent !== "💣 BOMB CREATED!") {
        message.textContent = "Keep matching! 🍬";
      }
    }
  }
}

// SCORE
function updateScore(points) {
  score += points;
  scoreDisplay.textContent = score;
}

function saveBestScore() {
  if (score > bestScore) {
    bestScore = score;
    bestDisplay.textContent = bestScore;

    try {
      localStorage.setItem("candyPopManiaBest", String(bestScore));
    } catch (e) {}

    message.textContent = "🏆 NEW PERSONAL BEST: " + bestScore;
  } else {
    message.textContent = "TIME'S UP! FINAL SCORE: " + score;
  }
}

// CLICK EVENTS
board.addEventListener("click", event => {
  const tile = event.target.closest(".cell");

  if (!tile || suppressClick) return;

  selectCandy(Number(tile.dataset.index));
});

// SWIPE EVENTS
board.addEventListener("pointerdown", event => {
  const tile = event.target.closest(".cell");

  if (!tile || !playing || busy) return;

  pointerStart = Number(tile.dataset.index);
});

board.addEventListener("pointerup", event => {
  if (pointerStart === null) return;

  const start = pointerStart;
  pointerStart = null;

  const tile = event.target.closest(".cell");

  if (!tile || !playing || busy) return;

  const end = Number(tile.dataset.index);

  if (start !== end && areNeighbours(start, end)) {
    suppressClick = true;
    selected = null;
    swapCandies(start, end);

    setTimeout(() => {
      suppressClick = false;
    }, 300);
  }
});

board.addEventListener("pointercancel", () => {
  pointerStart = null;
});

// START GAME
function startGame() {
  clearInterval(clock);

  score = 0;
  timeLeft = 60;
  selected = null;
  busy = false;
  playing = true;
  pointerStart = null;
  suppressClick = false;

  scoreDisplay.textContent = "0";
  timerDisplay.textContent = "60";
  message.textContent = "Let's pop some candies!";
  startButton.textContent = "RESTART";

  createBoard();

  clock = setInterval(() => {
    timeLeft--;
    timerDisplay.textContent = timeLeft;

    if (timeLeft <= 0) {
      clearInterval(clock);
      playing = false;
      busy = false;
      selected = null;

      saveBestScore();
      startButton.textContent = "PLAY AGAIN";
      renderBoard();
    }
  }, 1000);
}

startButton.addEventListener("click", startGame);

// INITIAL DISPLAY
createBoard();
