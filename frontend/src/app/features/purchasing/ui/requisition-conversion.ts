import { formatDate } from '@angular/common';
import { inject, Injectable, LOCALE_ID } from '@angular/core';
import { filter, Observable, switchMap, tap } from 'rxjs';
import { ConfirmService, ConflictHandler } from '../../../shared/components/dialogs.service';
import { formatMxn } from '../../../shared/pipes/mxn.pipe';
import { PurchaseOrderListItem, RequisitionsApi } from '../data-access/requisitions.api';

export interface ConvertibleRequisition {
  id: string;
  folio: string;
  location: { code: string };
  neededBy: string;
}

/**
 * Convierte requisiciones aprobadas en OC (RN-34): confirma con el resumen, convierte (todo o nada)
 * y muestra las OC en borrador que se crearon. Emite las OC solo si se convirtió; los errores ya
 * se avisaron (409 con su diálogo, 422 con el interceptor) y se reenvían a quien llama.
 */
@Injectable({ providedIn: 'root' })
export class RequisitionConversion {
  private readonly api = inject(RequisitionsApi);
  private readonly confirmService = inject(ConfirmService);
  private readonly conflicts = inject(ConflictHandler);
  private readonly locale = inject(LOCALE_ID);

  convert(
    requisitions: ConvertibleRequisition[],
    onConflict?: () => void,
  ): Observable<PurchaseOrderListItem[]> {
    const count = requisitions.length;
    return this.confirmService
      .confirm({
        title:
          count === 1
            ? `¿Convertir ${requisitions[0].folio} en orden de compra?`
            : `¿Convertir ${count} requisiciones en órdenes de compra?`,
        message:
          'Se crea una orden de compra en borrador por cada proveedor sugerido y ubicación de entrega, con el precio actual del proveedor. Las requisiciones quedan como convertidas.',
        lines: {
          headers: ['Requisición', 'Ubicación', 'Se requiere'],
          rows: requisitions.map((r) => [
            r.folio,
            r.location.code,
            formatDate(r.neededBy, 'dd/MM/yyyy', this.locale),
          ]),
        },
        confirmLabel: 'Convertir a OC',
      })
      .pipe(
        filter(Boolean),
        switchMap(() =>
          this.api.convert(requisitions.map((r) => r.id)).pipe(
            tap({
              error: (error: unknown) => this.conflicts.handle(error, { reload: onConflict }),
            }),
          ),
        ),
        tap((orders) => this.showResult(orders)),
      );
  }

  private showResult(orders: PurchaseOrderListItem[]): void {
    this.confirmService
      .confirm({
        title:
          orders.length === 1
            ? 'Se creó 1 orden de compra en borrador'
            : `Se crearon ${orders.length} órdenes de compra en borrador`,
        message: 'Revísalas y envíalas a aprobación desde Órdenes de compra.',
        lines: {
          headers: ['Orden de compra', 'Proveedor', 'Entrega', 'Total'],
          rows: orders.map((o) => [
            o.folio,
            o.supplier.name,
            o.deliveryLocation.code,
            formatMxn(o.total, this.locale),
          ]),
          alignEnd: [3],
        },
        confirmLabel: 'Entendido',
        showCancel: false,
      })
      .subscribe();
  }
}
