// ═══════════════════════════════════════════
// main.js — Octavius Circuit Entry Point
// Wires up all modules: board, inventory,
// voltage solver, UI, background, touch
// ═══════════════════════════════════════════

import './style.css';
import { Board }              from './board.js';
import { Inventory }          from './inventory.js';
import { solveCircuit }       from './voltage.js';
import { UI }                 from './ui.js';
import { BackgroundRenderer } from './background.js';
import { LEVELS }             from './levels.js';

// ── Game State ────────────────────────────
let currentLevelIndex = 0;
let level = LEVELS[currentLevelIndex];
let selectedItem  = null;  // Currently selected inventory item
let lastPlacedAt  = null;  // { row, col } — last placed piece location
let gameWon       = false;

let board = null;
let inventory = null;

// ── Init Modules ──────────────────────────
const bgRenderer = new BackgroundRenderer('bg-canvas', 'bg-video');
bgRenderer.start();

const ui = new UI();

function loadLevel(index) {
  currentLevelIndex = index;
  level = LEVELS[index];
  selectedItem = null;
  lastPlacedAt = null;
  gameWon = false;

  const textEl = document.getElementById('level-display-text');
  if (textEl) textEl.textContent = `Lvl ${level.id}: ${level.name}`;

  ui.initLevel(level);
  ui.hideWin();
  ui.update(0, false);

  if (!inventory) {
    inventory = new Inventory(level, (item) => {
      selectedItem = item;
      updateActionBar();
    });
  } else {
    inventory.reset(level);
  }

  if (board) board.destroy();
  board = new Board('board-canvas', level, handleCellClick);

  updateCircuit();
  updateActionBar();
}



// ── Action Bar Buttons ───────────────────
document.getElementById('btn-rotate')?.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  handleRotate();
});
document.getElementById('btn-reset')?.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  handleReset();
});
document.getElementById('btn-remove')?.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  handleRemoveSelected();
});
document.getElementById('btn-select')?.addEventListener('pointerdown', (e) => {
  e.preventDefault();
});

// ── Win Screen ───────────────────────────
ui.onPlayAgain(() => {
  if (currentLevelIndex < LEVELS.length - 1) {
    loadLevel(currentLevelIndex + 1);
  } else {
    loadLevel(currentLevelIndex);
  }
});

// ── Board Interaction ────────────────────
function handleCellClick(row, col) {
  if (gameWon) return;

  const existingPiece = board.getPiece(row, col);
  const isFixed = level.fixedTiles.some(t => t.row === row && t.col === col);
  if (isFixed) return;

  if (selectedItem) {
    // Place selected piece
    if (!existingPiece) {
      const placed = board.placePiece(row, col, selectedItem.type, selectedItem.rotation);
      if (placed) {
        inventory.consumePiece(selectedItem.id);
        lastPlacedAt = { row, col };
        animatePlacement(row, col);
        updateCircuit();
      }
    } else {
      // Cell occupied — deselect instead
      inventory.deselectAll();
      selectedItem = null;
    }
  } else if (existingPiece) {
    // Tap placed piece — directly rotate it!
    board.rotatePiece(row, col);
    lastPlacedAt = { row, col };
    updateCircuit();
  }

  updateActionBar();
}

function handleRotate() {
  if (!selectedItem) {
    // Rotate last placed piece
    if (lastPlacedAt) {
      board.rotatePiece(lastPlacedAt.row, lastPlacedAt.col);
      updateCircuit();
    }
    return;
  }
  // Rotate selected inventory piece (preview)
  const item = inventory.rotateSelected();
  if (item) selectedItem = item;
}

function handleReset() {
  if (!board) return;
  board.reset();
  inventory.reset(level);
  selectedItem = null;
  lastPlacedAt = null;
  ui.update(0, false);
  updateActionBar();
}

function handleRemoveSelected() {
  if (!lastPlacedAt || !board) return;
  const removed = board.removePiece(lastPlacedAt.row, lastPlacedAt.col);
  if (removed) {
    inventory.returnPiece(removed.type);
    lastPlacedAt = null;
    updateCircuit();
    updateActionBar();
  }
}

// ── Circuit Solver ───────────────────────
function updateCircuit() {
  if (!board) return;
  const result = solveCircuit(board.grid, level);
  board.setLitCells(result.litCells);
  ui.update(result.voltage, result.connected, result.modifiersHit, result.endNodeReached);

  // Win = correct voltage AND all end nodes reached
  const won = result.connected
            && result.voltage === level.targetVoltage
            && result.endNodeReached;

  if (!gameWon && won) {
    gameWon = true;
    const hasNext = currentLevelIndex < LEVELS.length - 1;
    setTimeout(() => ui.showWin(result.voltage, hasNext), 800);
  }
}

// ── Action Bar State ─────────────────────
function updateActionBar() {
  const rotateBtn = document.getElementById('btn-rotate');
  const removeBtn = document.getElementById('btn-remove');

  if (rotateBtn) {
    const canRotate = !!selectedItem || !!lastPlacedAt;
    rotateBtn.style.opacity = canRotate ? '1' : '0.4';
    rotateBtn.style.pointerEvents = canRotate ? 'auto' : 'none';
  }

  if (removeBtn) {
    const canRemove = !!lastPlacedAt && board.getPiece(lastPlacedAt.row, lastPlacedAt.col);
    removeBtn.style.opacity = canRemove ? '1' : '0.4';
    removeBtn.style.pointerEvents = canRemove ? 'auto' : 'none';
  }
}

// ── Pointer Events (Mouse + Touch) ───────
const boardContainer = document.getElementById('board-container');

function getBoardCell(e) {
  const point = e.changedTouches ? e.changedTouches[0] : e;
  const local = board.screenToCanvas(point.clientX, point.clientY);
  return board.getCellFromPoint(local.x, local.y);
}

boardContainer.addEventListener('pointermove', (e) => {
  if (!board) return;
  const cell = getBoardCell(e);
  board.setHovered(cell?.row ?? null, cell?.col ?? null);
});

boardContainer.addEventListener('pointerleave', () => {
  if (board) board.setHovered(null, null);
});

boardContainer.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  const cell = getBoardCell(e);
  if (cell) handleCellClick(cell.row, cell.col);
});

// ── Placement Animation ──────────────────
function animatePlacement(row, col) {
}

// ── Keyboard Support (desktop bonus) ─────
window.addEventListener('keydown', (e) => {
  switch (e.key) {
    case 'r':
    case 'R':
      handleRotate();
      break;
    case 'Delete':
    case 'Backspace':
      handleRemoveSelected();
      break;
    case 'Escape':
      if (inventory) inventory.deselectAll();
      selectedItem = null;
      updateActionBar();
      break;
  }
});

loadLevel(0);
updateActionBar();
