import {
  AbstractControl,
  FormControl,
  FormGroup,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import type { ApiEnum } from '../../../core/api/api-types';
import { chosenLots, LotSplit } from '../../inventory/ui/lot-split';
import type { ItemOption } from '../../../shared/data-access/item-lookup.service';
import type { LocationOption } from '../../../shared/data-access/location-lookup.service';
import type {
  DiscrepancyReason,
  DispatchTransferRequest,
  ReceiveTransferRequest,
  TransferFilters,
  TransferLine,
  TransferLineRequest,
} from '../data-access/transfers.api';

type LocationType = ApiEnum<'LocationType'>;

// --- Rutas ---

/** Ruta estándar: fábrica o comisariato → sucursal. Las demás requieren `logistics.transfers.special`. */
export function isStandardRoute(from: LocationType, to: LocationType): boolean {
  return (from === 'Factory' || from === 'Commissary') && to === 'Branch';
}

/** Destinos que el usuario puede elegir desde `from` (nunca el mismo origen). */
export function destinationOptions(
  all: LocationOption[],
  from: LocationOption | null | undefined,
  canSpecial: boolean,
): LocationOption[] {
  if (!from) {
    return [];
  }
  return all.filter(
    (to) => to.id !== from.id && (canSpecial || isStandardRoute(from.type, to.type)),
  );
}

// --- Pestañas ---

export type TransferTab = 'toDispatch' | 'inTransit' | 'received' | 'all';

export const TRANSFER_TABS: { id: TransferTab; label: string; slug: string }[] = [
  { id: 'toDispatch', label: 'Por despachar', slug: 'por-despachar' },
  { id: 'inTransit', label: 'En tránsito', slug: 'en-transito' },
  { id: 'received', label: 'Recibidos', slug: 'recibidos' },
  { id: 'all', label: 'Todos', slug: 'todos' },
];

/** Filtros de cada pestaña para la ubicación activa. */
export function tabFilters(tab: TransferTab, locationId: string | null): TransferFilters {
  switch (tab) {
    case 'toDispatch':
      return { status: 'Draft', fromLocationId: locationId };
    case 'inTransit':
      return { status: 'Dispatched', locationId };
    case 'received':
      return { received: true, locationId };
    default:
      return { locationId };
  }
}

// --- Planeación (borrador) ---

export type PlanLine = FormGroup<{
  item: FormControl<ItemOption | null>;
  quantity: FormControl<number | null>;
  /** Lote planeado en el origen; `null` = FEFO al despachar. */
  lotId: FormControl<string | null>;
}>;

export interface PlanLineValue {
  item: ItemOption | null;
  quantity: number | null;
  lotId: string | null;
}

export function createPlanLine(value?: Partial<PlanLineValue>): PlanLine {
  return new FormGroup({
    item: new FormControl<ItemOption | null>(value?.item ?? null, Validators.required),
    quantity: new FormControl<number | null>(value?.quantity ?? null, Validators.required),
    lotId: new FormControl<string | null>(value?.lotId ?? null),
  });
}

export function toTransferLines(lines: PlanLineValue[]): TransferLineRequest[] {
  return lines.map((line) => ({
    itemId: line.item!.id,
    lotId: line.item?.tracksLots ? line.lotId : null,
    quantity: line.quantity ?? 0,
  }));
}

// --- Despacho ---

export type DispatchLine = LotSplit;

export function toDispatchRequest(
  version: number,
  vehicleDescription: string,
  driverName: string,
  lines: Record<
    string,
    { manual: boolean; lots: Record<string, { lotId: string; quantity: number | null }> }
  >,
): DispatchTransferRequest {
  const manual = Object.entries(lines)
    .filter(([, line]) => line.manual)
    .map(([lineId, line]) => ({ lineId, lots: chosenLots(line.lots) }));
  return {
    version,
    vehicleDescription: vehicleDescription.trim(),
    driverName: driverName.trim(),
    lines: manual.length ? manual : null,
  };
}

// --- Recepción ---

export type ReceiveLine = FormGroup<{
  receivedQty: FormControl<number | null>;
  reason: FormControl<DiscrepancyReason | null>;
  notes: FormControl<string>;
}>;

/** RN-22: no se recibe más de lo enviado; si se recibe menos, el motivo es obligatorio. */
export function receiveLineValidator(shipped: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const { receivedQty, reason } = (control as ReceiveLine).getRawValue();
    if (receivedQty === null || Number.isNaN(receivedQty)) {
      return null;
    }
    if (receivedQty > shipped) {
      return { receivedTooMuch: { shipped } };
    }
    if (receivedQty < shipped && !reason) {
      return { reasonRequired: true };
    }
    return null;
  };
}

export function createReceiveLine(line: TransferLine): ReceiveLine {
  return new FormGroup(
    {
      receivedQty: new FormControl<number | null>(line.shippedQty, Validators.required),
      reason: new FormControl<DiscrepancyReason | null>(null),
      notes: new FormControl('', { nonNullable: true, validators: Validators.maxLength(500) }),
    },
    { validators: receiveLineValidator(line.shippedQty) },
  );
}

export interface ReceiveValue {
  receivedQty: number | null;
  reason: DiscrepancyReason | null;
  notes: string;
}

export function isShort(line: TransferLine, value: ReceiveValue): boolean {
  return value.receivedQty !== null && value.receivedQty < line.shippedQty;
}

export function toReceiveRequest(
  version: number,
  lines: TransferLine[],
  values: Record<string, ReceiveValue>,
): ReceiveTransferRequest {
  return {
    version,
    lines: lines.map((line) => {
      const value = values[line.id];
      const short = isShort(line, value);
      return {
        lineId: line.id,
        receivedQty: value.receivedQty ?? 0,
        discrepancyReason: short ? value.reason : null,
        discrepancyNotes: short ? value.notes.trim() || null : null,
      };
    }),
  };
}

/** Líneas completas y con faltante, para la barra inferior y la confirmación. */
export function receiveSummary(
  lines: TransferLine[],
  values: Record<string, ReceiveValue>,
): { complete: number; short: number } {
  const short = lines.filter((line) => values[line.id] && isShort(line, values[line.id])).length;
  return { complete: lines.length - short, short };
}
