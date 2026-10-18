import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { Schemas } from '../../../core/api/api';
import { AuthService } from '../../../core/auth/auth.service';
import { LocationContextService } from '../../../core/context/location-context.service';
import { Notifier } from '../../../core/http/notifier';
import { BreadcrumbsService } from '../../../core/layout/breadcrumbs.service';
import { ItemOption, ItemPicker } from '../../../shared/components/item-picker/item-picker';
import {
  LineColumn,
  LinesEditor,
  minLinesValidator,
} from '../../../shared/components/lines-editor/lines-editor';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { QtyInput } from '../../../shared/components/qty-input/qty-input';
import { ItemLookupApi } from '../../../shared/data-access/item-lookup';
import { controlError } from '../../../shared/forms/control-error';
import { FormErrors } from '../../../shared/forms/form-errors';
import { LotSelect } from '../../inventory/ui/lot-select';
import { DestinationsApi, Transfer, TransfersApi } from '../data-access/logistics-api';
import { transferDestinations } from '../ui/transfer-rules';

type TransferLineForm = FormGroup<{
  item: FormControl<ItemOption | null>;
  quantity: FormControl<number | null>;
  lotId: FormControl<string | null>;
}>;

/**
 * /logistica/traspasos/nuevo and /:id/editar (frontend §7.5): the origin is the active location; the destination is
 * filtered by route (RN-25); lines with an optional planned lot (empty: first to expire when dispatching). Saves a
 * draft; dispatching is done from the detail.
 */
@Component({
  selector: 'app-transfer-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    PageHeader,
    LinesEditor,
    LineColumn,
    ItemPicker,
    QtyInput,
    LotSelect,
  ],
  template: `
    <app-page-header
      [title]="transfer() ? 'Editar traspaso ' + transfer()!.folio : 'Nuevo traspaso'"
    />

    @if (origin(); as origin) {
      @if (destinations().length > 0 || transfer()) {
        <form
          id="transfer-form"
          class="layout pan-has-action-bar"
          [formGroup]="form"
          (ngSubmit)="save()"
          novalidate
        >
          <section class="pan-card" aria-labelledby="transfer-data">
            <h2 id="transfer-data">Datos del traspaso</h2>
            <div class="fields">
              <mat-form-field>
                <mat-label>Origen</mat-label>
                <input matInput [value]="origin.name" disabled />
                <mat-hint>
                  {{
                    transfer()
                      ? 'No cambia al editar.'
                      : 'La ubicación activa; cámbiala en la barra superior.'
                  }}
                </mat-hint>
              </mat-form-field>
              <mat-form-field>
                <mat-label>Destino</mat-label>
                <mat-select formControlName="toLocationId">
                  @for (location of destinations(); track location.id) {
                    <mat-option [value]="location.id">{{ location.name }}</mat-option>
                  }
                </mat-select>
                @if (!special()) {
                  <mat-hint>De la Planta a una sucursal.</mat-hint>
                }
                <mat-error>{{ controlError(form.controls.toLocationId) }}</mat-error>
              </mat-form-field>
              <mat-form-field class="wide">
                <mat-label>Notas</mat-label>
                <input matInput formControlName="notes" />
                <mat-error>{{ controlError(form.controls.notes) }}</mat-error>
              </mat-form-field>
            </div>
          </section>

          <section class="pan-card" aria-labelledby="transfer-lines">
            <h2 id="transfer-lines">Artículos</h2>
            <app-lines-editor [lines]="lines" [newLine]="newLine" addLabel="Agregar artículo">
              <ng-template
                appLineColumn="item"
                header="Artículo"
                [appLineColumnOf]="lines"
                let-line
              >
                <app-item-picker [formControl]="line.controls.item" label="Artículo" />
              </ng-template>
              <ng-template
                appLineColumn="quantity"
                header="Cantidad"
                width="12rem"
                [appLineColumnOf]="lines"
                let-line
                let-i="index"
              >
                <app-qty-input
                  [formControl]="line.controls.quantity"
                  [unit]="line.controls.item.value?.baseUomCode ?? null"
                  [ariaLabel]="'Cantidad de la línea ' + (i + 1)"
                />
              </ng-template>
              <ng-template
                appLineColumn="lot"
                header="Lote planeado"
                width="18rem"
                [appLineColumnOf]="lines"
                let-line
              >
                @if (line.controls.item.value; as item) {
                  @if (item.tracksLots) {
                    <app-lot-select
                      [formControl]="line.controls.lotId"
                      [locationId]="origin.id"
                      [itemId]="item.id"
                      [unit]="item.baseUomCode"
                    />
                  } @else {
                    <span class="muted">Sin lotes.</span>
                  }
                }
              </ng-template>
            </app-lines-editor>
          </section>
        </form>

        <div class="pan-action-bar">
          <button matButton type="button" (click)="back()">Cancelar</button>
          <button matButton="filled" type="submit" form="transfer-form" [disabled]="saving()">
            Guardar borrador
          </button>
        </div>
      } @else {
        <p class="pan-card">
          Desde {{ origin.name }} no hay destinos permitidos: sin el permiso de traspasos
          especiales, los traspasos van de la Planta a una sucursal.
        </p>
      }
    } @else {
      <p class="pan-card">Elige una ubicación activa en la barra superior.</p>
    }
  `,
  styleUrl: './logistics-form.scss',
})
export class TransferFormPage {
  /** Present when editing a draft (`/:id/editar`). */
  readonly id = input<string>();

