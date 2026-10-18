import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Notifier } from '../../../core/http/notifier';
import { RecordDialogService } from '../../../shared/components/record-dialog/record-dialog';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { CustomersApi, DeliveryPoint } from '../data-access/sales-api';

/** Tab "Puntos de entrega" of a customer (frontend §7.7): its addresses, added and edited in a dialog. */
@Component({
  selector: 'app-delivery-points',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, StatusTag],
  template: `
    <section class="pan-card" aria-labelledby="delivery-points">
      <div class="head">
        <h2 id="delivery-points">Puntos de entrega</h2>
        @if (canManage()) {
          <button matButton="filled" type="button" (click)="open(null)">
            <mat-icon>add</mat-icon>
            Agregar punto
          </button>
        }
      </div>
      <ul class="points">
        @for (point of points.value(); track point.id) {
          <li [class.inactive]="!point.isActive">
            <div>
              <strong>{{ point.name }}</strong>
              <span class="muted">{{ point.address ?? 'Sin dirección' }}</span>
            </div>
            <app-status-tag
              [text]="point.isActive ? 'Activo' : 'Inactivo'"
              [color]="point.isActive ? 'green' : 'grey'"
            />
            @if (canManage()) {
              <button
                matIconButton
                type="button"
                [attr.aria-label]="'Editar ' + point.name"
                (click)="open(point)"
              >
                <mat-icon>edit</mat-icon>
              </button>
            }
          </li>
        } @empty {
          <li class="muted">Este cliente todavía no tiene puntos de entrega.</li>
        }
      </ul>
    </section>
  `,
  styles: `
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;

      h2 {
        margin: 0;
        font: var(--mat-sys-title-medium);
        font-weight: 700;
      }
    }

    .points {
      margin: 0;
      padding: 0;
      list-style: none;

      li {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px 16px;
        padding: 8px 0;
        border-bottom: 1px solid var(--pan-row-divider);

        div {
          display: flex;
          flex: 1 1 220px;
          flex-direction: column;
        }
      }
    }

    .muted {
      color: var(--mat-sys-on-surface-variant);
    }

    .inactive strong {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class DeliveryPoints {
  readonly customerId = input.required<string>();
  readonly canManage = input(false);

  private readonly api = inject(CustomersApi);
  private readonly dialogs = inject(RecordDialogService);
  private readonly notifier = inject(Notifier);

  protected readonly points = rxResource({
    params: () => this.customerId(),
    stream: ({ params }) => this.api.points(params),
    defaultValue: [],
  });

  protected async open(point: DeliveryPoint | null): Promise<void> {
    const saved = await this.dialogs.open<DeliveryPoint>({
      title: point ? `Editar ${point.name}` : 'Nuevo punto de entrega',
      fields: [
        { key: 'name', label: 'Nombre', type: 'text', required: true, maxLength: 150 },
        { key: 'address', label: 'Dirección', type: 'textarea', maxLength: 300 },
        ...(point ? [{ key: 'isActive', label: 'Activo', type: 'toggle' as const }] : []),
      ],
      value: point
        ? { name: point.name, address: point.address, isActive: point.isActive }
        : { name: '', address: '' },
      saveLabel: point ? 'Guardar' : 'Agregar',
      save: (value) => {
        const name = String(value['name'] ?? '').trim();
        const address = String(value['address'] ?? '').trim() || null;
        return point
          ? this.api.updatePoint(this.customerId(), point.id, {
              version: point.version,
              name,
              address,
              isActive: !!value['isActive'],
            })
          : this.api.addPoint(this.customerId(), { name, address });
      },
    });
    if (!saved) return;
    this.notifier.info(point ? 'Punto de entrega actualizado.' : 'Punto de entrega agregado.');
    this.points.reload();
  }
}
