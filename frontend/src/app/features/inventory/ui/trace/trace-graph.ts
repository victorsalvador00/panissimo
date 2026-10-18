import { BreakpointObserver } from '@angular/cdk/layout';
import { CdkConnectedOverlay, ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  TemplateRef,
  computed,
  inject,
  input,
  model,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatBottomSheet, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { map } from 'rxjs';
import { formatQty } from '../../../../shared/pipes/pipes';
import type { TraceDirection, TraceGraph } from '../../data-access/traceability-api';
import { TraceCardView } from './trace-card';
import { TraceDetail } from './trace-detail';
import { DetailTarget, detailModel } from './trace-detail-model';
import { TraceCard, TraceGroupBox, layoutTrace } from './trace-layout';
import { cardOpacity, linkOpacity, neighbour, summarizeChain, traceChain } from './trace-selection';
import { cardText } from './trace-text';

const ZOOM_KEY = 'pan.trace.zoom';
const MIN_ZOOM = 0.45;
const MAX_ZOOM = 1.3;

interface Selection {
  /** Card id or group id. */
  key: string;
  seeds: string[];
  target: DetailTarget;
}

const RIGHT: ConnectedPosition = {
  originX: 'end',
  originY: 'top',
  overlayX: 'start',
  overlayY: 'top',
  offsetX: 12,
  offsetY: -8,
};
const LEFT: ConnectedPosition = {
  originX: 'start',
  originY: 'top',
  overlayX: 'end',
  overlayY: 'top',
  offsetX: -12,
  offsetY: -8,
};
const BELOW: ConnectedPosition = {
  originX: 'start',
  originY: 'bottom',
  overlayX: 'start',
  overlayY: 'top',
  offsetY: 8,
};
const ABOVE: ConnectedPosition = {
  originX: 'start',
  originY: 'top',
  overlayX: 'start',
  overlayY: 'bottom',
  offsetY: -8,
};
/** Width of the ficha, its gap with the card and the margin with the window (§6.1). */
const FICHA_SPACE = 400 + 12 + 16;

/**
 * §6.1: right of the card, else left, else below or above. The side is chosen by the width only; the overlay is then
 * pushed into the window, so a ficha taller than the space left under the card still opens beside it.
 */
export function fichaPositions(
  card: { left: number; right: number },
  windowWidth: number,
): ConnectedPosition[] {
  if (windowWidth - card.right >= FICHA_SPACE) return [RIGHT];
  if (card.left >= FICHA_SPACE) return [LEFT];
  return [BELOW, ABOVE];
}

function readZoom(): number | null {
  try {
    const value = Number(localStorage.getItem(ZOOM_KEY));
    return value >= MIN_ZOOM && value <= MAX_ZOOM ? value : null;
  } catch {
    return null;
  }
}

function saveZoom(value: number): void {
  try {
    localStorage.setItem(ZOOM_KEY, String(value));
  } catch {
    // Without storage the zoom is not remembered.
  }
}

/**
 * Traceability map (trazabilidad-ui §4 and §5): seven fixed lanes, cards, groups and links in SVG; direction, zoom and
 * drag; hover preview and selection of a chain; arrow keys; the selection bar and the ficha (connected overlay on desktop
 * and tablet, bottom sheet on phones).
 */
@Component({
  selector: 'app-trace-graph',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    OverlayModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    TraceCardView,
    TraceDetail,
  ],
  host: { '(keydown.escape)': 'escape()' },
  templateUrl: './trace-graph.html',
  styleUrl: './trace-graph.scss',
})
export class TraceGraphView {
  readonly graph = input.required<TraceGraph>();
  readonly direction = model.required<TraceDirection>();

