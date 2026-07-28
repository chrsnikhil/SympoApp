// ═══════════════════════════════════════════
// pieces.js — Premium Visual Circuit Tiles
// Full visual overhaul: metallic octagons,
// PCB traces, rivets, connection ports, glow
// ═══════════════════════════════════════════

export const PIECE_TYPES = {
  STRAIGHT_H: { id: 'STRAIGHT_H', label: 'Straight H', rotations: [[1,3],[0,2],[1,3],[0,2]] },
  STRAIGHT_V: { id: 'STRAIGHT_V', label: 'Straight V', rotations: [[0,2],[1,3],[0,2],[1,3]] },
  CORNER_TR:  { id: 'CORNER_TR',  label: 'Corner TR',  rotations: [[0,1],[1,2],[2,3],[3,0]] },
  CORNER_RB:  { id: 'CORNER_RB',  label: 'Corner RB',  rotations: [[1,2],[2,3],[3,0],[0,1]] },
  CORNER_BL:  { id: 'CORNER_BL',  label: 'Corner BL',  rotations: [[2,3],[3,0],[0,1],[1,2]] },
  CORNER_LT:  { id: 'CORNER_LT',  label: 'Corner LT',  rotations: [[3,0],[0,1],[1,2],[2,3]] },
  T_LRB:      { id: 'T_LRB',      label: 'T-Junction', rotations: [[1,2,3],[0,2,3],[0,1,3],[0,1,2]] },
  LOOP:       { id: 'LOOP',       label: 'Loop',        rotations: [[1,3],[0,2],[1,3],[0,2]] },
  CROSS:      { id: 'CROSS',      label: 'Cross',       rotations: [[0,1,2,3],[0,1,2,3],[0,1,2,3],[0,1,2,3]] },
};

export function getConnections(pieceType, rotation) {
  const type = PIECE_TYPES[pieceType];
  if (!type) return [];
  return type.rotations[(rotation % 4 + 4) % 4] || [];
}

// ═══════════════════════════════════════════════════════════
// COLOUR PALETTE
// ═══════════════════════════════════════════════════════════
const C = {
  cyan:        '#00E5FF',
  cyanDim:     'rgba(0,229,255,0.35)',
  cyanGlow:    'rgba(0,229,255,0.6)',
  green:       '#39FF14',
  greenGlow:   'rgba(57,255,20,0.6)',
  red:         '#FF2D6D',
  redGlow:     'rgba(255,45,109,0.5)',
  gold:        '#FFE600',
  goldGlow:    'rgba(255,230,0,0.6)',
  amber:       '#E8912A',
  amberGlow:   'rgba(232,145,42,0.55)',
  tileBg:      '#07202E',
  tileMid:     '#0D2F45',
  tileBorder:  '#1C4D6B',
  tileShine:   'rgba(255,255,255,0.06)',
  rivet:       '#1E5A7A',
  rivetLit:    '#00BFDD',
  white:       '#FFFFFF',
};

// ═══════════════════════════════════════════════════════════
// CORE DRAWING UTILITIES
// ═══════════════════════════════════════════════════════════

/** Draw octagon path centred at (cx,cy) with radius r */
export function drawOctagon(ctx, cx, cy, r) {
  const a = Math.PI / 8;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const θ = a + i * Math.PI / 4;
    i === 0 ? ctx.moveTo(cx + r * Math.cos(θ), cy + r * Math.sin(θ))
            : ctx.lineTo(cx + r * Math.cos(θ), cy + r * Math.sin(θ));
  }
  ctx.closePath();
}

