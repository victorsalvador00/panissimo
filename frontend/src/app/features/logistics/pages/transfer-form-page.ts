import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { rxResource, takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, map, startWith } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { LocationContextService } from '../../../core/context/location-context.service';
import { Notifier } from '../../../core/http/notifier.service';
import { ItemPicker } from '../../../shared/components/item-picker/item-picker';
import { LineColumnDef, LinesEditor } from '../../../shared/components/lines-editor/lines-editor';
import {
  minLinesValidator,
  uniqueLinesValidator,
} from '../../../shared/components/lines-editor/lines-validators';
import { LocationPicker } from '../../../shared/components/location-picker/location-picker';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { QtyInput } from '../../../shared/components/qty-input/qty-input';
import { ItemLookupService } from '../../../shared/data-access/item-lookup.service';
import { LocationLookupService } from '../../../shared/data-access/location-lookup.service';
import { FormErrors } from '../../../shared/forms/form-errors.service';
import { LotSelect } from '../../inventory/ui/lot-select';
import { TransferDto, TransfersApi } from '../data-access/transfers.api';
import {
  createPlanLine,
  destinationOptions,
  PlanLine,
  toTransferLines,
} from '../ui/transfer-lines';

/**
 * Traspaso directo en borrador (spec frontend §7.4): origen, destino y líneas. Con `id` edita un
 * borrador existente (el origen ya no cambia). Se despacha desde el detalle.
 */
