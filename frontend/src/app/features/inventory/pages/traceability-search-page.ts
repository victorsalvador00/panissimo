import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { Observable, catchError, of } from 'rxjs';
import { LookupPicker } from '../../../shared/components/lookup-picker/lookup-picker';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { enumLabel } from '../../../shared/pipes/labels';
import {
  DIRECTION_SEGMENTS,
  SOURCE_SEGMENTS,
  TraceDirection,
  TraceSource,
  TraceabilityApi,
  defaultDirection,
} from '../data-access/traceability-api';

/**
 * /inventario/trazabilidad (trazabilidad §6.2): one field for a lot, OC, OP, transfer or shipment (folio or lot number)
 * and the direction, with the default of RN-100 for the chosen type.
 */
@Component({
  selector: 'app-traceability-search-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    PageHeader,
    LookupPicker,
  ],
  template: `
    <app-page-header title="Trazabilidad" />
    <section class="pan-card search">
      <p class="intro">
        Sigue un lote hacia atrás (proveedores, OC y cierres que lo originaron) o hacia adelante
        (lotes terminados, traspasos, sucursales y clientes). Busca por folio <strong>OC-</strong>,
        <strong>OP-</strong>, <strong>TR-</strong>, <strong>RM-</strong> o por número de lote.
      </p>
      <app-lookup-picker
        [formControl]="source"
        label="Lote, OC, OP, traspaso o remisión"
        placeholder="Folio o número de lote"
        [search]="search"
        [displayWith]="display"
        [describeWith]="describe"
      />
      <div class="direction">
        <span id="trace-direction-label">Dirección</span>
        <mat-button-toggle-group
          aria-labelledby="trace-direction-label"
          hideSingleSelectionIndicator
          [formControl]="direction"
        >
          <mat-button-toggle value="Backward">Hacia atrás</mat-button-toggle>
          <mat-button-toggle value="Forward">Hacia adelante</mat-button-toggle>
          <mat-button-toggle value="Both">Ambas</mat-button-toggle>
        </mat-button-toggle-group>
      </div>
      <div class="actions">
        <button matButton="filled" type="button" [disabled]="!chosen()" (click)="trace()">
          <mat-icon>account_tree</mat-icon>
          Rastrear
        </button>
      </div>
    </section>
  `,
  styles: `
    .search {
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-width: 720px;
    }

    .intro {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
    }

    .direction {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 16px;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
    }
  `,
})
export class TraceabilitySearchPage {
  private readonly api = inject(TraceabilityApi);
  private readonly router = inject(Router);
  protected readonly source = new FormControl<TraceSource | null>(null);
  protected readonly direction = new FormControl<TraceDirection>('Both', { nonNullable: true });
  protected readonly chosen = toSignal(this.source.valueChanges, { initialValue: null });

  protected readonly search = (q: string): Observable<TraceSource[]> =>
    q.trim().length < 2 ? of([]) : this.api.sources(q.trim()).pipe(catchError(() => of([])));
  protected readonly display = (s: TraceSource) => s.label;
  protected readonly describe = (s: TraceSource) => enumLabel('TraceSourceType', s.type);

  constructor() {
    // RN-100: choosing an entry point puts its default direction.
    this.source.valueChanges.pipe(takeUntilDestroyed()).subscribe((s) => {
      if (s) this.direction.setValue(defaultDirection(s.type));
    });
  }

  protected trace(): void {
    const s = this.source.value;
    if (!s) return;
    void this.router.navigate(['/inventario/trazabilidad', SOURCE_SEGMENTS[s.type], s.id], {
      queryParams: { direccion: DIRECTION_SEGMENTS[this.direction.value] },
    });
  }
}