/** Corner rivet dots at each octagon vertex */
function drawRivets(ctx, cx, cy, r, color, size = 2.5) {
  const a = Math.PI / 8;
  ctx.fillStyle = color;
  for (let i = 0; i < 8; i++) {
    const θ = a + i * Math.PI / 4;
    ctx.beginPath();
    ctx.arc(cx + r * Math.cos(θ), cy + r * Math.sin(θ), size, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Fill tile with premium metallic background */
function fillTileBase(ctx, cx, cy, r, isLit = false, state = 'normal') {
  // Deep background gradient
  const grad = ctx.createRadialGradient(cx - r*0.2, cy - r*0.2, r*0.05, cx, cy, r*1.1);
  if (isLit) {
    grad.addColorStop(0,   'rgba(20,60,35,0.95)');
    grad.addColorStop(0.6, 'rgba(8,32,18,0.98)');
    grad.addColorStop(1,   'rgba(4,16,10,1)');
  } else if (state === 'selected') {
    grad.addColorStop(0,   'rgba(10,40,60,0.95)');
    grad.addColorStop(0.6, 'rgba(7,28,44,0.98)');
    grad.addColorStop(1,   'rgba(4,16,26,1)');
  } else {
    grad.addColorStop(0,   'rgba(15,45,65,0.95)');
    grad.addColorStop(0.6, 'rgba(8,28,42,0.98)');
    grad.addColorStop(1,   'rgba(4,14,22,1)');
  }
  drawOctagon(ctx, cx, cy, r);
  ctx.fillStyle = grad;
  ctx.fill();

  // Subtle inner PCB grid texture
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = isLit ? 'rgba(57,255,20,0.04)' : 'rgba(0,229,255,0.03)';
  ctx.lineWidth = 0.5;
  const step = r * 0.28;
  for (let x = cx - r; x < cx + r; x += step) {
    ctx.beginPath(); ctx.moveTo(x, cy - r); ctx.lineTo(x, cy + r); ctx.stroke();
  }
  for (let y = cy - r; y < cy + r; y += step) {
    ctx.beginPath(); ctx.moveTo(cx - r, y); ctx.lineTo(cx + r, y); ctx.stroke();
  }
  ctx.restore();

  // Top-left shine bevel
  const shine = ctx.createLinearGradient(cx - r, cy - r, cx + r*0.3, cy + r*0.3);
  shine.addColorStop(0, 'rgba(255,255,255,0.07)');
  shine.addColorStop(0.4, 'rgba(255,255,255,0.02)');
  shine.addColorStop(1, 'rgba(0,0,0,0)');
  drawOctagon(ctx, cx, cy, r);
  ctx.fillStyle = shine;
  ctx.fill();
}

/** Draw outer border with glow based on state */
function drawTileBorder(ctx, cx, cy, r, state, isLit, phase = 0) {
  const borderColor = isLit                ? C.green
                    : state === 'selected' ? C.cyan
                    : state === 'error'    ? C.red
                    : C.tileBorder;

  const glowBlur = isLit                ? 14 + 4 * Math.sin(phase)
                 : state === 'selected' ? 12
                 : 0;

  // Outer glow ring (behind border)
  if (glowBlur > 0) {
    drawOctagon(ctx, cx, cy, r + 1);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth   = 4;
    ctx.shadowColor = borderColor;
    ctx.shadowBlur  = glowBlur * 2;
    ctx.globalAlpha = 0.25;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.shadowBlur  = 0;
  }

  // Main border
  drawOctagon(ctx, cx, cy, r);
  ctx.strokeStyle = borderColor;
  ctx.lineWidth   = isLit || state === 'selected' ? 2 : 1.2;
  ctx.shadowColor = borderColor;
  ctx.shadowBlur  = glowBlur;
  ctx.stroke();
  ctx.shadowBlur  = 0;

  // Inner accent ring
  drawOctagon(ctx, cx, cy, r - 4);
  ctx.strokeStyle = isLit
    ? 'rgba(57,255,20,0.18)'
    : state === 'selected'
    ? 'rgba(0,229,255,0.15)'
    : 'rgba(28,77,107,0.5)';
  ctx.lineWidth   = 0.8;
  ctx.stroke();
}

/** Edge connection port indicators */
function drawConnectionPorts(ctx, cx, cy, r, conns, isLit, state) {
  const portR   = r - 5;
  const edgePts = [
    [0, -portR],   // top
    [portR, 0],    // right
    [0,  portR],   // bottom
    [-portR, 0],   // left
  ];

  const activeColor = isLit                ? C.green
                    : state === 'selected' ? C.cyan
                    : C.cyanDim;

  conns.forEach(dir => {
    const [ex, ey] = edgePts[dir];
    // Outer port ring
    ctx.beginPath();
    ctx.arc(cx + ex, cy + ey, 4.5, 0, Math.PI * 2);
    ctx.fillStyle   = isLit ? 'rgba(57,255,20,0.25)' : 'rgba(0,229,255,0.12)';
    ctx.shadowColor = activeColor;
    ctx.shadowBlur  = isLit ? 10 : 5;
    ctx.fill();
    ctx.shadowBlur  = 0;

    // Inner port dot
    ctx.beginPath();
    ctx.arc(cx + ex, cy + ey, 2.2, 0, Math.PI * 2);
    ctx.fillStyle   = activeColor;
    ctx.shadowColor = activeColor;
    ctx.shadowBlur  = 8;
    ctx.fill();
    ctx.shadowBlur  = 0;
  });
}

/** Draw a curved PCB trace from centre to edge */
function drawTrace(ctx, cx, cy, dir, r, color, width, flowProgress = 0, isLit = false) {
  const traceR  = r - 8;
  const portDist = r - 5;
  const edgePts = [
    [0, -portDist],
    [portDist, 0],
    [0,  portDist],
    [-portDist, 0],
  ];
  const [ex, ey] = edgePts[dir];

  ctx.strokeStyle = color;
  ctx.lineWidth   = width;
  ctx.lineCap     = 'round';
  ctx.shadowColor = color;
  ctx.shadowBlur  = isLit ? 12 : 4;

  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + ex * 0.82, cy + ey * 0.82);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Electricity flow particle
  if (isLit && flowProgress > 0) {
    const fp = flowProgress % 1;
    const px = cx + ex * 0.82 * fp;
    const py = cy + ey * 0.82 * fp;
    ctx.beginPath();
    ctx.arc(px, py, 2.8, 0, Math.PI * 2);
    ctx.fillStyle   = '#FFFFFF';
    ctx.globalAlpha = 0.9 * (1 - fp * 0.5);
    ctx.shadowColor = color;
    ctx.shadowBlur  = 12;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.shadowBlur  = 0;
  }
}

// ═══════════════════════════════════════════════════════════
// MAIN PIECE DRAW
// ═══════════════════════════════════════════════════════════
export function drawPiece(ctx, x, y, size, pieceType, rotation, state = 'normal', flowProgress = 0) {
  const pad  = 5;
  const r    = size / 2 - pad;
  const cx   = x + size / 2;
  const cy   = y + size / 2;
  const isLit   = state === 'lit';
  const isCross = pieceType === 'CROSS';
  const isLoop  = pieceType === 'LOOP';
  const conns   = getConnections(pieceType, rotation);

  ctx.save();

  // ── Layer 1: Tile base ──
  fillTileBase(ctx, cx, cy, r, isLit, state);

  // ── Layer 2: CROSS special base tint ──
  if (isCross) {
    drawOctagon(ctx, cx, cy, r);
    ctx.fillStyle = `rgba(255,230,0,${isLit ? 0.10 : 0.05})`;
    ctx.fill();
  }

  // ── Layer 3: Border ──
  drawTileBorder(ctx, cx, cy, r, isCross ? (isLit ? 'lit' : 'cross') : state, isLit);

  // ── Layer 4: Rivets at corners ──
  const rivetColor = isLit       ? 'rgba(57,255,20,0.6)'
                   : isCross     ? 'rgba(255,230,0,0.5)'
                   : 'rgba(0,180,220,0.35)';
  drawRivets(ctx, cx, cy, r + 0.5, rivetColor, isLit ? 2.8 : 2);

  // ── Layer 5: Circuit traces ──
  const traceColor = isCross       ? (isLit ? C.gold : 'rgba(255,230,0,0.75)')
                   : isLit         ? C.green
                   : state === 'selected' ? C.cyan
                   : C.cyanDim;
  const traceW = isCross ? 3.5 : isLit ? 3.2 : 2.5;

  if (isLoop) {
    // Loop ring + two side traces
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.38, 0, Math.PI * 2);
    ctx.strokeStyle = traceColor;
    ctx.lineWidth   = 2.5;
    ctx.shadowColor = traceColor;
    ctx.shadowBlur  = isLit ? 10 : 3;
    ctx.stroke();
    ctx.shadowBlur  = 0;
  }

  conns.forEach(dir => {
    drawTrace(ctx, cx, cy, dir, r, traceColor, traceW, flowProgress, isLit);
  });

  // ── Layer 6: Cross centre diamond ──
  if (isCross) {
    const dm = r * 0.22;
    ctx.beginPath();
    ctx.moveTo(cx, cy - dm);
    ctx.lineTo(cx + dm, cy);
    ctx.lineTo(cx, cy + dm);
    ctx.lineTo(cx - dm, cy);
    ctx.closePath();
    ctx.fillStyle   = isCross ? (isLit ? C.gold : 'rgba(255,230,0,0.7)') : traceColor;
    ctx.shadowColor = isCross ? C.gold : traceColor;
    ctx.shadowBlur  = 12;
    ctx.fill();
    ctx.shadowBlur  = 0;
  }

  // ── Layer 7: Centre node ──
  ctx.beginPath();
  ctx.arc(cx, cy, isLit ? 4.5 : 3.5, 0, Math.PI * 2);
  ctx.fillStyle   = traceColor;
  ctx.shadowColor = traceColor;
  ctx.shadowBlur  = isLit ? 14 : 6;
  ctx.fill();
  ctx.shadowBlur  = 0;

  // ── Layer 8: Connection ports ──
  drawConnectionPorts(ctx, cx, cy, r, conns, isLit, state);

  // ── Layer 9: Selection pulse overlay ──
  if (state === 'selected') {
    drawOctagon(ctx, cx, cy, r);
    ctx.fillStyle = 'rgba(0,229,255,0.06)';
    ctx.fill();
  }

  ctx.restore();
}

// ═══════════════════════════════════════════════════════════
// EMPTY CELL
// ═══════════════════════════════════════════════════════════
export function drawEmptyCell(ctx, x, y, size, hovered = false) {
  const pad = 5;
  const r   = size / 2 - pad;
  const cx  = x + size / 2;
  const cy  = y + size / 2;

  ctx.save();

  // Base fill
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, hovered ? 'rgba(0,229,255,0.06)' : 'rgba(8,28,44,0.7)');
  grad.addColorStop(1, 'rgba(4,12,20,0.8)');
  drawOctagon(ctx, cx, cy, r);
  ctx.fillStyle = grad;
  ctx.fill();

  // Border
  drawOctagon(ctx, cx, cy, r);
  ctx.strokeStyle = hovered ? 'rgba(0,229,255,0.5)' : 'rgba(28,77,107,0.45)';
  ctx.lineWidth   = hovered ? 1.5 : 1;
  if (hovered) { ctx.shadowColor = C.cyan; ctx.shadowBlur = 10; }
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Inner ring
  drawOctagon(ctx, cx, cy, r - 4);
  ctx.strokeStyle = hovered ? 'rgba(0,229,255,0.12)' : 'rgba(28,77,107,0.2)';
  ctx.lineWidth   = 0.7;
  ctx.stroke();

  // Rivets
  drawRivets(ctx, cx, cy, r + 0.5,
    hovered ? 'rgba(0,229,255,0.3)' : 'rgba(28,77,107,0.25)', 1.8);

  // Ghost cross in centre
  ctx.strokeStyle = hovered ? 'rgba(0,229,255,0.15)' : 'rgba(0,100,150,0.18)';
  ctx.lineWidth   = 0.8;
  const gl = r * 0.3;
  ctx.beginPath();
  ctx.moveTo(cx - gl, cy); ctx.lineTo(cx + gl, cy);
  ctx.moveTo(cx, cy - gl); ctx.lineTo(cx, cy + gl);
  ctx.stroke();

  // Subtle diagonal circuit etching
  ctx.strokeStyle = hovered ? 'rgba(0,229,255,0.08)' : 'rgba(0,80,120,0.12)';
  ctx.lineWidth = 0.6;
  const dl = r * 0.2;
  ctx.beginPath();
  ctx.moveTo(cx - dl, cy - gl); ctx.lineTo(cx - gl, cy - dl);
  ctx.moveTo(cx + dl, cy - gl); ctx.lineTo(cx + gl, cy - dl);
  ctx.moveTo(cx - dl, cy + gl); ctx.lineTo(cx - gl, cy + dl);
  ctx.moveTo(cx + dl, cy + gl); ctx.lineTo(cx + gl, cy + dl);
  ctx.stroke();

  ctx.restore();
}

