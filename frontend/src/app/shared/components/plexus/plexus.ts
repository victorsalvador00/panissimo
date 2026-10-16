import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { ThemeService } from '../../../core/theme/theme.service';

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

/** Píxeles por nodo: la cantidad se ajusta al tamaño (menos nodos en celular). */
const AREA_PER_NODE = 8_000;
const MIN_NODES = 28;
const MAX_NODES = 140;
/** Distancia máxima (px CSS) para unir dos nodos con una línea. */
const LINK_DISTANCE = 140;
const SPEED = 0.25;

const PALETTE = {
  light: { line: '226, 200, 255', node: '#f6ecff' },
  dark: { line: '140, 165, 255', node: '#e3e8ff' },
};

/**
 * Fondo decorativo de red "plexus": nodos que flotan despacio unidos por líneas cuando están cerca (las uniones
 * cambian con el movimiento, por eso es canvas y no CSS). Sin librerías. Se detiene con "reducir movimiento"
 * (queda un cuadro fijo), cuando la pestaña está oculta (requestAnimationFrame) y al destruirse; los colores
 * siguen al tema. Decorativo: `aria-hidden`.
 */
@Component({
  selector: 'app-plexus',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: '<canvas #canvas></canvas>',
  styles: `
    :host {
      position: absolute;
      inset: 0;
      display: block;
      pointer-events: none;
    }
    canvas {
      display: block;
      width: 100%;
      height: 100%;
    }
  `,
})
export class Plexus {
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly theme = inject(ThemeService);
  private nodes: Node[] = [];
  private frame = 0;
  private width = 0;
  private height = 0;
  private observer?: ResizeObserver;
  /** Solo con "reducir movimiento": el cuadro fijo se redibuja al cambiar de tema. */
  private stillContext?: CanvasRenderingContext2D;

  constructor() {
    afterNextRender(() => this.start());
    effect(() => {
      this.theme.dark();
      if (this.stillContext) {
        this.draw(this.stillContext);
      }
    });
    inject(DestroyRef).onDestroy(() => {
      cancelAnimationFrame(this.frame);
      this.observer?.disconnect();
    });
  }

  private start(): void {
    const canvas = this.canvas().nativeElement;
    const context = canvas.getContext?.('2d');
    // Sin canvas (pruebas, navegadores viejos) queda solo el degradado del fondo.
    if (!context) {
      return;
    }
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      this.width = canvas.clientWidth;
      this.height = canvas.clientHeight;
      canvas.width = Math.round(this.width * ratio);
      canvas.height = Math.round(this.height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      this.seed();
      if (still) {
        this.draw(context);
      }
    };
    this.observer = new ResizeObserver(resize);
    this.observer.observe(canvas);
    resize();

    if (still) {
      this.stillContext = context;
      return;
    }
    const loop = () => {
      this.move();
      this.draw(context);
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  /** Ajusta la cantidad de nodos al tamaño sin regenerar los que ya flotan (la barra del celular cambia el alto). */
  private seed(): void {
    const count = Math.max(
      MIN_NODES,
      Math.min(MAX_NODES, Math.round((this.width * this.height) / AREA_PER_NODE)),
    );
    this.nodes.length = Math.min(this.nodes.length, count);
    for (const node of this.nodes) {
      node.x = Math.min(node.x, this.width);
      node.y = Math.min(node.y, this.height);
    }
    while (this.nodes.length < count) {
      this.nodes.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        vx: (Math.random() - 0.5) * 2 * SPEED,
        vy: (Math.random() - 0.5) * 2 * SPEED,
        r: 1.2 + Math.random() * 1.6,
      });
    }
  }

  private move(): void {
    for (const node of this.nodes) {
      node.x += node.vx;
      node.y += node.vy;
      if (node.x < 0 || node.x > this.width) node.vx *= -1;
      if (node.y < 0 || node.y > this.height) node.vy *= -1;
    }
  }

  private draw(context: CanvasRenderingContext2D): void {
    const colors = this.theme.dark() ? PALETTE.dark : PALETTE.light;
    context.clearRect(0, 0, this.width, this.height);

    context.lineWidth = 1;
    for (let i = 0; i < this.nodes.length; i++) {
      const a = this.nodes[i];
      for (let j = i + 1; j < this.nodes.length; j++) {
        const b = this.nodes[j];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (distance < LINK_DISTANCE) {
          context.strokeStyle = `rgba(${colors.line}, ${(1 - distance / LINK_DISTANCE) * 0.7})`;
          context.beginPath();
          context.moveTo(a.x, a.y);
          context.lineTo(b.x, b.y);
          context.stroke();
        }
      }
    }

    context.fillStyle = colors.node;
    for (const node of this.nodes) {
      context.beginPath();
      context.arc(node.x, node.y, node.r, 0, Math.PI * 2);
      context.fill();
    }
  }
}
