import { DatePipe } from '@angular/common';
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
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { Observable, firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { Notifier } from '../../../core/http/notifier';
import { BreadcrumbsService } from '../../../core/layout/breadcrumbs.service';
import { ConfirmService } from '../../../shared/components/confirm-summary/confirm-summary';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { QtyInput } from '../../../shared/components/qty-input/qty-input';
import { ReasonService } from '../../../shared/components/reason-dialog/reason-dialog';
import { Stamp } from '../../../shared/components/stamp/stamp';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { QtyPipe, formatQty } from '../../../shared/pipes/pipes';
import { BranchOrder, BranchOrdersApi } from '../data-access/logistics-api';
import { BranchOrderAction, branchOrderActions, checkApproval } from '../ui/branch-order-rules';

/**
 * /logistica/pedidos/:id (frontend §7.5, RN-20): requested, approved and shipped per line, the linked transfers ("Ir a
 * despachar") and the rejection reason. **Approving** happens here: the plant's stock per line and the approved
 * quantity (0 to the requested, a warning above the stock, never everything in 0); rejecting asks for a reason.
 */
@Component({
  selector: 'app-branch-order-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    PageHeader,
    QtyInput,
    StatusTag,
    Stamp,
    QtyPipe,
  ],
  template: `
    @if (order(); as o) {
      <app-page-header [title]="'Pedido ' + o.folio">
        <app-status-tag [value]="o.status" kind="BranchOrderStatus" />
      </app-page-header>

      <div class="layout" [class.pan-has-action-bar]="actions().length > 0">
        <section class="pan-card">
          <dl class="data">
            <dt>Sucursal</dt>
            <dd>{{ o.requestingLocation.name }}</dd>
            <dt>Surte</dt>
            <dd>{{ o.supplyingLocation.name }}</dd>
            <dt>Se necesita</dt>
            <dd>{{ o.requiredDate | date: 'dd/MM/yyyy' }}</dd>
            @if (o.notes) {
              <dt>Notas</dt>
              <dd>{{ o.notes }}</dd>
            }
            <dt>Creado</dt>
            <dd><app-stamp [at]="o.createdAt" [by]="o.createdByName" /></dd>
            @if (o.submittedAt) {
              <dt>Enviado</dt>
              <dd><app-stamp [at]="o.submittedAt" [by]="o.submittedByName" /></dd>
            }
            @if (o.approvedAt) {
              <dt>Aprobado</dt>
              <dd><app-stamp [at]="o.approvedAt" [by]="o.approvedByName" /></dd>
            }
            @if (o.rejectedAt) {
              <dt>Rechazado</dt>
              <dd>
                <app-stamp [at]="o.rejectedAt" [by]="o.rejectedByName" /> · {{ o.rejectionReason }}
              </dd>
            }
            @if (o.transfers.length > 0) {
              <dt>Traspasos</dt>
              <dd class="transfers">
                @for (transfer of o.transfers; track transfer.id) {
                  <span>
                    <a class="row-link" [routerLink]="['/logistica/traspasos', transfer.id]">
                      {{ transfer.folio }}
                    </a>
                    <app-status-tag [value]="transfer.status" kind="TransferStatus" />
                    @if (transfer.status === 'Draft' && canDispatch) {
                      <a matButton="tonal" [routerLink]="['/logistica/traspasos', transfer.id]">
                        Ir a despachar
                      </a>
                    }
                  </span>
                }
              </dd>
            }
          </dl>
        </section>

        <section class="pan-card" aria-labelledby="order-lines">
          <h2 id="order-lines">{{ approving() ? 'Aprobar artículos' : 'Artículos' }}</h2>
          @if (approving()) {
            <p class="muted">
              Aprueba de 0 a lo solicitado; aprobar no aparta existencia. Para no surtir nada,
              rechaza el pedido.
            </p>
          }
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Artículo</th>
                  <th scope="col" class="end">Solicitado</th>
                  @if (approving()) {
                    <th scope="col" class="end">En la Planta</th>
                    <th scope="col" class="end">Aprobar</th>
                  } @else {
                    <th scope="col" class="end">Aprobado</th>
                    <th scope="col" class="end">Despachado</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (line of o.lines; track line.id; let i = $index) {
                  <tr>
                    <td>
                      <strong>{{ line.sku }}</strong> {{ line.itemName }}
                    </td>
                    <td class="end">{{ line.requestedQty | qty: line.uomCode }}</td>
                    @if (approving()) {
                      <td class="end" [class.exit]="aboveStock(i)">
                        {{ line.supplyingStock | qty: line.uomCode }}
                      </td>
                      <td class="approve">
                        <app-qty-input
                          [formControl]="approved()[i]"
                          [unit]="line.uomCode"
                          [max]="line.requestedQty"
                          allowZero
                          [ariaLabel]="'Aprobar de ' + line.sku"
                        />
                        @if (aboveStock(i)) {
                          <span class="warning">Pasa de la existencia de la Planta.</span>
                        }
                      </td>
                    } @else {
                      <td class="end">
                        {{
                          line.approvedQty === null ? '—' : (line.approvedQty | qty: line.uomCode)
                        }}
                      </td>
                      <td class="end">{{ line.shippedQty | qty: line.uomCode }}</td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (approving() && check().allZero) {
            <p class="error" role="alert">
              No se aprueba todo en 0: para no surtir nada, rechaza el pedido con su motivo.
            </p>
          }
        </section>
      </div>

      @if (actions().length > 0) {
        <div class="pan-action-bar">
          @if (approving()) {
            <button matButton type="button" (click)="approving.set(false)">Volver</button>
            <button matButton="filled" type="button" [disabled]="busy()" (click)="approve(o)">
              Confirmar aprobación
            </button>
          } @else {
            @if (has('cancel')) {
              <button matButton type="button" [disabled]="busy()" (click)="cancel(o)">
                Cancelar pedido
              </button>
            }
            @if (has('edit')) {
              <a matButton="tonal" routerLink="editar">
                <mat-icon>edit</mat-icon>
                Editar
              </a>
            }
            @if (has('submit')) {
              <button matButton="filled" type="button" [disabled]="busy()" (click)="submit(o)">
                Enviar a la Planta
              </button>
            }
            @if (has('reject')) {
              <button matButton="tonal" type="button" [disabled]="busy()" (click)="reject(o)">
                Rechazar
              </button>
            }
            @if (has('approve')) {
              <button matButton="filled" type="button" (click)="startApproval(o)">Aprobar</button>
            }
          }
        </div>
      }
    } @else if (resource.isLoading()) {
      <p role="status">Cargando…</p>
    }
  `,
  styles: `
    .layout {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    h2 {
      margin: 0 0 12px;
      font: var(--mat-sys-title-medium);
      font-weight: 700;
    }

    .data {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 8px 16px;
      margin: 0;

      dt {
        color: var(--mat-sys-on-surface-variant);
      }

      dd {
        margin: 0;
      }
    }

    .transfers span {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 12px;
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

    .approve {
      min-width: 150px;
    }

    .end {
      text-align: right !important;
    }

    .muted {
      margin: 0 0 8px;
      color: var(--mat-sys-on-surface-variant);
    }

    .exit {
      color: var(--pan-status-red-fg);
      font-weight: 600;
    }

    .warning {
      display: block;
      color: var(--pan-status-orange-fg);
      font: var(--mat-sys-body-small);
      font-weight: 600;
    }

    .error {
      margin: 8px 0 0;
      color: var(--mat-sys-error);
      font-weight: 600;
    }
  `,
})
export class BranchOrderDetailPage {
  readonly id = input.required<string>();