// ═══════════════════════════════════════════════════════════
// X-BLOCK TILE
// ═══════════════════════════════════════════════════════════
export function drawXBlock(ctx, x, y, size) {
  const pad = 5;
  const r   = size / 2 - pad;
  const cx  = x + size / 2;
  const cy  = y + size / 2;

  ctx.save();

  // Dark red-tinted background
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, 'rgba(60,8,20,0.85)');
  grad.addColorStop(1, 'rgba(20,4,10,0.95)');
  drawOctagon(ctx, cx, cy, r);
  ctx.fillStyle = grad;
  ctx.fill();

  // Warning stripe pattern
  ctx.save();
  drawOctagon(ctx, cx, cy, r - 2);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,45,109,0.07)';
  ctx.lineWidth   = 6;
  for (let i = -r * 2; i < r * 2; i += 10) {
    ctx.beginPath();
    ctx.moveTo(cx + i, cy - r);
    ctx.lineTo(cx + i - r, cy + r);
    ctx.stroke();
  }
  ctx.restore();

  // Outer dashed border
  drawOctagon(ctx, cx, cy, r);
  ctx.strokeStyle = 'rgba(255,45,109,0.6)';
  ctx.lineWidth   = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.shadowColor = C.red;
  ctx.shadowBlur  = 8;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.shadowBlur  = 0;

  // Inner ring
  drawOctagon(ctx, cx, cy, r - 5);
  ctx.strokeStyle = 'rgba(255,45,109,0.2)';
  ctx.lineWidth   = 0.8;
  ctx.stroke();

  // Red rivets
  drawRivets(ctx, cx, cy, r + 0.5, 'rgba(255,45,109,0.5)', 2);

  // X mark — thick glowing
  const arm = r * 0.48;
  [[[-arm,-arm],[arm,arm]], [[arm,-arm],[-arm,arm]]].forEach(([a,b]) => {
    // Shadow stroke
    ctx.beginPath();
    ctx.moveTo(cx + a[0], cy + a[1]);
    ctx.lineTo(cx + b[0], cy + b[1]);
    ctx.strokeStyle = 'rgba(255,45,109,0.3)';
    ctx.lineWidth   = 8;
    ctx.lineCap     = 'round';
    ctx.stroke();

    // Main stroke
    ctx.beginPath();
    ctx.moveTo(cx + a[0], cy + a[1]);
    ctx.lineTo(cx + b[0], cy + b[1]);
    ctx.strokeStyle = C.red;
    ctx.lineWidth   = 3;
    ctx.shadowColor = C.red;
    ctx.shadowBlur  = 12;
    ctx.stroke();
    ctx.shadowBlur  = 0;
  });

  // Centre circle
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.18, 0, Math.PI * 2);
  ctx.fillStyle   = 'rgba(255,45,109,0.25)';
  ctx.strokeStyle = C.red;
  ctx.lineWidth   = 1.5;
  ctx.fill();
  ctx.shadowColor = C.red;
  ctx.shadowBlur  = 8;
  ctx.stroke();
  ctx.shadowBlur  = 0;

  ctx.restore();
}

