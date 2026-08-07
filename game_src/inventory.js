// ═══════════════════════════════════════════
// inventory.js — Inventory Panel Manager
// Renders circuit piece inventory using
// per-item Canvas elements
// ═══════════════════════════════════════════

import { drawPiece } from './pieces.js';

export class Inventory {
  constructor(level, onSelectPiece) {
    this.onSelectPiece = onSelectPiece;
    this.selectedId    = null;

    // Build inventory state from level definition
    this.items = level.inventory.map((entry, index) => ({
      id:    `${entry.panel}-${index}`,
      type:  entry.type,
      count: entry.count,
      panel: entry.panel,
      rotation: 0,
    }));

    this._render();
  }

  _render() {
    this._renderPanel('left',  document.getElementById('inv-left-items'));
    this._renderPanel('right', document.getElementById('inv-right-items'));
  }

  _renderPanel(panel, container) {
    if (!container) return;
    container.innerHTML = '';

    const items = this.items.filter(i => i.panel === panel);
    items.forEach(item => {
      const wrapper = document.createElement('div');
      wrapper.className = 'inv-item'
        + (item.count === 0  ? ' depleted' : '')
        + (item.type === 'CROSS' ? ' is-cross' : '');
      wrapper.dataset.id = item.id;
      if (item.id === this.selectedId) wrapper.classList.add('selected');

      const cvs = document.createElement('canvas');
      const size = 78;
      cvs.width  = size;
      cvs.height = size;
      this._drawItem(cvs, item);

      const badge = document.createElement('div');
      badge.className = 'inv-count';
      badge.textContent = item.count;

      wrapper.appendChild(cvs);
      wrapper.appendChild(badge);
      container.appendChild(wrapper);

      // Touch + click events
      wrapper.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (item.count <= 0) return;
        this._selectItem(item.id);
      });
    });
  }

  _drawItem(canvas, item) {
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    const state = item.id === this.selectedId ? 'selected'
                : item.count === 0            ? 'error'
                : 'normal';
    drawPiece(ctx, 0, 0, size, item.type, item.rotation, state);
  }

  _selectItem(id) {
    if (this.selectedId === id) {
      // Deselect
      this.selectedId = null;
      this.onSelectPiece(null);
    } else {
      this.selectedId = id;
      const item = this.items.find(i => i.id === id);
      this.onSelectPiece(item);
    }
    this._refresh();
  }

  _refresh() {
    this._renderPanel('left',  document.getElementById('inv-left-items'));
    this._renderPanel('right', document.getElementById('inv-right-items'));
  }

  // Called when a piece is placed on the board
  consumePiece(id) {
    const item = this.items.find(i => i.id === id);
    if (!item || item.count <= 0) return false;
    item.count--;
    if (item.count === 0) {
      this.selectedId = null;
      this.onSelectPiece(null);
    }
    this._refresh();
    return true;
  }

  // Called when a piece is returned (removed from board)
  returnPiece(type) {
    const item = this.items.find(i => i.type === type);
    if (!item) return;
    item.count++;
    this._refresh();
  }

  // Rotate the currently selected piece preview
  rotateSelected() {
    if (!this.selectedId) return;
    const item = this.items.find(i => i.id === this.selectedId);
    if (!item) return;
    item.rotation = (item.rotation + 1) % 4;
    this._refresh();
    return item;
  }

  getSelectedItem() {
    if (!this.selectedId) return null;
    return this.items.find(i => i.id === this.selectedId) || null;
  }

  deselectAll() {
    this.selectedId = null;
    this.onSelectPiece(null);
    this._refresh();
  }

  // Reset inventory counts to level defaults
  reset(level) {
    this.items = level.inventory.map((entry, index) => ({
      id:    `${entry.panel}-${index}`,
      type:  entry.type,
      count: entry.count,
      panel: entry.panel,
      rotation: 0,
    }));
    this.selectedId = null;
    this._refresh();
  }

  // Animate count badge bounce
  _animateCountBadge(id) {
    const el = document.querySelector(`[data-id="${id}"] .inv-count`);
    if (!el) return;
    el.style.transform = 'scale(1.4)';
    el.style.color = '#00E5FF';
    setTimeout(() => {
      el.style.transform = 'scale(1)';
      el.style.color = '';
    }, 250);
  }
}
