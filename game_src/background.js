// ═══════════════════════════════════════════
// background.js — Spider-Man Chroma Key BG
// Removes green screen from background.mp4
// and renders Spider-Man on the BG canvas,
// along with a multiverse particle system
// ═══════════════════════════════════════════

class Particle {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.reset(true);
  }
  reset(randomY) {
    this.x = Math.random() * this.w;
    this.y = randomY ? Math.random() * this.h : this.h + 10;
    this.size = Math.random() * 2.5 + 0.5;
    this.vx = (Math.random() - 0.5) * 0.5;
    this.vy = -(Math.random() * 1.5 + 0.5);
    this.life = Math.random() * 100;
    // Multiverse colours: Cyan, Green, Red
    const cols = ['rgba(0, 229, 255,', 'rgba(57, 255, 20,', 'rgba(255, 45, 109,'];
    this.color = cols[Math.floor(Math.random() * cols.length)];
  }
  update(w, h) {
    this.w = w; this.h = h;
    this.x += this.vx;
    this.y += this.vy;
    this.life += 0.02;
    if (this.y < -10 || this.x < -10 || this.x > w + 10) this.reset(false);
  }
  draw(ctx) {
    const alpha = (Math.sin(this.life) * 0.5 + 0.5) * 0.8;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = this.color + alpha + ')';
    ctx.shadowBlur = 10;
    ctx.shadowColor = this.color + '1)';
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

export class BackgroundRenderer {
  constructor(canvasId, videoId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.video = document.getElementById(videoId);
    this.isPlaying = false;
    this.rafId = null;
    this.particles = Array.from({ length: 80 }, () => new Particle(window.innerWidth, window.innerHeight));
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  start() {
    if (!this.video) return;

    const tryPlay = () => {
      this.video.play().then(() => {
        this.isPlaying = true;
        this._loop();
      }).catch(() => {
        // Autoplay blocked — show static dark background
        this._drawDarkBg();
      });
    };

    if (this.video.readyState >= 2) {
      tryPlay();
    } else {
      this.video.addEventListener('canplay', tryPlay, { once: true });
      this.video.load();
    }
  }

  _loop() {
    if (!this.isPlaying) return;
    this._drawFrame();
    this.rafId = requestAnimationFrame(() => this._loop());
  }

  _drawFrame() {
    const { canvas, ctx, video } = this;
    const w = canvas.width;
    const h = canvas.height;

    // Fill dark base
    ctx.fillStyle = '#061820';
    ctx.fillRect(0, 0, w, h);

    if (!video || video.readyState < 2) return;

    // Draw video scaled to cover canvas
    const vw = video.videoWidth  || 1280;
    const vh = video.videoHeight || 720;
    const scale = Math.max(w / vw, h / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;

    // Draw to an offscreen approach for chroma key
    ctx.drawImage(video, dx, dy, dw, dh);

    // Chroma key: remove green pixels
    try {
      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        // Green screen detection: green channel dominant
        if (g > 80 && g > r * 1.35 && g > b * 1.35) {
          data[i + 3] = 0; // transparent
        }
      }
      ctx.putImageData(imageData, 0, 0);

      // Re-draw the dark background where pixels became transparent
      // We need to composite: draw dark bg first, then overlay
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = w;
      tempCanvas.height = h;
      const tCtx = tempCanvas.getContext('2d');
      tCtx.fillStyle = '#061820';
      tCtx.fillRect(0, 0, w, h);
      // Add subtle dark teal atmospheric gradient
      const grad = tCtx.createRadialGradient(w*0.3, h*0.6, 0, w*0.5, h*0.5, w*0.8);
      grad.addColorStop(0, 'rgba(0,60,80,0.3)');
      grad.addColorStop(1, 'rgba(6,24,32,0)');
      tCtx.fillStyle = grad;
      tCtx.fillRect(0, 0, w, h);
      tCtx.drawImage(canvas, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(tempCanvas, 0, 0);
    } catch (e) {
      // CORS or security error — just show dark background
      this._drawDarkBg();
    }
    
    // Draw 3D-like Multiverse Particles
    this.particles.forEach(p => {
      p.update(w, h);
      p.draw(ctx);
    });
  }

  _drawDarkBg() {
    const { canvas, ctx } = this;
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#061820';
    ctx.fillRect(0, 0, w, h);

    // Atmospheric gradient
    const grad = ctx.createRadialGradient(w * 0.3, h * 0.6, 0, w * 0.5, h * 0.5, w * 0.9);
    grad.addColorStop(0, 'rgba(0,80,100,0.25)');
    grad.addColorStop(0.5, 'rgba(0,40,60,0.15)');
    grad.addColorStop(1, 'rgba(6,24,32,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Subtle web-like lines for atmosphere
    this._drawWebLines(ctx, w, h);

    // Draw 3D-like Multiverse Particles
    if (!this.video || this.video.readyState < 2 || this.video.paused) {
      // Only draw if _drawFrame didn't already draw them (prevents double drawing)
      this.particles.forEach(p => {
        p.update(w, h);
        p.draw(ctx);
      });
    }
  }

  _drawWebLines(ctx, w, h) {
    ctx.save();
    ctx.strokeStyle = 'rgba(0,229,255,0.04)';
    ctx.lineWidth = 1;
    const cx = w * 0.15;
    const cy = h * 0.85;
    const lines = 12;
    const maxR = Math.max(w, h) * 0.8;
    for (let i = 0; i < lines; i++) {
      const angle = (i / lines) * Math.PI * 0.6 - 0.1;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * maxR, cy - Math.sin(angle) * maxR);
      ctx.stroke();
    }
    // Arcs
    ctx.strokeStyle = 'rgba(0,229,255,0.025)';
    for (let i = 1; i <= 5; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, maxR * i / 6, -0.3, Math.PI * 0.65);
      ctx.stroke();
    }
    ctx.restore();
  }

  stop() {
    this.isPlaying = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }
}
