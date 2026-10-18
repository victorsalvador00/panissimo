import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import type { Schemas } from '../../../core/api/api';
import { QtyInput } from '../../../shared/components/qty-input/qty-input';
import { QtyPipe } from '../../../shared/pipes/pipes';
import { StockApi } from '../data-access/inventory-api';

type LotQuantity = Schemas['LotQuantity'];

/** Sum of lot quantities rounded to the 4 decimals of the API. */
export function lotSplitTotal(lots: readonly LotQuantity[]): number {
  return Math.round(lots.reduce((sum, l) => sum + l.qty, 0) * 10_000) / 10_000;
}

/** Nothing chosen (first to expire), or exactly the target. */
export function lotSplitValid(lots: readonly LotQuantity[], target: number | null): boolean {
  return lots.length === 0 || lotSplitTotal(lots) === (target ?? 0);
}

/**
 * "Elegir lotes" (frontend §8): the lots with stock of an item at a location, each with its quantity. The split must add
 * up to `target`; empty, the posting takes the first to expire (FEFO). Two-way `chosen` with the lots of quantity > 0.
 */
@Component({
  selector: 'app-lot-split',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, ReactiveFormsModule, QtyInput, QtyPipe],
  template: `
    @if (lots.isLoading()) {
      <p class="muted" role="status">Cargando lotes…</p>
    } @else {
      @for (lot of withLot(); track lot.lotId) {
        <div class="lot">
          <span>
            {{ lot.lotNumber }}
            <span class="muted">
              @if (lot.expirationDate) {
                · caduca {{ lot.expirationDate | date: 'dd/MM/yyyy' }}
              }
              · hay {{ lot.quantity | qty: unit() }}
            </span>
          </span>
          <app-qty-input
            [formControl]="control(lot.lotId!)"
            [unit]="unit()"
            [max]="lot.quantity"
            [ariaLabel]="'Cantidad del lote ' + lot.lotNumber"
          />
        </div>
      } @empty {
        <p class="muted">No hay lotes con existencia.</p>
      }
      <p class="total" [class.error]="!valid()" aria-live="polite">
        Elegido {{ total() | qty: unit() }} de {{ target() | qty: unit() }}
        @if (!valid()) {
          · debe sumar {{ target() | qty: unit() }}
        }
      </p>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .lot {
      display: grid;
      grid-template-columns: 1fr minmax(120px, 160px);
      align-items: center;
      gap: 8px;
      padding-top: 4px;
    }

    .muted {
      color: var(--mat-sys-on-surface-variant);
    }

    .total {
      margin: 4px 0 0;

      &.error {
        color: var(--mat-sys-error);
      }
    }
  `,
})
export class LotSplit {
  readonly locationId = input.required<string>();
  readonly itemId = input.required<string>();
  readonly target = input<number | null>(null);
  readonly unit = input<string | null>(null);
  readonly chosen = model<LotQuantity[]>([]);

  private readonly stockApi = inject(StockApi);
  private readonly controls = new Map<string, FormControl<number | null>>();
  private key: string | null = null;

  protected readonly lots = rxResource({
    params: () => ({ locationId: this.locationId(), itemId: this.itemId() }),
    stream: ({ params }) => this.stockApi.lots(params.locationId, params.itemId),
    defaultValue: [],
  });
  protected readonly withLot = computed(() => this.lots.value().filter((l) => !!l.lotId));
  protected readonly total = computed(() => lotSplitTotal(this.chosen()));
  protected readonly valid = computed(() => lotSplitValid(this.chosen(), this.target()));

  constructor() {
    // Another location or item: the previous split no longer applies.
    effect(() => {
      const key = `${this.locationId()}|${this.itemId()}`;
      if (this.key !== null && this.key !== key) {
        this.controls.clear();
        this.chosen.set([]);
      }
      this.key = key;
    });
  }

  protected control(lotId: string): FormControl<number | null> {
    let control = this.controls.get(lotId);
    if (!control) {
      control = new FormControl<number | null>(
        this.chosen().find((l) => l.lotId === lotId)?.qty ?? null,
      );
      control.valueChanges.subscribe(() => this.publish());
      this.controls.set(lotId, control);
    }
    return control;
  }

  private publish(): void {
    this.chosen.set(
      [...this.controls]
        .filter(([, c]) => (c.value ?? 0) > 0)
        .map(([lotId, c]) => ({ lotId, qty: c.value! })),
    );
  }
}
