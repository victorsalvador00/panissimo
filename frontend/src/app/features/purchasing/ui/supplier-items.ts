import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Notifier } from '../../../core/http/notifier';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { MxnPipe, StatusLabelPipe } from '../../../shared/pipes/pipes';
import { SupplierItem, SuppliersApi } from '../data-access/purchasing-api';
import { SupplierItemDialog, SupplierItemDialogData } from './supplier-item-dialog';

/**
 * Tab "Artículos" of a supplier (frontend §7.6): code, price per purchase unit and per base unit, lead time and
 * preferred. Adding and editing in a dialog; an inactive supplier's rows are not edited until it is reactivated.
 */
@Component({
  selector: 'app-supplier-items',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    StatusTag,
    MxnPipe,
    StatusLabelPipe,
  ],
  template: `
    <section class="pan-card" aria-labelledby="supplier-items">
      <div class="head">
        <h2 id="supplier-items">Artículos que vende</h2>
        <mat-slide-toggle [checked]="showInactive()" (change)="showInactive.set($event.checked)">
          Mostrar inactivos
        </mat-slide-toggle>
        @if (editable()) {
          <button matButton="filled" type="button" (click)="open(null)">
            <mat-icon>add</mat-icon>
            Agregar artículo
          </button>
        }
      </div>
      @if (!supplierActive()) {
        <p class="muted">El proveedor está inactivo: reactívalo para editar su catálogo.</p>
      }
      <div class="table-wrap">
        <table aria-label="Artículos del proveedor">
          <thead>
            <tr>
              <th scope="col">Artículo</th>
              <th scope="col">Clave</th>
              <th scope="col" class="end">Precio por unidad de compra</th>
              <th scope="col" class="end">Por unidad base</th>
              <th scope="col" class="end">Entrega</th>
              <th scope="col">Preferido</th>
              <th scope="col">Estado</th>
              @if (editable()) {
                <th scope="col"><span class="pan-sr-only">Acciones</span></th>
              }
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track row.id) {
              <tr [class.inactive]="!row.isActive">
                <td>
                  <a class="row-link" [routerLink]="['/catalogos/articulos', row.itemId]">
                    {{ row.itemSku }}
                  </a>
                  {{ row.itemName }}
                  <span class="muted">· {{ row.itemType | statusLabel: 'ItemType' }}</span>
                </td>
                <td>{{ row.supplierSku ?? '—' }}</td>
                <td class="end">
                  {{ row.price | mxn }} / {{ row.purchaseUomCode ?? row.baseUomCode }}
                </td>
                <td class="end">{{ row.pricePerBaseUnit | mxn }} / {{ row.baseUomCode }}</td>
                <td class="end">
                  {{ row.leadTimeDays }} {{ row.leadTimeDays === 1 ? 'día' : 'días' }}
                </td>
                <td>
                  @if (row.isPreferred) {
                    <app-status-tag text="Preferido" color="green" />
                  }
                </td>
                <td>
                  <app-status-tag
                    [text]="row.isActive ? 'Activo' : 'Inactivo'"
                    [color]="row.isActive ? 'green' : 'grey'"
                  />
                </td>
                @if (editable()) {
                  <td class="end">
                    <button
                      matIconButton
                      type="button"
                      [attr.aria-label]="'Editar ' + row.itemSku"
                      (click)="open(row)"
                    >
                      <mat-icon>edit</mat-icon>
                    </button>
                  </td>
                }
              </tr>
            } @empty {
              <tr>
                <td colspan="8" class="muted">Este proveedor todavía no tiene artículos.</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>
  `,
  styles: `
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 16px;
      margin-bottom: 8px;

      h2 {
        flex: 1;
        margin: 0;
        font: var(--mat-sys-title-medium);
        font-weight: 700;
      }
    }

    .muted {
      color: var(--mat-sys-on-surface-variant);
    }

    .table-wrap {
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;

      th,
      td {
        padding: 8px;
        border-bottom: 1px solid var(--pan-row-divider);
        text-align: left;
      }

      th {
        color: var(--mat-sys-on-surface-variant);
        font: var(--mat-sys-label-large);
      }
    }

    .inactive td {
      color: var(--mat-sys-on-surface-variant);
    }

    .end {
      text-align: right !important;
    }
  `,
})
export class SupplierItems {
  readonly supplierId = input.required<string>();
  readonly supplierActive = input.required<boolean>();
  readonly canManage = input(false);

  private readonly api = inject(SuppliersApi);
  private readonly dialog = inject(MatDialog);
  private readonly notifier = inject(Notifier);
  protected readonly showInactive = signal(false);
  protected readonly editable = computed(() => this.canManage() && this.supplierActive());

  protected readonly items = rxResource({
    params: () => this.supplierId(),
    stream: ({ params }) => this.api.items(params),
    defaultValue: [],
  });
  protected readonly rows = computed(() =>
    this.showInactive() ? this.items.value() : this.items.value().filter((r) => r.isActive),
  );

  protected async open(row: SupplierItem | null): Promise<void> {
    const saved = await firstValueFrom(
      this.dialog
        .open<SupplierItemDialog, SupplierItemDialogData, SupplierItem>(SupplierItemDialog, {
          data: { supplierId: this.supplierId(), row },
          width: '480px',
          maxWidth: '95vw',
        })
        .afterClosed(),
    );
    if (!saved) return;
    this.notifier.info(row ? `${saved.itemSku} actualizado.` : `${saved.itemSku} agregado.`);
    // Marking one preferred may unmark another row: read the whole catalog again.
    this.items.reload();
  }
}
