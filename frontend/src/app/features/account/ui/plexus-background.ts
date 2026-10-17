import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { ThemeService } from '../../../core/theme/theme.service';

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const linkDistance = 130;

/**
 * Login background (frontend §4.1): nodes that float joined by lines, drawn on a canvas without libraries. The number
 * of nodes follows the size; with "reduce motion" it is a still frame. The color is the `--pan-plexus-color` token.
 */
@Component({
  selector: 'app-plexus-background',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<canvas #canvas aria-hidden="true"></canvas>',
  styles: `
    :host {
      position: absolute;
      inset: 0;
      display: block;
      color: var(--pan-plexus-color);
      pointer-events: none;
    }

    canvas {
      display: block;
      width: 100%;
      height: 100%;
    }
  `,
})
export class PlexusBackground {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly theme = inject(ThemeService);

  private context: CanvasRenderingContext2D | null = null;
  private nodes: Node[] = [];
  private width = 0;
  private height = 0;
  private frame = 0;
  private still = false;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      this.context = this.canvas().nativeElement.getContext('2d');
      if (!this.context) return; // no canvas support (tests): plain background
      this.still = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const observer = new ResizeObserver(() => this.resize());
      observer.observe(this.host.nativeElement);
      destroyRef.onDestroy(() => {
        observer.disconnect();
        cancelAnimationFrame(this.frame);
      });
      this.resize();
      if (!this.still) this.loop();
    });
    // The still frame repaints with the new theme colors.
    effect(() => {
      this.theme.isDark();
      if (this.still) requestAnimationFrame(() => this.draw());
    });
  }

  private resize(): void {
    const canvas = this.canvas().nativeElement;
    const { width, height } = this.host.nativeElement.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    this.context?.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.width = width;
    this.height = height;

    const count = Math.round(Math.min(90, Math.max(20, (width * height) / 14000)));
    this.nodes = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6,
    }));
    this.draw();
  }

  private loop(): void {
    for (const node of this.nodes) {
      node.x += node.vx;
      node.y += node.vy;
      if (node.x < 0 || node.x > this.width) node.vx = -node.vx;
      if (node.y < 0 || node.y > this.height) node.vy = -node.vy;
    }
    this.draw();
    this.frame = requestAnimationFrame(() => this.loop());
  }

  private draw(): void {
    const context = this.context;
    if (!context) return;
    context.clearRect(0, 0, this.width, this.height);
    const color = getComputedStyle(this.host.nativeElement).color;
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = 1;

    for (let i = 0; i < this.nodes.length; i++) {
      const a = this.nodes[i];
      for (let j = i + 1; j < this.nodes.length; j++) {
        const b = this.nodes[j];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (distance >= linkDistance) continue;
        context.globalAlpha = (1 - distance / linkDistance) * 0.6;
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.stroke();
      }
    }
    context.globalAlpha = 0.9;
    for (const node of this.nodes) {
      context.beginPath();
      context.arc(node.x, node.y, 1.8, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }
}
