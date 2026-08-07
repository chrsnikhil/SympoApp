// ═══════════════════════════════════════════
// board.js — Dynamic Octagonal Grid Renderer
// Canvas 2D rendering of the game board
// ═══════════════════════════════════════════

import {
  drawPiece, drawEmptyCell, drawPowerSource,
  drawVoltageModifier, drawXBlock, drawEndNode, drawOctagon
} from './pieces.js';

const DEFAULT_ROWS = 5;
const DEFAULT_COLS = 5;

export class Board {
  constructor(canvasId, level, onCellClick) {
    this.canvas      = document.getElementById(canvasId);
    this.ctx         = this.canvas.getContext('2d');
    this.level       = level;
    this.onCellClick = onCellClick;

    this.rows        = level.rows || DEFAULT_ROWS;
    this.cols        = level.cols || DEFAULT_COLS;

    // Dynamic grid: each cell is null or { type, rotation }
    this.grid = Array.from({ length: this.rows }, () =>
      Array(this.cols).fill(null)
    );

    this.hoveredCell  = null;
    this.litCells     = new Set();
    this.flowPhase    = 0;
    this.pulsePhase   = 0;
    this.xShakePhase  = 0;    // for X-block animated warning
    this.tileSize     = 80;
    this.gap          = 4;
    this.rafId        = null;

    // Cosmetic interaction effects tracker
    this.effects      = [];

    // Grid placement/rotation scales for animations
    this.pieceScales = Array.from({ length: this.rows }, () =>
      Array(this.cols).fill(1.0)
    );

    this._setupCanvas();
    this._startLoop();
  }

  _setupCanvas() {
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const container = this.canvas.parentElement;
    if (!container) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    
    if (cw === 0 || ch === 0) return; // Prevent negative calculations when hidden

    const gap     = 4;
    const padding = 20;
    const maxTileW = Math.floor((cw - padding * 2 - gap * (this.cols - 1)) / this.cols);
    const maxTileH = Math.floor((ch - padding * 2 - gap * (this.rows - 1)) / this.rows);
    this.tileSize  = Math.min(maxTileW, maxTileH, 90);
    this.gap       = gap;

    const totalW = this.tileSize * this.cols + gap * (this.cols - 1);
    const totalH = this.tileSize * this.rows + gap * (this.rows - 1);

    this.canvas.width  = totalW;
    this.canvas.height = totalH;

    this.canvas.style.position = 'absolute';
    this.canvas.style.left  = ((cw - totalW) / 2) + 'px';
    this.canvas.style.top   = ((ch - totalH) / 2) + 'px';
  }

