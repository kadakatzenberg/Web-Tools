type TickHandler = (dt: number, now: number) => void;

/**
 * One requestAnimationFrame loop for everything that is not the WebGL stage.
 * Pauses whenever the tab is hidden so a backgrounded page costs nothing.
 */
class Ticker {
  private handlers = new Set<TickHandler>();
  private rafId = 0;
  private last = 0;
  private running = false;

  add(handler: TickHandler): () => void {
    this.handlers.add(handler);
    this.start();
    return () => {
      this.handlers.delete(handler);
      if (this.handlers.size === 0) this.stop();
    };
  }

  private start(): void {
    if (this.running || document.hidden) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min((now - this.last) / 1000, 0.05);
      this.last = now;
      for (const handler of this.handlers) handler(dt, now);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  bindVisibility(): void {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stop();
      else if (this.handlers.size > 0) this.start();
    });
  }
}

export const ticker = new Ticker();