  private readonly api = inject(BranchOrdersApi);
  private readonly auth = inject(AuthService);
  private readonly confirmService = inject(ConfirmService);
  private readonly reasons = inject(ReasonService);
  private readonly notifier = inject(Notifier);
  private readonly breadcrumbs = inject(BreadcrumbsService);
  protected readonly canDispatch = this.auth.can('logistics.transfers.dispatch');
  protected readonly busy = signal(false);
  protected readonly approving = signal(false);
  /** Approved quantity per line while approving. */
  protected readonly approved = signal<FormControl<number | null>[]>([]);
  /** Bumps on every edit of an approved quantity. */
  private readonly edits = signal(0);

  protected readonly resource = rxResource({
    params: () => this.id(),
    stream: ({ params }) => this.api.get(params),
  });
  protected readonly order = computed(() =>
    this.resource.hasValue() ? this.resource.value() : null,
  );
  protected readonly actions = computed(() => {
    const o = this.order();
    return o ? branchOrderActions(o.status, (p) => this.auth.can(p)) : [];
  });
  protected readonly check = computed(() => {
    this.edits();
    const o = this.order();
    const approved = this.approved();
    return checkApproval(
      (o?.lines ?? []).map((line, i) => ({
        requestedQty: line.requestedQty,
        approvedQty: approved[i]?.value ?? null,
        supplyingStock: line.supplyingStock,
      })),
    );
  });

