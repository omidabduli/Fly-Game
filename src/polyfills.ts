// Safari before 16 (iOS 15) has no CanvasRenderingContext2D.roundRect.
// The game only ever passes a single number as the radius.
if (typeof CanvasRenderingContext2D !== 'undefined' && !('roundRect' in CanvasRenderingContext2D.prototype)) {
  Object.defineProperty(CanvasRenderingContext2D.prototype, 'roundRect', {
    configurable: true,
    writable: true,
    value(this: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: unknown = 0) {
      const r = Math.max(0, Math.min(typeof radius === 'number' ? radius : 0, Math.abs(w) / 2, Math.abs(h) / 2));
      this.moveTo(x + r, y);
      this.arcTo(x + w, y, x + w, y + h, r);
      this.arcTo(x + w, y + h, x, y + h, r);
      this.arcTo(x, y + h, x, y, r);
      this.arcTo(x, y, x + w, y, r);
      this.closePath();
    },
  });
}

export {};