  private readonly api = inject(TransfersApi);
  private readonly itemLookup = inject(ItemLookupApi);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  private readonly formErrors = inject(FormErrors);
  private readonly breadcrumbs = inject(BreadcrumbsService);
  private readonly auth = inject(AuthService);
  private readonly destinationsApi = inject(DestinationsApi);
  private readonly active = inject(LocationContextService).active;
  protected readonly special = computed(() => this.auth.can('logistics.transfers.special'));
  protected readonly controlError = controlError;
  protected readonly saving = signal(false);
  protected readonly transfer = signal<Transfer | null>(null);

  /** Editing keeps the draft's origin; a new one leaves the active location. */
  protected readonly origin = computed(() => {
    const transfer = this.transfer();
    return transfer ? transfer.from : this.active();
  });

  private readonly locations = rxResource({
    stream: () => this.destinationsApi.list(),
    defaultValue: [],
  });
  protected readonly destinations = computed(() => {
    const origin = this.origin();
    return origin ? transferDestinations(origin, this.locations.value(), this.special()) : [];
  });

  protected readonly lines = new FormArray<TransferLineForm>([], minLinesValidator(1));
  protected readonly form = new FormGroup({
    toLocationId: new FormControl<string | null>(null, Validators.required),
    notes: new FormControl('', { nonNullable: true, validators: Validators.maxLength(500) }),
    lines: this.lines,
  });
  protected readonly newLine = () => this.createLine();

  constructor() {
    this.lines.push(this.createLine());
    effect(() => {
      const id = this.id();
      if (id) void this.load(id);
    });
  }

  protected back(): void {
    const transfer = this.transfer();
    void this.router.navigate(
      transfer ? ['/logistica/traspasos', transfer.id] : ['/logistica/traspasos'],
    );
  }

  protected async save(): Promise<void> {
    const origin = this.origin();
    if (this.form.invalid || !origin) {
      this.form.markAllAsTouched();
      return;
    }
    const { toLocationId, notes } = this.form.getRawValue();
    const lines: Schemas['TransferLineRequest'][] = this.lines.controls.map((line) => {
      const v = line.getRawValue();
      return {
        itemId: v.item!.id,
        lotId: v.item!.tracksLots ? v.lotId : null,
        quantity: v.quantity!,
      };
    });
    const transfer = this.transfer();

    this.saving.set(true);
    try {
      const saved = await firstValueFrom(
        transfer
          ? this.api.update(transfer.id, {
              version: transfer.version,
              toLocationId: toLocationId!,
              notes: notes.trim() || null,
              lines,
            })
          : this.api.create({
              fromLocationId: origin.id,
              toLocationId: toLocationId!,
              notes: notes.trim() || null,
              lines,
            }),
      );
      this.notifier.info(`Traspaso ${saved.folio} guardado.`);
      await this.router.navigate(['/logistica/traspasos', saved.id]);
    } catch (error) {
      this.formErrors.apply(this.form, error);
    } finally {
      this.saving.set(false);
    }
  }

  /** Fills the form with the draft; each line brings its item for the picker. */
  private async load(id: string): Promise<void> {
    const transfer = await firstValueFrom(this.api.get(id));
    const items = await Promise.all(
      transfer.lines.map((l) => firstValueFrom(this.itemLookup.byId(l.itemId))),
    );
    this.lines.clear();
    transfer.lines.forEach((line, i) => {
      const control = this.createLine();
      control.setValue({ item: items[i], quantity: line.shippedQty, lotId: line.lotId });
      this.lines.push(control);
    });
    this.form.patchValue({ toLocationId: transfer.to.id, notes: transfer.notes ?? '' });
    this.transfer.set(transfer);
    this.breadcrumbs.setCurrent(`Editar ${transfer.folio}`);
  }

  private createLine(): TransferLineForm {
    return new FormGroup({
      item: new FormControl<ItemOption | null>(null, Validators.required),
      quantity: new FormControl<number | null>(null, Validators.required),
      lotId: new FormControl<string | null>(null),
    });
  }
}