  private readonly sheet = inject(MatBottomSheet);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly mobile = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 767.98px)')
      .pipe(map((s) => s.matches)),
    { initialValue: false },
  );
  private readonly wide = typeof window !== 'undefined' && window.innerWidth >= 1400;

  protected readonly layout = computed(() => layoutTrace(this.graph()));
  protected readonly texts = computed(() => {
    const layout = this.layout();
    return new Map(layout.cards.map((c) => [c.id, cardText(c, layout, this.graph().asOf)]));
  });
  protected readonly selection = signal<Selection | null>(null);
  protected readonly detailOpen = signal(false);
  protected readonly hover = signal<string | null>(null);
  protected readonly zoom = signal(1);
  private fitted = false;

  protected readonly chain = computed(() => {
    const s = this.selection();
    return s ? traceChain(this.layout(), s.seeds, this.direction()) : null;
  });
  protected readonly hoverChain = computed(() => {
    const h = this.hover();
    return h && !this.selection() ? traceChain(this.layout(), [h], 'Both') : null;
  });
  protected readonly summary = computed(() => {
    const chain = this.chain();
    return chain ? summarizeChain(this.layout(), chain) : null;
  });
  protected readonly detail = computed(() => {
    const s = this.selection();
    return s && this.detailOpen() ? detailModel(s.target, this.graph(), this.layout()) : null;
  });
  /** §10: the chain in words for the SVG. */
  protected readonly ariaLabel = computed(() => {
    const all = summarizeChain(this.layout(), {
      cards: new Set(this.layout().cards.map((c) => c.id)),
      links: new Set(this.layout().links.map((l) => l.id)),
    });
    const plant = this.layout()
      .groups.filter((g) => g.location)
      .map(
        (g) => `saldo en ${g.location!.code}: ${formatQty(g.location!.onHand, g.location!.uom)}`,
      );
    return [
      `Cadena de trazabilidad: ${all.suppliers} proveedores`,
      `${all.purchaseOrders} órdenes de compra`,
      `${all.rawLots} lotes de materia prima`,
      `${all.closes} cierres`,
      `${all.finishedLots} lotes terminados`,
      `${all.transfers} traspasos con ${formatQty(all.shippedQty, all.shippedUom)}`,
      ...plant,
    ].join(', ');
  });

  protected readonly positions = signal<ConnectedPosition[]>([RIGHT]);
  private readonly viewport = viewChild.required<ElementRef<HTMLElement>>('viewport');
  private readonly cardViews = viewChildren(TraceCardView);
  private readonly overlay = viewChild(CdkConnectedOverlay);
  private readonly sheetTemplate = viewChild.required<TemplateRef<unknown>>('sheet');
  private sheetRef: MatBottomSheetRef | null = null;
  protected readonly anchor = signal<HTMLElement | null>(null);
  private drag: {
    x: number;
    y: number;
    left: number;
    top: number;
    moved: boolean;
    background: boolean;
    mouse: boolean;
  } | null = null;
  protected readonly dragging = signal(false);

  constructor() {
    queueMicrotask(() => this.initialZoom());
  }

  private initialZoom(): void {
    if (this.fitted) return;
    this.fitted = true;
    if (this.wide) this.fit();
    else this.zoom.set(readZoom() ?? 1);
  }

  // ---- Opacity and texts ----
  protected opacityOf(id: string): number {
    return cardOpacity(id, this.hoverChain(), this.chain());
  }

  protected linkOpacityOf(link: ReturnType<typeof layoutTrace>['links'][number]): number {
    return linkOpacity(link, this.hoverChain(), this.chain());
  }

  protected showLabel(link: ReturnType<typeof layoutTrace>['links'][number]): boolean {
    if (!link.label) return false;
    // §4.5: raw material quantities only on the highlighted chain.
    return link.type !== 'material' || !!this.chain()?.links.has(link.id);
  }

  protected groupHighlighted(group: TraceGroupBox): boolean {
    const chain = this.chain() ?? this.hoverChain();
    return !chain || group.cardIds.some((id) => chain.cards.has(id));
  }

  protected groupPercent(group: TraceGroupBox): number {
    const o = group.order;
    return o && o.plannedQty > 0 ? Math.min(100, (o.producedQty / o.plannedQty) * 100) : 0;
  }

  // ---- Selection ----
  protected select(card: TraceCard, event?: Event): void {
    if (this.drag?.moved) return;
    event?.stopPropagation();
    const current = this.selection();
    if (current?.key === card.id && this.detailOpen()) {
      // §5.2: a click on the same card closes the ficha and keeps the highlight.
      this.closeDetail();
      return;
    }
    this.selection.set({ key: card.id, seeds: [card.id], target: { kind: 'card', card } });
    this.openDetail(this.cardButton(card.id));
  }

  protected selectGroup(group: TraceGroupBox, event: Event): void {
    event.stopPropagation();
    const current = this.selection();
    if (current?.key === group.id && this.detailOpen()) {
      this.closeDetail();
      return;
    }
    this.selection.set({ key: group.id, seeds: group.cardIds, target: { kind: 'group', group } });
    this.openDetail(event.currentTarget as HTMLElement);
  }

  /** Bitácora → Mapa: selects the card, brings it into view and opens its ficha. */
  focusCard(id: string): void {
    const card = this.layout().cards.find((c) => c.id === id);
    const button = this.cardButton(id);
    if (!card || !button) return;
    button.scrollIntoView?.({ block: 'center', inline: 'center' });
    button.focus({ preventScroll: true });
    this.selection.set({ key: card.id, seeds: [card.id], target: { kind: 'card', card } });
    this.openDetail(button);
  }

  protected clearSelection(): void {
    this.closeDetail(false);
    this.selection.set(null);
  }

  private openDetail(anchor: HTMLElement | null): void {
    if (anchor)
      this.positions.set(fichaPositions(anchor.getBoundingClientRect(), window.innerWidth));
    this.anchor.set(anchor);
    this.detailOpen.set(true);
    if (this.mobile()) {
      this.sheetRef?.dismiss();
      const ref = this.sheet.open(this.sheetTemplate(), {
        panelClass: 'trace-sheet',
        ariaLabel: 'Detalle',
        maxHeight: '82vh',
      });
      this.sheetRef = ref;
      ref.afterDismissed().subscribe(() => {
        if (this.sheetRef === ref) {
          this.sheetRef = null;
          this.closeDetail();
        }
      });
    }
  }

  protected closeDetail(restoreFocus = true): void {
    if (!this.detailOpen()) return;
    this.detailOpen.set(false);
    const ref = this.sheetRef;
    this.sheetRef = null;
    ref?.dismiss();
    if (restoreFocus) {
      // §5.4: the focus goes back to the card (or the group header) of the ficha.
      const key = this.selection()?.key;
      const target = key ? (this.cardButton(key) ?? this.groupButton(key)) : null;
      queueMicrotask(() => target?.focus());
    }
  }

  /** Esc: first the ficha, then the selection. */
  protected escape(): void {
    if (this.detailOpen()) this.closeDetail();
    else if (this.selection()) this.selection.set(null);
  }

  /** The overlay hears every keydown of the page: Esc inside the map is already handled by the host. */
  protected overlayKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || this.host.nativeElement.contains(event.target as Node)) return;
    this.escape();
  }

  protected outsideClick(event: MouseEvent): void {
    // Inside the map the cards, the group headers, the background and the controls handle their own clicks.
    if (this.host.nativeElement.contains(event.target as Node)) return;
    this.closeDetail(false);
  }

  private cardButton(id: string): HTMLButtonElement | null {
    return (
      this.cardViews()
        .find((v) => v.card().id === id)
        ?.button() ?? null
    );
  }

  private groupButton(id: string): HTMLElement | null {
    return this.viewport().nativeElement.querySelector<HTMLElement>(
      `[data-group="${CSS.escape(id)}"]`,
    );
  }

  // ---- Keyboard (§5.4) ----
  protected cardKey(event: KeyboardEvent, card: TraceCard): void {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const next = neighbour(this.layout(), card.id, event.key as 'ArrowLeft');
    const button = next ? this.cardButton(next) : null;
    button?.focus();
    button?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  // ---- Zoom ----
  protected zoomBy(step: number): void {
    this.setZoom(Math.round((this.zoom() + step) * 10) / 10);
  }

  protected fit(): void {
    const width = this.viewport().nativeElement.clientWidth;
    this.setZoom(Math.floor((width / this.layout().width) * 100) / 100);
  }

  protected setZoom(value: number): void {
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
    this.zoom.set(zoom);
    saveZoom(zoom);
    queueMicrotask(() => this.reposition());
  }

  protected reposition(): void {
    this.overlay()?.overlayRef?.updatePosition();
  }

  // ---- Drag (§5.1): mouse only; touch scrolls natively ----
  protected pointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    const element = this.viewport().nativeElement;
    const background = !(event.target as HTMLElement).closest('app-trace-card, .group-head');
    this.drag = {
      x: event.clientX,
      y: event.clientY,
      left: element.scrollLeft,
      top: element.scrollTop,
      moved: false,
      background,
      mouse: event.pointerType === 'mouse',
    };
  }

  /** The browser took a touch to scroll: it is not a tap. */
  protected pointerCancel(): void {
    this.drag = null;
    this.dragging.set(false);
  }

  protected pointerMove(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag?.mouse) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) <= 3) return;
    if (!drag.moved) {
      drag.moved = true;
      this.dragging.set(true);
    }
    const element = this.viewport().nativeElement;
    element.scrollLeft = drag.left - dx;
    element.scrollTop = drag.top - dy;
  }

  protected pointerUp(): void {
    const drag = this.drag;
    this.dragging.set(false);
    // A click on the background of the map removes the selection (§5.2); a drag is not a click.
    if (drag && !drag.moved && drag.background) this.clearSelection();
    // The card click comes after pointerup: keep `moved` until then.
    setTimeout(() => (this.drag = null));
  }

  protected readonly formatQty = formatQty;
}