// ═══════════════════════════════════════════════════════════
// POWER SOURCE TILE
// ═══════════════════════════════════════════════════════════
export function drawPowerSource(ctx, x, y, size, voltage, pulsePhase = 0) {
  const pad  = 5;
  const r    = size / 2 - pad;
  const cx   = x + size / 2;
  const cy   = y + size / 2;
  const sin  = Math.sin(pulsePhase);

  ctx.save();

  // Rich green background
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, `rgba(20,80,30,${0.85 + 0.1 * sin})`);
  grad.addColorStop(0.6, 'rgba(8,40,15,0.95)');
  grad.addColorStop(1, 'rgba(4,20,8,1)');
  drawOctagon(ctx, cx, cy, r);
  ctx.fillStyle = grad;
  ctx.fill();

  // PCB etch lines
  ctx.save();
  drawOctagon(ctx, cx, cy, r - 2); ctx.clip();
  ctx.strokeStyle = 'rgba(57,255,20,0.06)';
  ctx.lineWidth   = 0.5;
  const step = r * 0.3;
  for (let dx = -r; dx < r; dx += step) {
    ctx.beginPath(); ctx.moveTo(cx+dx, cy-r); ctx.lineTo(cx+dx, cy+r); ctx.stroke();
  }
  ctx.restore();

  // Pulsing outer ring
  drawOctagon(ctx, cx, cy, r + 2 + 2*sin);
  ctx.strokeStyle = `rgba(57,255,20,${0.2 + 0.15 * sin})`;
  ctx.lineWidth   = 3;
  ctx.shadowColor = C.green;
  ctx.shadowBlur  = 20 + 10 * sin;
  ctx.stroke();
  ctx.shadowBlur  = 0;

  // Main border
  drawOctagon(ctx, cx, cy, r);
  ctx.strokeStyle = C.green;
  ctx.lineWidth   = 2;
  ctx.shadowColor = C.green;
  ctx.shadowBlur  = 14 + 6 * sin;
  ctx.stroke();
  ctx.shadowBlur  = 0;

  // Inner accent ring
  drawOctagon(ctx, cx, cy, r - 4);
  ctx.strokeStyle = `rgba(57,255,20,${0.25 + 0.1 * sin})`;
  ctx.lineWidth   = 1;
  ctx.stroke();

  // Green rivets
  drawRivets(ctx, cx, cy, r + 0.5, `rgba(57,255,20,${0.5 + 0.2 * sin})`, 2.5);

  // Concentric power rings
  [r * 0.65, r * 0.45].forEach((rr, i) => {
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(57,255,20,${0.2 - i * 0.05})`;
    ctx.lineWidth   = 1;
    ctx.stroke();
  });

  // Lightning bolt ⚡
  ctx.font          = `bold ${size * 0.36}px Arial`;
  ctx.textAlign     = 'center';
  ctx.textBaseline  = 'middle';
  ctx.fillStyle     = C.green;
  ctx.shadowColor   = C.green;
  ctx.shadowBlur    = 18 + 8 * sin;
  ctx.fillText('⚡', cx, cy - 4);
  ctx.shadowBlur    = 0;

  // Voltage badge
  const bh = 16, bw = 34;
  const bx = cx - bw/2, by = cy + r * 0.42;
  ctx.fillStyle   = 'rgba(0,0,0,0.6)';
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 4);
  ctx.fill();
  ctx.strokeStyle = `rgba(57,255,20,0.5)`;
  ctx.lineWidth   = 1;
  ctx.stroke();
  ctx.font          = `bold ${size * 0.16}px 'Orbitron', monospace`;
  ctx.fillStyle     = C.green;
  ctx.shadowColor   = C.green;
  ctx.shadowBlur    = 8;
  ctx.fillText(`V:${voltage}`, cx, by + bh/2 + 1);
  ctx.shadowBlur    = 0;

  ctx.restore();
}

// ═══════════════════════════════════════════════════════════
// VOLTAGE MODIFIER TILE
// ═══════════════════════════════════════════════════════════
export function drawVoltageModifier(ctx, x, y, size, value) {
  const pad  = 5;
  const r    = size / 2 - pad;
  const cx   = x + size / 2;
  const cy   = y + size / 2;
  const neg  = value < 0;
  const col  = neg ? C.amber : C.green;
  const glow = neg ? C.amberGlow : C.greenGlow;
  const accentCol = neg ? C.red : C.green;

  ctx.save();

  // Amber/green tinted background
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  if (neg) {
    grad.addColorStop(0, 'rgba(55,28,5,0.92)');
    grad.addColorStop(0.7, 'rgba(25,12,3,0.97)');
    grad.addColorStop(1, 'rgba(12,5,2,1)');
  } else {
    grad.addColorStop(0, 'rgba(10,45,10,0.92)');
    grad.addColorStop(1, 'rgba(4,18,4,1)');
  }
  drawOctagon(ctx, cx, cy, r);
  ctx.fillStyle = grad;
  ctx.fill();

  // Main border
  drawOctagon(ctx, cx, cy, r);
  ctx.strokeStyle = col;
  ctx.lineWidth   = 2;
  ctx.shadowColor = col;
  ctx.shadowBlur  = 10;
  ctx.stroke();
  ctx.shadowBlur  = 0;

  // Inner border ring
  drawOctagon(ctx, cx, cy, r - 4);
  ctx.strokeStyle = `rgba(${neg ? '232,145,42' : '57,255,20'},0.2)`;
  ctx.lineWidth   = 0.8;
  ctx.stroke();

  // Rivets
  drawRivets(ctx, cx, cy, r + 0.5, neg ? 'rgba(232,145,42,0.55)' : 'rgba(57,255,20,0.5)', 2.2);

  // Outer diamond
  const dm = r * 0.62;
  ctx.beginPath();
  ctx.moveTo(cx, cy - dm); ctx.lineTo(cx + dm*0.7, cy);
  ctx.lineTo(cx, cy + dm); ctx.lineTo(cx - dm*0.7, cy);
  ctx.closePath();
  ctx.strokeStyle = accentCol;
  ctx.lineWidth   = 1.5;
  ctx.shadowColor = accentCol;
  ctx.shadowBlur  = 8;
  ctx.stroke();
  ctx.shadowBlur  = 0;

  // Inner diamond fill
  const idm = r * 0.38;
  ctx.beginPath();
  ctx.moveTo(cx, cy - idm); ctx.lineTo(cx + idm*0.7, cy);
  ctx.lineTo(cx, cy + idm); ctx.lineTo(cx - idm*0.7, cy);
  ctx.closePath();
  ctx.fillStyle = `rgba(${neg ? '232,145,42' : '57,255,20'},0.12)`;
  ctx.fill();

  // Corner accent marks
  const accLen = r * 0.22;
  ctx.strokeStyle = `rgba(${neg ? '255,45,109' : '57,255,20'},0.5)`;
  ctx.lineWidth   = 1.5;
  [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(([sx,sy]) => {
    const ox = cx + sx * r * 0.56;
    const oy = cy + sy * r * 0.56;
    ctx.beginPath();
    ctx.moveTo(ox, oy - sy*accLen); ctx.lineTo(ox, oy);
    ctx.lineTo(ox + sx*accLen, oy);
    ctx.stroke();
  });

  // Value text
  ctx.font          = `bold ${size * 0.28}px 'Orbitron', monospace`;
  ctx.textAlign     = 'center';
  ctx.textBaseline  = 'middle';
  ctx.fillStyle     = accentCol;
  ctx.shadowColor   = accentCol;
  ctx.shadowBlur    = 14;
  ctx.fillText(neg ? value : `+${value}`, cx, cy);
  ctx.shadowBlur    = 0;

  ctx.restore();
}

// ═══════════════════════════════════════════════════════════
// END NODE TILE
// ═══════════════════════════════════════════════════════════
export function drawEndNode(ctx, x, y, size, isLit = false, pulsePhase = 0) {
  const pad = 5;
  const r   = size / 2 - pad;
  const cx  = x + size / 2;
  const cy  = y + size / 2;
  const sin = Math.sin(pulsePhase);
  const col = isLit ? C.green : C.cyan;

  ctx.save();

  // Background
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  if (isLit) {
    grad.addColorStop(0, `rgba(20,80,30,${0.85 + 0.1 * sin})`);
    grad.addColorStop(1, 'rgba(4,20,8,1)');
  } else {
    grad.addColorStop(0, 'rgba(5,40,60,0.9)');
    grad.addColorStop(1, 'rgba(3,15,25,1)');
  }
  drawOctagon(ctx, cx, cy, r);
  ctx.fillStyle = grad;
  ctx.fill();

  // Pulsing outer ring (energy burst when lit)
  if (isLit) {
    drawOctagon(ctx, cx, cy, r + 3 + 3*sin);
    ctx.strokeStyle = `rgba(57,255,20,${0.18 + 0.12 * sin})`;
    ctx.lineWidth   = 4;
    ctx.shadowColor = C.green;
    ctx.shadowBlur  = 24 + 8*sin;
    ctx.stroke();
    ctx.shadowBlur  = 0;
  }

  // Main border
  drawOctagon(ctx, cx, cy, r);
  ctx.strokeStyle = col;
  ctx.lineWidth   = isLit ? 2.5 : 2;
  ctx.shadowColor = col;
  ctx.shadowBlur  = isLit ? (16 + 6*sin) : (8 + 3*sin);
  ctx.stroke();
  ctx.shadowBlur  = 0;

  // Inner border
  drawOctagon(ctx, cx, cy, r - 4);
  ctx.strokeStyle = isLit ? 'rgba(57,255,20,0.2)' : 'rgba(0,229,255,0.15)';
  ctx.lineWidth   = 0.8;
  ctx.stroke();

  // Coloured rivets
  drawRivets(ctx, cx, cy, r + 0.5,
    isLit ? `rgba(57,255,20,${0.6 + 0.2*sin})` : 'rgba(0,229,255,0.4)', 2.5);

  // Concentric target rings — 3 tiers
  [r*0.70, r*0.48, r*0.26].forEach((rr, i) => {
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    const alpha = isLit ? (0.55 - i*0.12) : (0.35 - i*0.08);
    ctx.strokeStyle = isLit ? `rgba(57,255,20,${alpha})` : `rgba(0,229,255,${alpha})`;
    ctx.lineWidth   = isLit ? 1.8 : 1.2;
    if (isLit) { ctx.shadowColor = C.green; ctx.shadowBlur = 8; }
    ctx.stroke();
    ctx.shadowBlur  = 0;
  });

  // Crosshair segments
  const ch  = r * 0.54;
  const gap = r * 0.24;
  ctx.strokeStyle = isLit ? 'rgba(57,255,20,0.55)' : 'rgba(0,229,255,0.4)';
  ctx.lineWidth   = 1.2;
  ctx.beginPath();
  ctx.moveTo(cx - ch, cy);   ctx.lineTo(cx - gap, cy);
  ctx.moveTo(cx + gap, cy);  ctx.lineTo(cx + ch, cy);
  ctx.moveTo(cx, cy - ch);   ctx.lineTo(cx, cy - gap);
  ctx.moveTo(cx, cy + gap);  ctx.lineTo(cx, cy + ch);
  ctx.stroke();

  // Bullseye centre
  ctx.beginPath();
  ctx.arc(cx, cy, isLit ? 5.5 : 4, 0, Math.PI * 2);
  ctx.fillStyle   = col;
  ctx.shadowColor = col;
  ctx.shadowBlur  = isLit ? (18 + 6*sin) : 10;
  ctx.fill();
  ctx.shadowBlur  = 0;

  // "END" label badge
  const bh = 15, bw = 32;
  const bx = cx - bw/2;
  const by = cy + r * 0.44;
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 4);
  ctx.fill();
  ctx.strokeStyle = isLit ? 'rgba(57,255,20,0.6)' : 'rgba(0,229,255,0.5)';
  ctx.lineWidth   = 1;
  ctx.stroke();

  ctx.font          = `bold ${size * 0.15}px 'Orbitron', monospace`;
  ctx.textAlign     = 'center';
  ctx.textBaseline  = 'middle';
  ctx.fillStyle     = col;
  ctx.shadowColor   = col;
  ctx.shadowBlur    = 8;
  ctx.fillText('END', cx, by + bh/2 + 1);
  ctx.shadowBlur    = 0;

  ctx.restore();
}