  _startLoop() {
    /**
     * Rendered at a capped frame rate, not as fast as the display will go.
     *
     * A full redraw is expensive out of proportion to what is on screen: every
     * cell is drawn from scratch, and the tile art uses canvas shadowBlur more
     * than fifty times per pass. shadowBlur is a software blur — it is the most
     * costly thing a 2D context does — so the board was running thousands of
     * blur passes a second to animate a slow pulse and a few sparks. On a phone
     * that is the whole frame budget, and the game felt like it was dragging
     * even though nothing was happening.
     *
     * 30fps is imperceptible for a puzzle whose fastest motion is a tile
     * popping in, and halves the cost outright. The phases below are still
     * derived from the real timestamp, so every animation runs at the same
     * speed it did — they are simply sampled half as often.
     */
    const FRAME_MS = 1000 / 30;
    let lastDraw = 0;

    const loop = (ts) => {
      this.rafId = requestAnimationFrame(loop);
      if (ts - lastDraw < FRAME_MS) return;
      lastDraw = ts;

      this.flowPhase   = (ts / 650)   % 1;
      this.pulsePhase  = (ts / 1000)  * Math.PI * 2;
      this.xShakePhase = (ts / 1800)  * Math.PI * 2;
      this.radarPhase  = (ts / 2500)  * Math.PI * 2;

      if (!this.particles) this.particles = [];
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life -= p.decay;
        p.x += p.vx;
        p.y += p.vy;
        if (p.life <= 0) this.particles.splice(i, 1);
      }

      // Animate grid scales towards 1.0 (smooth slide/pop)
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          if (this.pieceScales[r][c] < 1.0) {
            this.pieceScales[r][c] += 0.08; // speed of pop
            if (this.pieceScales[r][c] > 1.0) this.pieceScales[r][c] = 1.0;
          }
        }
      }

      this._render();
    };
    this.rafId = requestAnimationFrame(loop);
  }

  _render() {
    const { ctx, tileSize: ts, gap, level } = this;
    const tsNow = performance.now();

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw connection lines BEHIND tiles first (shows routing between cells)
    this._drawConnectionLines();

    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const x   = col * (ts + gap);
        const y   = row * (ts + gap);
        const key = `${row},${col}`;

        const fixed = level.fixedTiles.find(t => t.row === row && t.col === col);

        if (fixed) {
          if (fixed.kind === 'source') {
            drawPowerSource(ctx, x, y, ts, fixed.voltage, this.pulsePhase);
            if (Math.random() < 0.2) {
               if (!this.particles) this.particles = [];
               this.particles.push({
                 x: x + ts/2 + (Math.random()-0.5)*ts*0.4,
                 y: y + ts/2 + ts*0.2,
                 vx: (Math.random()-0.5)*0.5,
                 vy: -0.5 - Math.random()*1.5,
                 life: 1.2, decay: 0.02, color: '#FFE600'
               });
            }
          } else if (fixed.kind === 'modifier') {
            const isLit = this.litCells.has(key);
            drawVoltageModifier(ctx, x, y, ts, fixed.value, fixed.connections, isLit);
          } else if (fixed.kind === 'endnode') {
            const isEndLit = this.litCells.has(key);
            // If game won, endnode "opens" by pulsing intensely
            const phase = (this.gameWon && isEndLit) ? this.pulsePhase * 3 : this.pulsePhase;
            drawEndNode(ctx, x, y, ts, isEndLit, phase);
          } else if (fixed.kind === 'xblock') {
            // Subtle pulse on X-blocks
            const xAlpha = 0.7 + 0.3 * Math.sin(this.xShakePhase + col * 0.8);
            ctx.save();
            ctx.globalAlpha = xAlpha;
            drawXBlock(ctx, x, y, ts);
            ctx.restore();
          }

          // Draw failure highlight if applicable
          if (this.failedNode && this.failedNode.row === row && this.failedNode.col === col) {
             const alpha = 0.5 + 0.5 * Math.sin(this.pulsePhase * 8);
             ctx.save();
             ctx.strokeStyle = `rgba(255, 45, 109, ${alpha})`;
             ctx.lineWidth = 4;
             ctx.shadowColor = '#FF2D6D';
             ctx.shadowBlur = 15;
             drawOctagon(ctx, x + ts/2, y + ts/2, ts*0.55);
             ctx.stroke();
             ctx.restore();
          }
        } else {
          const cell = this.grid[row][col];
          if (cell) {
            const isLit = this.litCells.has(key);
            const scale = this.pieceScales[row][col];

            // ── Flicker logic on placement ──
            const activePlaceEffect = this.effects.find(e => e.row === row && e.col === col && e.type === 'place');
            let drawAlpha = 1.0;
            if (activePlaceEffect) {
              const elapsed = tsNow - activePlaceEffect.startTime;
              const progress = elapsed / activePlaceEffect.duration;
              if (progress < 1.0) {
                const flashPeriod = Math.floor(progress * 10) % 2;
                if (flashPeriod === 0) drawAlpha = 0.15;
              }
            }

            // ── Rotation easing logic ──
            const activeRotateEffect = this.effects.find(e => e.row === row && e.col === col && e.type === 'rotate');
            let drawRotation = cell.rotation;
            if (activeRotateEffect) {
              const elapsed = tsNow - activeRotateEffect.startTime;
              const progress = Math.min(elapsed / activeRotateEffect.duration, 1.0);
              const startAngle = activeRotateEffect.startRotation * Math.PI / 2;
              const targetAngle = cell.rotation * Math.PI / 2;
              let diff = targetAngle - startAngle;
              if (diff > Math.PI) diff -= Math.PI * 2;
              if (diff < -Math.PI) diff += Math.PI * 2;
              
              // Spring ease-out (overshoot and settle)
              const t = progress;
              const ease = 1 - Math.pow(1 - t, 3) + Math.sin(t * Math.PI) * 0.15;
              const currentAngle = startAngle + diff * ease;
              drawRotation = currentAngle / (Math.PI / 2);
            }

            ctx.save();
            ctx.globalAlpha = drawAlpha;

            // Draw main piece
            if (scale < 1.0) {
              const cx = x + ts / 2;
              const cy = y + ts / 2;
              ctx.translate(cx, cy);
              ctx.scale(scale, scale);
              ctx.translate(-cx, -cy);
            }

            drawPiece(
              ctx, x, y, ts,
              cell.type, drawRotation,
              isLit ? 'lit' : 'normal',
              isLit ? this.flowPhase : 0
            );
            ctx.restore();
          } else {
            const isHovered = this.hoveredCell?.row === row
                           && this.hoveredCell?.col === col;
            // Don't show hover on X-block cells (already occupied by fixed)
            drawEmptyCell(ctx, x, y, ts, isHovered, this.radarPhase);
          }
        }
      }
    }

    // Draw Particles
    if (this.particles) {
      this.particles.forEach(p => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.5, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
      });
    }

    // Success Surge Overlay
    if (this.gameWon) {
      const surgePhase = (tsNow % 2000) / 2000;
      ctx.save();
      const grad = ctx.createLinearGradient(0, this.canvas.height * surgePhase - 150, 0, this.canvas.height * surgePhase);
      grad.addColorStop(0, 'rgba(57,255,20,0)');
      grad.addColorStop(1, 'rgba(57,255,20,0.15)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.restore();
    }

    // ── Render expanding shockwave ring effects & Clean up finished effects ──
    this.effects = this.effects.filter(e => {
      const elapsed = tsNow - e.startTime;
      const progress = elapsed / e.duration;
      if (progress >= 1.0) return false;

      if (e.type === 'place') {
        const cx = e.col * (ts + gap) + ts / 2;
        const cy = e.row * (ts + gap) + ts / 2;
        const maxRadius = ts * 0.95;
        const radius = maxRadius * progress;
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 229, 255, ${1 - progress})`;
        ctx.lineWidth = 3.5 * (1 - progress);
        ctx.shadowColor = '#00E5FF';
        ctx.shadowBlur = 12 * (1 - progress);
        ctx.stroke();
        ctx.restore();
      }
      return true;
    });
  }

  // Draw faint glow lines between connected+lit adjacent cells and bloom falloff
  _drawConnectionLines() {
    const { ctx, tileSize: ts, gap } = this;
    if (this.litCells.size < 2) return;

    const tsNow = performance.now();
    const dashOffset = -(tsNow / 20) % 30;

    const dirs = [[-1,0],[0,1]]; // only draw right + down to avoid duplicates
    for (const key of this.litCells) {
      const [r, c] = key.split(',').map(Number);

      // Bloom Falloff for lit tiles (paints light onto neighbors)
      ctx.save();
      ctx.globalAlpha = 0.12;
      const gradient = ctx.createRadialGradient(
        c*(ts+gap) + ts/2, r*(ts+gap) + ts/2, 0,
        c*(ts+gap) + ts/2, r*(ts+gap) + ts/2, ts*1.3
      );
      gradient.addColorStop(0, '#39FF14');
      gradient.addColorStop(1, 'rgba(57,255,20,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(c*(ts+gap) - ts, r*(ts+gap) - ts, ts*3, ts*3);
      ctx.restore();

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
          
          // Path Tracing animated light pulse
          ctx.globalAlpha = 1.0;
          ctx.lineWidth = 3;
          ctx.setLineDash([12, 18]);
          ctx.lineDashOffset = dashOffset;
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
      row >= 0 && row < this.rows &&
      col >= 0 && col < this.cols
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
    this.pieceScales[row][col] = 0.25; // Trigger placement pop
    
    // Trigger cosmetic place effect
    this.effects.push({
      row,
      col,
      type: 'place',
      startTime: performance.now(),
      duration: 350
    });
    
    return true;
  }

  removePiece(row, col) {
    const isFixed = this.level.fixedTiles.some(t => t.row === row && t.col === col);
    if (isFixed) return null;
    const cell = this.grid[row][col];
    this.grid[row][col] = null;
    this.pieceScales[row][col] = 1.0;
    return cell;
  }

  getPiece(row, col)  { return this.grid[row][col]; }

  rotatePiece(row, col) {
    const cell = this.grid[row][col];
    if (!cell) return false;
    const startRotation = cell.rotation;
    cell.rotation = (cell.rotation + 1) % 4;
    this.pieceScales[row][col] = 0.78; // Trigger rotation pop
    
    // Trigger cosmetic rotate effect
    this.effects.push({
      row,
      col,
      type: 'rotate',
      startTime: performance.now(),
      duration: 300,
      startRotation
    });
    
    return true;
  }

  setLitCells(litCells, modifiersHit = [], failedNode = null, gameWon = false) {
    if (!this.prevHitModifiers) this.prevHitModifiers = new Set();
    const currentHits = new Set();

    modifiersHit.forEach(m => {
      const k = `${m.row},${m.col}`;
      currentHits.add(k);
      if (!this.prevHitModifiers.has(k)) {
        this.spawnParticles(m.row, m.col, m.value);
      }
    });

    this.prevHitModifiers = currentHits;
    this.litCells = litCells;
    this.failedNode = failedNode;
    this.gameWon = gameWon;
  }

  spawnParticles(row, col, value) {
    if (!this.particles) this.particles = [];
    const ts = this.tileSize;
    const gap = this.gap;
    const cx = col * (ts + gap) + ts / 2;
    const cy = row * (ts + gap) + ts / 2;
    const count = Math.abs(value) * 3;
    const color = value > 0 ? '#39FF14' : '#FF2D6D';

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 2;
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0 + Math.random(),
        decay: 0.03 + Math.random() * 0.02,
        color: color
      });
    }
  }

  reset() {
    this.grid     = Array.from({ length: this.rows }, () => Array(this.cols).fill(null));
    this.pieceScales = Array.from({ length: this.rows }, () => Array(this.cols).fill(1.0));
    this.litCells = new Set();
    this.effects = [];
    this.particles = [];
    this.prevHitModifiers = new Set();
    this.failedNode = null;
    this.gameWon = false;
  }

  destroy() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }
}
