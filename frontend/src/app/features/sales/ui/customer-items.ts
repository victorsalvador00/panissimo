import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Notifier } from '../../../core/http/notifier';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { MxnPipe } from '../../../shared/pipes/pipes';
import { CustomerItem, CustomersApi } from '../data-access/sales-api';
import { CustomerItemDialog, CustomerItemDialogData } from './customer-item-dialog';

/**
 * Tab "Artículos" of a customer (frontend §7.7, D-06): the customer's code and informative price of the finished goods
 * it buys; they prefill its orders. Added and edited in a dialog.
 */
@Component({
  selector: 'app-customer-items',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButtonModule, MatIconModule, StatusTag, MxnPipe],
  template: `
    <section class="pan-card" aria-labelledby="customer-items">
      <div class="head">
        <h2 id="customer-items">Artículos del cliente</h2>
        @if (canManage()) {
          <button matButton="filled" type="button" (click)="open(null)">
            <mat-icon>add</mat-icon>
            Agregar artículo
          </button>
        }
      </div>
      <p class="muted">
        Su clave y un precio informativo; no es lista de precios ni factura (D-06).
      </p>
      <div class="table-wrap">
        <table aria-label="Artículos del cliente">
          <thead>
            <tr>
              <th scope="col">Artículo</th>
              <th scope="col">Clave del cliente</th>
              <th scope="col" class="end">Precio</th>
              <th scope="col">Estado</th>
              @if (canManage()) {
                <th scope="col"><span class="pan-sr-only">Acciones</span></th>
              }
            </tr>
          </thead>
          <tbody>
            @for (row of items.value(); track row.id) {
              <tr>
                <td>
                  <a class="row-link" [routerLink]="['/catalogos/articulos', row.itemId]">
                    {{ row.itemSku }}
                  </a>
                  {{ row.itemName }}
                </td>
                <td>{{ row.customerSku ?? '—' }}</td>
                <td class="end">
                  {{ row.price === null ? '—' : (row.price | mxn) + ' / ' + row.uomCode }}
                </td>
                <td>
                  <app-status-tag
                    [text]="row.isActive ? 'Activo' : 'Inactivo'"
                    [color]="row.isActive ? 'green' : 'grey'"
                  />
                </td>
                @if (canManage()) {
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
                <td colspan="5" class="muted">Sin artículos registrados para este cliente.</td>
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
      justify-content: space-between;
      gap: 8px;

      h2 {
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

    .end {
      text-align: right !important;
    }
  `,
})
export class CustomerItems {
  readonly customerId = input.required<string>();
  readonly canManage = input(false);

  private readonly api = inject(CustomersApi);
  private readonly dialog = inject(MatDialog);
  private readonly notifier = inject(Notifier);

  protected readonly items = rxResource({
    params: () => this.customerId(),
    stream: ({ params }) => this.api.items(params),
    defaultValue: [],
  });

  protected async open(row: CustomerItem | null): Promise<void> {
    const saved = await firstValueFrom(
      this.dialog
        .open<CustomerItemDialog, CustomerItemDialogData, CustomerItem>(CustomerItemDialog, {
          data: { customerId: this.customerId(), row },
          width: '480px',
          maxWidth: '95vw',
        })
        .afterClosed(),
    );
    if (!saved) return;
    this.notifier.info(row ? `${saved.itemSku} actualizado.` : `${saved.itemSku} agregado.`);
    this.items.reload();
  }
}
