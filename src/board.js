// ═══════════════════════════════════════════
// board.js — 5×5 Octagonal Grid Renderer
// Canvas 2D rendering of the game board
// ═══════════════════════════════════════════

import {
  drawPiece, drawEmptyCell, drawPowerSource,
  drawVoltageModifier, drawXBlock, drawEndNode, drawOctagon
} from './pieces.js';

const GRID_ROWS = 5;
const GRID_COLS = 5;

export class Board {
  constructor(canvasId, level, onCellClick) {
    this.canvas      = document.getElementById(canvasId);
    this.ctx         = this.canvas.getContext('2d');
    this.level       = level;
    this.onCellClick = onCellClick;

    // 5×5 grid: each cell is null or { type, rotation }
    this.grid = Array.from({ length: GRID_ROWS }, () =>
      Array(GRID_COLS).fill(null)
    );

    this.hoveredCell  = null;
    this.litCells     = new Set();
    this.flowPhase    = 0;
    this.pulsePhase   = 0;
    this.xShakePhase  = 0;    // for X-block animated warning
    this.tileSize     = 80;
    this.gap          = 4;
    this.rafId        = null;

    this._setupCanvas();
    this._startLoop();
  }

  _setupCanvas() {
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const container = this.canvas.parentElement;
    const cw = container.clientWidth;
    const ch = container.clientHeight;

    const gap     = 4;
    const padding = 20;
    const maxTileW = Math.floor((cw - padding * 2 - gap * (GRID_COLS - 1)) / GRID_COLS);
    const maxTileH = Math.floor((ch - padding * 2 - gap * (GRID_ROWS - 1)) / GRID_ROWS);
    this.tileSize  = Math.min(maxTileW, maxTileH, 90);
    this.gap       = gap;

    const totalW = this.tileSize * GRID_COLS + gap * (GRID_COLS - 1);
    const totalH = this.tileSize * GRID_ROWS + gap * (GRID_ROWS - 1);

    this.canvas.width  = totalW;
    this.canvas.height = totalH;

    this.canvas.style.position = 'absolute';
    this.canvas.style.left  = ((cw - totalW) / 2) + 'px';
    this.canvas.style.top   = ((ch - totalH) / 2) + 'px';
  }

  _startLoop() {
    const loop = (ts) => {
      this.flowPhase   = (ts / 650)   % 1;
      this.pulsePhase  = (ts / 1000)  * Math.PI * 2;
      this.xShakePhase = (ts / 1800)  * Math.PI * 2;
      this._render();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  _render() {
    const { ctx, tileSize: ts, gap, level } = this;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw connection lines BEHIND tiles first (shows routing between cells)
    this._drawConnectionLines();

    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const x   = col * (ts + gap);
        const y   = row * (ts + gap);
        const key = `${row},${col}`;

        const fixed = level.fixedTiles.find(t => t.row === row && t.col === col);

        if (fixed) {
          if (fixed.kind === 'source') {
            drawPowerSource(ctx, x, y, ts, fixed.voltage, this.pulsePhase);
          } else if (fixed.kind === 'modifier') {
            drawVoltageModifier(ctx, x, y, ts, fixed.value);
          } else if (fixed.kind === 'endnode') {
            const isEndLit = this.litCells.has(key);
            drawEndNode(ctx, x, y, ts, isEndLit, this.pulsePhase);
          } else if (fixed.kind === 'xblock') {
            // Subtle pulse on X-blocks
            const xAlpha = 0.7 + 0.3 * Math.sin(this.xShakePhase + col * 0.8);
            ctx.save();
            ctx.globalAlpha = xAlpha;
            drawXBlock(ctx, x, y, ts);
            ctx.restore();
          }
        } else {
          const cell = this.grid[row][col];
          if (cell) {
            const isLit = this.litCells.has(key);
            drawPiece(
              ctx, x, y, ts,
              cell.type, cell.rotation,
              isLit ? 'lit' : 'normal',
              isLit ? this.flowPhase : 0
            );
          } else {
            const isHovered = this.hoveredCell?.row === row
                           && this.hoveredCell?.col === col;
            // Don't show hover on X-block cells (already occupied by fixed)
            drawEmptyCell(ctx, x, y, ts, isHovered);
          }
        }
      }
    }
  }

  // Draw faint glow lines between connected+lit adjacent cells
  _drawConnectionLines() {
    const { ctx, tileSize: ts, gap } = this;
    if (this.litCells.size < 2) return;

    const dirs = [[-1,0],[0,1]]; // only draw right + down to avoid duplicates
    for (const key of this.litCells) {
      const [r, c] = key.split(',').map(Number);
      for (const [dr, dc] of dirs) {
        const nk = `${r+dr},${c+dc}`;
        if (this.litCells.has(nk)) {
          // Draw glowing connector line between centres of adjacent lit tiles
          const x1 = c * (ts + gap) + ts / 2;
          const y1 = r * (ts + gap) + ts / 2;
          const x2 = (c+dc) * (ts + gap) + ts / 2;
          const y2 = (r+dr) * (ts + gap) + ts / 2;

          ctx.save();
          ctx.strokeStyle = '#39FF14';
          ctx.lineWidth   = 2;
          ctx.shadowColor = '#39FF14';
          ctx.shadowBlur  = 8;
          ctx.globalAlpha = 0.25;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  }

  getCellFromPoint(px, py) {
    const ts  = this.tileSize;
    const gap = this.gap;
    const col = Math.floor(px / (ts + gap));
    const row = Math.floor(py / (ts + gap));
    const cx  = col * (ts + gap);
    const cy  = row * (ts + gap);
    if (
      px >= cx && px <= cx + ts &&
      py >= cy && py <= cy + ts &&
      row >= 0 && row < GRID_ROWS &&
      col >= 0 && col < GRID_COLS
    ) {
      return { row, col };
    }
    return null;
  }

  screenToCanvas(screenX, screenY) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: screenX - rect.left, y: screenY - rect.top };
  }

  setHovered(row, col) {
    this.hoveredCell = (row === null) ? null : { row, col };
  }

  placePiece(row, col, type, rotation = 0) {
    const isFixed = this.level.fixedTiles.some(t => t.row === row && t.col === col);
    if (isFixed) return false;
    this.grid[row][col] = { type, rotation };
    return true;
  }

  removePiece(row, col) {
    const isFixed = this.level.fixedTiles.some(t => t.row === row && t.col === col);
    if (isFixed) return null;
    const cell = this.grid[row][col];
    this.grid[row][col] = null;
    return cell;
  }

  getPiece(row, col)  { return this.grid[row][col]; }

  rotatePiece(row, col) {
    const cell = this.grid[row][col];
    if (!cell) return false;
    cell.rotation = (cell.rotation + 1) % 4;
    return true;
  }

  setLitCells(litCells) { this.litCells = litCells; }

  reset() {
    this.grid     = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(null));
    this.litCells = new Set();
  }

  destroy() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }
}
