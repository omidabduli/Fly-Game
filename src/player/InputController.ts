export type PointerKind = 'mouse' | 'touch' | 'pen' | 'keyboard';

export interface InputHandlers {
  /** aim point in CSS px relative to the canvas */
  aim(x: number, y: number, kind: PointerKind): void;
  strike(x: number, y: number, kind: PointerKind): void;
  /** first user interaction (used to unlock audio) */
  interact(): void;
}

const TAP_MAX_MS = 320;
const TAP_MAX_PX = 14;

/**
 * Pointer Events input for mouse, touch and pen.
 *  - Mouse: the swatter follows the pointer, click strikes.
 *  - Touch/pen: dragging aims, a quick tap strikes at the tapped point.
 * Scrolling/zooming is only blocked on the game canvas (CSS
 * `touch-action: none`), so menus and pages can still scroll.
 */
export class InputController {
  x = 0;
  y = 0;
  hasAim = false;
  lastKind: PointerKind = 'mouse';
  readonly keys = new Set<string>();
  private touch: { id: number; x: number; y: number; t: number; moved: boolean } | null = null;
  private readonly listeners: [EventTarget, string, EventListener, AddEventListenerOptions?][] = [];

  constructor(
    private readonly el: HTMLElement,
    private readonly h: InputHandlers,
  ) {}

  attach(): void {
    const on = <K extends keyof HTMLElementEventMap>(t: EventTarget, type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(type, fn as EventListener, opts);
      this.listeners.push([t, type, fn as EventListener, opts]);
    };
    const el = this.el;
    on(el, 'pointerdown', (e) => this.down(e));
    on(el, 'pointermove', (e) => this.move(e));
    on(el, 'pointerup', (e) => this.up(e));
    on(el, 'pointercancel', (e) => {
      if (this.touch && e.pointerId === this.touch.id) this.touch = null;
    });
    on(el, 'contextmenu', (e) => e.preventDefault());
    on(window as unknown as HTMLElement, 'keydown', (e) => {
      const k = (e as KeyboardEvent).key;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D'].includes(k)) {
        if (!(e.target instanceof HTMLInputElement)) this.keys.add(k.toLowerCase());
      }
    });
    on(window as unknown as HTMLElement, 'keyup', (e) => this.keys.delete((e as KeyboardEvent).key.toLowerCase()));
    on(window as unknown as HTMLElement, 'blur', () => this.keys.clear());
  }

  detach(): void {
    for (const [t, type, fn, opts] of this.listeners) t.removeEventListener(type, fn, opts);
    this.listeners.length = 0;
  }

  private local(e: PointerEvent): [number, number] {
    const r = this.el.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private kind(e: PointerEvent): PointerKind {
    return e.pointerType === 'touch' ? 'touch' : e.pointerType === 'pen' ? 'pen' : 'mouse';
  }

  private down(e: PointerEvent): void {
    this.h.interact();
    const [x, y] = this.local(e);
    const kind = this.kind(e);
    this.lastKind = kind;
    if (kind === 'mouse') {
      if (e.button !== 0) return;
      this.x = x;
      this.y = y;
      this.hasAim = true;
      this.h.aim(x, y, kind);
      this.h.strike(x, y, kind);
      return;
    }
    e.preventDefault();
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    this.touch = { id: e.pointerId, x, y, t: performance.now(), moved: false };
    this.x = x;
    this.y = y;
    this.hasAim = true;
    this.h.aim(x, y, kind);
  }

  private move(e: PointerEvent): void {
    const [x, y] = this.local(e);
    const kind = this.kind(e);
    if (kind === 'mouse') {
      this.lastKind = kind;
      this.x = x;
      this.y = y;
      this.hasAim = true;
      this.h.aim(x, y, kind);
      return;
    }
    if (!this.touch || e.pointerId !== this.touch.id) return;
    if (Math.hypot(x - this.touch.x, y - this.touch.y) > TAP_MAX_PX) this.touch.moved = true;
    this.x = x;
    this.y = y;
    this.h.aim(x, y, kind);
  }

  private up(e: PointerEvent): void {
    // iOS only lets audio start from touchend/click, not from touchstart.
    this.h.interact();
    const kind = this.kind(e);
    if (kind === 'mouse' || !this.touch || e.pointerId !== this.touch.id) return;
    const [x, y] = this.local(e);
    const t = this.touch;
    this.touch = null;
    if (!t.moved && performance.now() - t.t < TAP_MAX_MS) this.h.strike(x, y, kind);
  }

  /** Keyboard aim direction (unit-ish vector), or null. */
  keyDirection(): [number, number] | null {
    let dx = 0;
    let dy = 0;
    if (this.keys.has('arrowleft') || this.keys.has('a')) dx -= 1;
    if (this.keys.has('arrowright') || this.keys.has('d')) dx += 1;
    if (this.keys.has('arrowup') || this.keys.has('w')) dy -= 1;
    if (this.keys.has('arrowdown') || this.keys.has('s')) dy += 1;
    if (!dx && !dy) return null;
    const l = Math.hypot(dx, dy);
    return [dx / l, dy / l];
  }
}
