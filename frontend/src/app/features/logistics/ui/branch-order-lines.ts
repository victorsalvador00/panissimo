import { FormControl, FormGroup, Validators } from '@angular/forms';
import { qtyLimitsValidator } from '../../../shared/components/qty-input/qty-input';
import { QTY_MAX_DECIMALS } from '../../../shared/pipes/qty.pipe';
import type { ItemOption } from '../../../shared/data-access/item-lookup.service';
import type { LocationOption } from '../../../shared/data-access/location-lookup.service';
import type {
  ApproveBranchOrderRequest,
  BranchOrderLine,
  BranchOrderLineRequest,
  BranchOrderStatus,
  BranchOrderSuggestion,
} from '../data-access/branch-orders.api';

export const BRANCH_ORDER_STATUSES: BranchOrderStatus[] = [
  'Draft',
  'Submitted',
  'Approved',
  'PartiallyFulfilled',
  'Fulfilled',
  'Rejected',
  'Cancelled',
];

/** Las sucursales piden a la fábrica o al comisariato. */
export function supplyingOptions(all: LocationOption[]): LocationOption[] {
  return all.filter((location) => location.type === 'Factory' || location.type === 'Commissary');
}

// --- Líneas del borrador ---

export type OrderLineForm = FormGroup<{
  item: FormControl<ItemOption | null>;
  /** En la unidad base del artículo. */
  quantity: FormControl<number | null>;
}>;

export interface OrderLineValue {
  item: ItemOption | null;
  quantity: number | null;
}

export function createOrderLine(value?: Partial<OrderLineValue>): OrderLineForm {
  return new FormGroup({
    item: new FormControl<ItemOption | null>(value?.item ?? null, Validators.required),
    quantity: new FormControl<number | null>(value?.quantity ?? null, Validators.required),
  });
}

export function toOrderLines(lines: OrderLineValue[]): BranchOrderLineRequest[] {
  return lines.map((line) => ({ itemId: line.item!.id, requestedQty: line.quantity ?? 0 }));
}

/** Sugerencias de artículos que todavía no están en el pedido (las existentes no se tocan). */
export function missingSuggestions(
  lines: OrderLineValue[],
  suggestions: BranchOrderSuggestion[],
): BranchOrderSuggestion[] {
  const present = new Set(lines.map((line) => line.item?.id).filter(Boolean));
  return suggestions.filter((suggestion) => !present.has(suggestion.itemId));
}

// --- Acciones del detalle ---

export interface BranchOrderPermissions {
  create: boolean;
  approve: boolean;
}

/** A qué lado del pedido tiene acceso el usuario. */
export interface BranchOrderSides {
  requesting: boolean;
  supplying: boolean;
}

export interface BranchOrderActions {
  edit: boolean;
  submit: boolean;
  cancel: boolean;
  approve: boolean;
  reject: boolean;
}

/** La sucursal captura, envía y cancela; el origen aprueba o rechaza (el backend vuelve a validar). */
export function branchOrderActions(
  status: BranchOrderStatus,
  can: BranchOrderPermissions,
  at: BranchOrderSides,
): BranchOrderActions {
  const branch = can.create && at.requesting;
  const origin = can.approve && at.supplying;
  return {
    edit: status === 'Draft' && branch,
    submit: status === 'Draft' && branch,
    cancel: (status === 'Draft' || status === 'Submitted') && branch,
    approve: status === 'Submitted' && origin,
    reject: status === 'Submitted' && origin,
  };
}

// --- Aprobación ---

export type ApproveLineForm = FormControl<number | null>;

/** Se prellena con lo solicitado; va de 0 a lo solicitado (RN-20). */
export function createApproveLine(line: BranchOrderLine): ApproveLineForm {
  return new FormControl<number | null>(line.requestedQty, [
    Validators.required,
    qtyLimitsValidator(
      () => line.requestedQty,
      () => QTY_MAX_DECIMALS,
    ),
  ]);
}

/** Aviso (no bloquea): no se reserva existencia, pero se aprueba más de lo que hay en el origen. */
export function exceedsStock(line: BranchOrderLine, approved: number | null): boolean {
  return approved !== null && approved > line.onHandAtOrigin;
}

export function toApproveRequest(
  version: number,
  lines: BranchOrderLine[],
  approved: Record<string, number | null>,
): ApproveBranchOrderRequest {
  return {
    version,
    lines: lines.map((line) => ({ lineId: line.id, approvedQty: approved[line.id] ?? 0 })),
  };
}

/** Aprobar todo en 0 no se permite: eso es un rechazo. */
export function approvesSomething(approved: Record<string, number | null>): boolean {
  return Object.values(approved).some((qty) => (qty ?? 0) > 0);
}