@Component({
  selector: 'app-transfer-form-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    PageHeader,
    LocationPicker,
    ItemPicker,
    QtyInput,
    LinesEditor,
    LineColumnDef,
    LotSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sgo-page sgo-stack">
      <app-page-header
        [title]="transfer() ? 'Editar traspaso ' + transfer()!.folio : 'Nuevo traspaso'"
        subtitle="Se guarda como borrador; el inventario se mueve al despachar."
        [crumbs]="[
          { label: 'Logística' },
          { label: 'Traspasos', url: '/logistica/traspasos' },
          { label: transfer()?.folio ?? 'Nuevo' },
        ]"
      />

      @if (id() && !transfer()) {
        <p class="muted">Cargando…</p>
      } @else {
        @if (transfer()?.branchOrderFolio; as orderFolio) {
          <p class="notice notice-info" role="status">
            Este traspaso surte el pedido {{ orderFolio }}: el destino no cambia y solo puedes
            reducir cantidades, quitar artículos o elegir lotes. No se puede pasar de lo aprobado ni
            agregar artículos que no estén en el pedido.
          </p>
        }
        <form [formGroup]="form" (ngSubmit)="submit()" novalidate class="sgo-stack">
          <mat-card appearance="outlined">
            <mat-card-content class="header">
              @if (transfer(); as t) {
                <div class="fixed">
                  <span class="label">Origen</span>
                  <strong>{{ t.from.code }} · {{ t.from.name }}</strong>
                </div>
              } @else {
                <app-location-picker formControlName="fromLocationId" label="Origen" />
              }
              <mat-form-field appearance="outline">
                <mat-label>Destino</mat-label>
                <mat-select formControlName="toLocationId">
                  @for (location of destinations(); track location.id) {
                    <mat-option [value]="location.id">
                      {{ location.code }} · {{ location.name }}
                    </mat-option>
                  } @empty {
                    <mat-option disabled>
                      No puedes enviar desde este origen (se requiere traspasos especiales).
                    </mat-option>
                  }
                </mat-select>
                <mat-error>Elige el destino.</mat-error>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Notas</mat-label>
                <input matInput formControlName="notes" autocomplete="off" />
              </mat-form-field>
            </mat-card-content>
          </mat-card>

          <mat-card appearance="outlined">
            <mat-card-content>
              <h2>Líneas</h2>
              <app-lines-editor [lines]="form.controls.lines" [createLine]="newLine" [minLines]="1">
                <ng-template
                  appLineColumn="Artículo"
                  [appLineColumnOf]="form.controls.lines"
                  let-line
                >
                  <app-item-picker
                    [formControl]="line.controls.item"
                    [showStock]="true"
                    [stockLocationId]="fromId()"
                    subscriptSizing="dynamic"
                  />
                </ng-template>
                <ng-template
                  appLineColumn="Cantidad"
                  width="170px"
                  [appLineColumnOf]="form.controls.lines"
                  let-line
                >
                  <app-qty-input
                    [formControl]="line.controls.quantity"
                    label="Cantidad"
                    [unit]="line.controls.item.value?.baseUomCode"
                    subscriptSizing="dynamic"
                  />
                </ng-template>
                <ng-template
                  appLineColumn="Lote"
                  width="300px"
                  [appLineColumnOf]="form.controls.lines"
                  let-line
                >
                  @if (line.controls.item.value; as item) {
                    @if (item.tracksLots) {
                      <app-lot-select
                        [control]="line.controls.lotId"
                        [locationId]="fromId()"
                        [itemId]="item.id"
                        [uom]="item.baseUomCode"
                      />
                    } @else {
                      <span class="none">Sin lotes</span>
                    }
                  }
                </ng-template>
              </app-lines-editor>
            </mat-card-content>
          </mat-card>

          <div class="sgo-row">
            <button mat-flat-button type="submit" [disabled]="saving()">Guardar borrador</button>
            <a mat-button [routerLink]="backLink()">Cancelar</a>
          </div>
        </form>
      }
    </section>
  `,
  styles: `
    h2 {
      margin: 0 0 var(--sgo-space-3);
      font: var(--mat-sys-title-medium);
    }
    .header {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      align-items: start;
      gap: 0 var(--sgo-space-4);
    }
    .fixed {
      display: grid;
      padding-block: var(--sgo-space-2) var(--sgo-space-4);
    }
    .label,
    .none,
    .muted {
      color: var(--mat-sys-on-surface-variant);
    }
    .label {
      font: var(--mat-sys-body-small);
    }
    .none {
      display: inline-block;
      padding-top: var(--sgo-space-4);
    }
  `,
})
export class TransferFormPage {
  private readonly api = inject(TransfersApi);
  private readonly itemLookup = inject(ItemLookupService);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  private readonly formErrors = inject(FormErrors);
  private readonly canSpecial = inject(AuthService).can('logistics.transfers.special');

  /** Borrador a editar (ruta `:id/editar`); sin él, traspaso nuevo. */
  readonly id = input<string>();

  protected readonly saving = signal(false);
  protected readonly transfer = signal<TransferDto | null>(null);

  protected readonly form = new FormGroup({
    fromLocationId: new FormControl<string | null>(
      inject(LocationContextService).activeLocationId(),
      Validators.required,
    ),
    toLocationId: new FormControl<string | null>(null, Validators.required),
    notes: new FormControl('', { nonNullable: true, validators: Validators.maxLength(500) }),
    lines: new FormArray<PlanLine>([], {
      validators: [minLinesValidator(1), uniqueLinesValidator('item', 'lotId')],
    }),
  });

  protected readonly fromId = toSignal(
    this.form.controls.fromLocationId.valueChanges.pipe(
      startWith(this.form.controls.fromLocationId.value),
    ),
    { initialValue: this.form.controls.fromLocationId.value },
  );

  private readonly locationLookup = inject(LocationLookupService);
  private readonly locations = rxResource({ stream: () => this.locationLookup.all() });
  protected readonly destinations = computed(() => {
    const all = this.locations.value() ?? [];
    return destinationOptions(
      all,
      all.find((location) => location.id === this.fromId()),
      this.canSpecial,
    );
  });

  protected readonly newLine = () => createPlanLine();
  protected readonly backLink = computed(() => {
    const id = this.transfer()?.id;
    return id ? ['/logistica/traspasos', id] : ['/logistica/traspasos'];
  });

  constructor() {
    // Otro origen: el destino y los lotes elegidos pueden ya no aplicar.
    this.form.controls.fromLocationId.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.form.controls.lines.controls.forEach((line) => line.controls.lotId.setValue(null));
    });
    effect(() => {
      const destinations = this.destinations();
      untracked(() => {
        const to = this.form.controls.toLocationId;
        if (to.value && destinations.length && !destinations.some((d) => d.id === to.value)) {
          to.setValue(null);
        }
      });
    });
    effect(() => {
      const id = this.id();
      untracked(() => (id ? this.load(id) : this.form.controls.lines.push(createPlanLine())));
    });
  }

  private load(id: string): void {
    this.api.get(id).subscribe((transfer) => {
      const itemIds = [...new Set(transfer.lines.map((line) => line.itemId))];
      forkJoin(itemIds.map((itemId) => this.itemLookup.byId(itemId)))
        .pipe(map((items) => new Map(items.filter((i) => !!i).map((i) => [i.id, i]))))
        .subscribe((items) => {
          this.form.patchValue({
            fromLocationId: transfer.from.id,
            toLocationId: transfer.to.id,
            notes: transfer.notes ?? '',
          });
          // RN-20: el traspaso de un pedido conserva su destino.
          if (transfer.branchOrderId) {
            this.form.controls.toLocationId.disable();
          }
          this.form.controls.lines.clear();
          transfer.lines.forEach((line) =>
            this.form.controls.lines.push(
              createPlanLine({
                item: items.get(line.itemId) ?? null,
                quantity: line.shippedQty,
                lotId: line.lotId,
              }),
            ),
          );
          this.transfer.set(transfer);
        });
    });
  }

  protected submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const lines = toTransferLines(value.lines);
    const notes = value.notes.trim() || null;
    const existing = this.transfer();
    this.saving.set(true);
    const request$ = existing
      ? this.api.update(existing.id, {
          version: existing.version,
          toLocationId: value.toLocationId!,
          notes,
          lines,
        })
      : this.api.create({
          fromLocationId: value.fromLocationId!,
          toLocationId: value.toLocationId!,
          notes,
          lines,
        });
    request$.subscribe({
      next: (transfer) => {
        this.saving.set(false);
        this.notifier.success(`Traspaso ${transfer.folio} guardado como borrador.`);
        void this.router.navigate(['/logistica/traspasos', transfer.id]);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.formErrors.handle(error, this.form, {
          reload: () => existing && this.load(existing.id),
        });
      },
    });
  }
}