  constructor() {
    effect(() => {
      const o = this.order();
      if (o) this.breadcrumbs.setCurrent(o.folio);
    });
  }

  protected has(action: BranchOrderAction): boolean {
    return this.actions().includes(action);
  }

  protected aboveStock(index: number): boolean {
    return this.check().aboveStock.includes(index);
  }

  /** The approved quantities start with what was requested. */
  protected startApproval(o: BranchOrder): void {
    this.approved.set(
      o.lines.map((line) => {
        const control = new FormControl<number | null>(line.requestedQty);
        control.valueChanges.subscribe(() => this.edits.update((n) => n + 1));
        return control;
      }),
    );
    this.approving.set(true);
  }

  protected async approve(o: BranchOrder): Promise<void> {
    const check = this.check();
    const approved = this.approved();
    if (check.allZero || check.outOfRange.length > 0 || approved.some((c) => c.invalid)) {
      approved.forEach((c) => c.markAsTouched());
      return;
    }
    const confirmed = await this.confirmService.confirm({
      title: 'Aprobar pedido',
      message:
        'Se crea un traspaso en borrador de la Planta a la sucursal con lo aprobado; la existencia no se aparta hasta despacharlo.',
      summary: o.lines.map((line, i) => ({
        label: line.sku,
        value: `${formatQty(approved[i].value, line.uomCode)} de ${formatQty(line.requestedQty, line.uomCode)}`,
      })),
      confirmLabel: 'Aprobar',
    });
    if (!confirmed) return;
    const approvedOk = await this.run(
      this.api.approve(o.id, {
        version: o.version,
        lines: o.lines.map((line, i) => ({ lineId: line.id, approvedQty: approved[i].value ?? 0 })),
      }),
      `Pedido ${o.folio} aprobado: su traspaso está listo para despachar.`,
    );
    if (approvedOk) this.approving.set(false);
  }

  protected async submit(o: BranchOrder): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Enviar pedido a la Planta',
      message: 'Ya no se edita; la Planta lo aprueba o lo rechaza.',
      summary: o.lines.map((line) => ({
        label: line.sku,
        value: formatQty(line.requestedQty, line.uomCode),
      })),
      confirmLabel: 'Enviar',
    });
    if (confirmed) await this.run(this.api.submit(o.id, o.version), `Pedido ${o.folio} enviado.`);
  }

  protected async reject(o: BranchOrder): Promise<void> {
    const reason = await this.reasons.ask({
      title: `Rechazar ${o.folio}`,
      message: 'La sucursal verá el motivo.',
      confirmLabel: 'Rechazar',
    });
    if (reason)
      await this.run(this.api.reject(o.id, o.version, reason), `Pedido ${o.folio} rechazado.`);
  }

  protected async cancel(o: BranchOrder): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Cancelar pedido',
      message: `El pedido ${o.folio} queda cancelado; no se puede deshacer.`,
      confirmLabel: 'Cancelar pedido',
      cancelLabel: 'Volver',
      destructive: true,
    });
    if (confirmed) await this.run(this.api.cancel(o.id, o.version), `Pedido ${o.folio} cancelado.`);
  }

  /** Runs an action and shows the order it returns (errors open their dialog from the interceptor). */
  private async run(action: Observable<BranchOrder>, message: string): Promise<boolean> {
    this.busy.set(true);
    try {
      this.resource.set(await firstValueFrom(action));
      this.notifier.info(message);
      return true;
    } catch {
      this.resource.reload();
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}
