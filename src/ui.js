// ═══════════════════════════════════════════
// ui.js — HUD & UI State Manager
// Updates voltage display, status messages,
// and manages the win overlay
// ═══════════════════════════════════════════

export class UI {
  constructor() {
    this.actualEl  = document.getElementById('actual-voltage-value');
    this.targetEl  = document.getElementById('target-voltage-value');
    this.statusEl  = document.getElementById('voltage-status');
    this.statusTxt = document.getElementById('voltage-status-text');
    this.segs      = [
      document.getElementById('voltage-bar-seg-1'),
      document.getElementById('voltage-bar-seg-2'),
      document.getElementById('voltage-bar-seg-3'),
    ];
    this.winOverlay = document.getElementById('win-overlay');
    this.winVoltage = document.getElementById('win-voltage');
    this.playAgainBtn = document.getElementById('btn-play-again');

    this._targetVoltage = 4;
    this._lastStatus = null;
    this._level = null;
  }

  setTarget(voltage) {
    this._targetVoltage = voltage;
    if (this.targetEl) this.targetEl.textContent = voltage;
  }

  initLevel(level) {
    this._level = level;
    this.setTarget(level.targetVoltage);

    const tracker = document.getElementById('modifier-tracker');
    if (tracker) {
      tracker.innerHTML = '';
      const modifiers = level.fixedTiles.filter(t => t.kind === 'modifier');
      modifiers.forEach((mod, i) => {
        const span = document.createElement('span');
        span.className = 'mod-pip' + (mod.value < 0 ? ' neg' : ' pos');
        span.id = `mod-${i}`;
        span.textContent = (mod.value > 0 ? '+' : '') + mod.value;
        span.title = `Modifier: ${mod.value > 0 ? '+' : ''}${mod.value}V`;
        tracker.appendChild(span);
      });
    }
  }

  update(actualVoltage, connected, modifiersHit = [], endNodeReached = false) {
    const target = this._targetVoltage;
    const displayVoltage = connected ? actualVoltage : 0;

    // Update actual voltage display
    if (this.actualEl) this.actualEl.textContent = displayVoltage;

    // Update modifier pip indicators
    if (this._level) {
      const modifiers = this._level.fixedTiles.filter(t => t.kind === 'modifier');
      const pips = document.querySelectorAll('.mod-pip');
      pips.forEach((pip, i) => {
        const mod = modifiers[i];
        if (mod) {
          const wasHit = modifiersHit.some(h => h.row === mod.row && h.col === mod.col);
          pip.classList.toggle('hit', wasHit);
        }
      });
    }

    // Update voltage bar segments
    const ratio   = Math.min(Math.max(displayVoltage / target, 0), 1.33);
    const overload = displayVoltage > target;

    this.segs.forEach((seg, i) => {
      const threshold = (i + 1) / 3;
      seg.classList.remove('active', 'overload');
      if (ratio >= threshold) {
        seg.classList.add(overload ? 'overload' : 'active');
      }
    });

    // Voltage number colour
    if (this.actualEl) {
      if (!connected) {
        this.actualEl.style.color = '';
        this.actualEl.style.textShadow = '';
      } else if (displayVoltage === target && endNodeReached) {
        this.actualEl.style.color = '#39FF14';
        this.actualEl.style.textShadow = '0 0 18px rgba(57,255,20,1)';
      } else if (displayVoltage === target) {
        this.actualEl.style.color = '#FFE600';
        this.actualEl.style.textShadow = '0 0 12px rgba(255,230,0,0.9)';
      } else if (displayVoltage > target) {
        this.actualEl.style.color = '#FF2D6D';
        this.actualEl.style.textShadow = '0 0 12px rgba(255,45,109,0.9)';
      } else {
        this.actualEl.style.color = '#00E5FF';
        this.actualEl.style.textShadow = '0 0 8px rgba(0,229,255,0.6)';
      }
    }

    // Status message
    const newStatus = !connected                               ? 'hidden'
                    : displayVoltage === target && endNodeReached ? 'won'
                    : displayVoltage === target                   ? 'need-end'
                    : displayVoltage > target                     ? 'incorrect'
                    : 'building';

    if (newStatus !== this._lastStatus) {
      this._lastStatus = newStatus;
      this._setStatus(newStatus, displayVoltage);
    }
  }

  _setStatus(status, voltage) {
    const el  = this.statusEl;
    const txt = this.statusTxt;
    if (!el || !txt) return;

    el.className = '';

    if (status === 'hidden' || status === 'building') {
      el.classList.add('status-hidden');
      txt.textContent = '';
    } else if (status === 'won') {
      txt.textContent = '✦ CIRCUIT COMPLETE ✦';
      el.classList.add('status-matched');
    } else if (status === 'need-end') {
      txt.textContent = '▶ REACH THE END NODE ▶';
      el.classList.add('status-need-end');
    } else if (status === 'incorrect') {
      txt.textContent = '⚠ INCORRECT VOLTAGE ⚠';
      el.classList.add('status-incorrect');
    }
  }

  showWin(voltage, hasNextLevel = false) {
    if (this.winOverlay) {
      this.winOverlay.classList.remove('hidden');
      if (this.winVoltage) this.winVoltage.textContent = `${voltage}V`;
      if (this.playAgainBtn) {
        this.playAgainBtn.textContent = hasNextLevel ? 'NEXT LEVEL ➜' : 'PLAY AGAIN';
      }
      this._spawnWinParticles();
    }
  }

  hideWin() {
    if (this.winOverlay) this.winOverlay.classList.add('hidden');
  }

  onPlayAgain(callback) {
    if (this.playAgainBtn) {
      this.playAgainBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        callback();
      });
    }
  }

  _spawnWinParticles() {
    const container = document.getElementById('win-particles');
    if (!container) return;
    container.innerHTML = '';

    const colors = ['#39FF14','#00E5FF','#FFE600','#FF2D6D','#FFFFFF'];
    for (let i = 0; i < 40; i++) {
      const p = document.createElement('div');
      p.style.cssText = `
        position: absolute;
        width: ${4 + Math.random() * 6}px;
        height: ${4 + Math.random() * 6}px;
        border-radius: 50%;
        background: ${colors[Math.floor(Math.random() * colors.length)]};
        left: ${20 + Math.random() * 60}%;
        top: ${20 + Math.random() * 60}%;
        animation: particleBurst ${0.6 + Math.random() * 0.8}s ease-out forwards;
        transform-origin: center;
        --tx: ${(Math.random() - 0.5) * 200}px;
        --ty: ${(Math.random() - 0.5) * 200}px;
      `;
      container.appendChild(p);
    }

    // Add keyframes dynamically
    if (!document.getElementById('particle-style')) {
      const style = document.createElement('style');
      style.id = 'particle-style';
      style.textContent = `
        @keyframes particleBurst {
          0%   { transform: translate(0,0) scale(1); opacity: 1; }
          100% { transform: translate(var(--tx), var(--ty)) scale(0); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }
  }
}
