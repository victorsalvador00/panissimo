import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { RouterLink } from '@angular/router';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { MxnPipe } from '../../../shared/pipes/mxn.pipe';
import { QtyPipe } from '../../../shared/pipes/qty.pipe';
import { GoodsReceiptDto, GoodsReceiptsApi } from '../data-access/goods-receipts.api';
import { Stamp } from '../../../shared/components/stamp/stamp';

/** Detalle de una recepción: lo recibido en unidad de compra y base, lote y costo (RN-33). */
@Component({
  selector: 'app-goods-receipt-detail-page',
  imports: [
    Stamp,
    RouterLink,
    DatePipe,
    MatButtonModule,
    MatCardModule,
    PageHeader,
    StatusTag,
    QtyPipe,
    MxnPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sgo-page sgo-stack">
      @if (receipt(); as r) {
        <app-page-header
          [title]="'Recepción ' + r.folio"
          [subtitle]="r.supplier.name + ' · ' + r.location.code"
          [crumbs]="[
            { label: 'Compras' },
            { label: 'Recepciones', url: '/compras/recepciones' },
            { label: r.folio },
          ]"
        />

        <mat-card appearance="outlined">
          <mat-card-content>
            <dl>
              <div>
                <dt>Orden de compra</dt>
                <dd>
                  <a [routerLink]="['/compras/ordenes', r.purchaseOrder.id]">{{
                    r.purchaseOrder.folio
                  }}</a>
                  <app-status-tag [status]="r.purchaseOrderStatus" kind="PurchaseOrderStatus" />
                </dd>
              </div>
              <div>
                <dt>Recibida</dt>
                <dd><app-stamp [at]="r.receivedAt" [by]="r.receivedByName" /></dd>
              </div>
              <div>
                <dt>Factura</dt>
                <dd>{{ r.supplierInvoiceNumber ?? '—' }}</dd>
              </div>
              <div>
                <dt>RFC</dt>
                <dd>{{ r.supplier.taxId }}</dd>
              </div>
            </dl>
          </mat-card-content>
        </mat-card>

        <mat-card appearance="outlined">
          <mat-card-content>
            <h2>Artículos</h2>
            <ul class="lines">
              @for (line of r.lines; track line.id) {
                <li>
                  <div class="info">
                    <span class="name">{{ line.sku }} · {{ line.itemName }}</span>
                    <span class="meta">
                      {{ line.quantity | qty: line.purchaseUomCode }} =
                      {{ line.baseQuantity | qty: line.baseUomCode }} ·
                      {{ line.unitCostBase | mxn: '1.2-4' }} / {{ line.baseUomCode }}
                    </span>
                    @if (line.lotNumber) {
                      <span class="meta">
                        Lote {{ line.lotNumber }}
                        @if (line.expirationDate) {
                          · cad. {{ line.expirationDate | date: 'dd/MM/yyyy' }}
                        }
                      </span>
                    }
                  </div>
                  <div class="qty">{{ line.amount | mxn }}</div>
                </li>
              }
            </ul>
            <div class="total">
              <span>Costo sin IVA</span>
              <span>{{ r.totalCost | mxn }}</span>
            </div>
          </mat-card-content>
        </mat-card>
      } @else if (loadError()) {
        <p class="notice notice-error">No se encontró la recepción.</p>
        <a mat-button routerLink="/compras/recepciones">Volver a recepciones</a>
      } @else {
        <p class="muted">Cargando…</p>
      }
    </section>
  `,
  styleUrl: './purchasing-detail.scss',
})
export class GoodsReceiptDetailPage {
  private readonly api = inject(GoodsReceiptsApi);

  readonly id = input.required<string>();

  protected readonly receipt = signal<GoodsReceiptDto | null>(null);
  protected readonly loadError = signal(false);

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() =>
        this.api.get(id).subscribe({
          next: (receipt) => this.receipt.set(receipt),
          error: () => this.loadError.set(true),
        }),
      );
    });
  }
}
