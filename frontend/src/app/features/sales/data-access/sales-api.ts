import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import type { Schemas } from '../../../core/api/api';
import {
  ListQuery,
  Page,
  ParamValues,
  httpParams,
  toHttpParams,
} from '../../../shared/data-access/list-query';

export type Customer = Schemas['CustomerDto'];
export type CustomerListItem = Schemas['CustomerListItemDto'];
export type CustomerOption = Schemas['CustomerLookupDto'];
export type DeliveryPoint = Schemas['DeliveryPointDto'];
export type CustomerItem = Schemas['CustomerItemDto'];
export type CustomerOrder = Schemas['CustomerOrderDto'];
export type CustomerOrderListItem = Schemas['CustomerOrderListItemDto'];
export type CustomerShipment = Schemas['CustomerShipmentDto'];
export type CustomerShipmentLine = Schemas['CustomerShipmentLineDto'];
export type CustomerShipmentListItem = Schemas['CustomerShipmentListItemDto'];

/** Customers with their delivery points and items (`/customers`, D-06). */
@Injectable({ providedIn: 'root' })
export class CustomersApi {
  private readonly http = inject(HttpClient);

  /** `q` by code, name or RFC; `includeInactive`. */
  list(query: ListQuery, filters: ParamValues = {}): Observable<Page<CustomerListItem>> {
    return this.http.get<Page<CustomerListItem>>('customers', {
      params: toHttpParams(query, filters),
    });
  }

  get(id: string): Observable<Customer> {
    return this.http.get<Customer>(`customers/${id}`);
  }

  create(request: Schemas['CreateCustomerRequest']): Observable<Customer> {
    return this.http.post<Customer>('customers', request);
  }

  update(id: string, request: Schemas['UpdateCustomerRequest']): Observable<Customer> {
    return this.http.put<Customer>(`customers/${id}`, request);
  }

  points(id: string): Observable<DeliveryPoint[]> {
    return this.http.get<DeliveryPoint[]>(`customers/${id}/delivery-points`);
  }

  addPoint(id: string, request: Schemas['CreateDeliveryPointRequest']): Observable<DeliveryPoint> {
    return this.http.post<DeliveryPoint>(`customers/${id}/delivery-points`, request);
  }

  updatePoint(
    id: string,
    pointId: string,
    request: Schemas['UpdateDeliveryPointRequest'],
  ): Observable<DeliveryPoint> {
    return this.http.put<DeliveryPoint>(`customers/${id}/delivery-points/${pointId}`, request);
  }

  /** The customer's code and informative price per item (D-06). */
  items(id: string): Observable<CustomerItem[]> {
    return this.http.get<CustomerItem[]>(`customers/${id}/items`);
  }

  addItem(id: string, request: Schemas['CreateCustomerItemRequest']): Observable<CustomerItem> {
    return this.http.post<CustomerItem>(`customers/${id}/items`, request);
  }

  updateItem(
    id: string,
    customerItemId: string,
    request: Schemas['UpdateCustomerItemRequest'],
  ): Observable<CustomerItem> {
    return this.http.put<CustomerItem>(`customers/${id}/items/${customerItemId}`, request);
  }
}

/** Active customers for the pickers (`/customers/lookup`). */
@Injectable({ providedIn: 'root' })
export class CustomerLookupApi {
  private readonly http = inject(HttpClient);

  search(q: string): Observable<CustomerOption[]> {
    return this.http.get<CustomerOption[]>('customers/lookup', {
      params: httpParams({ q, limit: 20 }),
    });
  }
}

/** Customer orders (`/customer-orders`, RN-80, RN-82). */
@Injectable({ providedIn: 'root' })
export class CustomerOrdersApi {
  private readonly http = inject(HttpClient);

  /** `tab` (All, ToFulfill, Drafts), `status`, `customerId`, `from`/`to` (required date), `q` by folio. */
  list(query: ListQuery, filters: ParamValues = {}): Observable<Page<CustomerOrderListItem>> {
    return this.http.get<Page<CustomerOrderListItem>>('customer-orders', {
      params: toHttpParams(query, filters),
    });
  }

  get(id: string): Observable<CustomerOrder> {
    return this.http.get<CustomerOrder>(`customer-orders/${id}`);
  }

  create(request: Schemas['CreateCustomerOrderRequest']): Observable<CustomerOrder> {
    return this.http.post<CustomerOrder>('customer-orders', request);
  }

  update(id: string, request: Schemas['UpdateCustomerOrderRequest']): Observable<CustomerOrder> {
    return this.http.put<CustomerOrder>(`customer-orders/${id}`, request);
  }

  /** Draft → Confirmed: it becomes demand of the production plan and is no longer edited. */
  confirm(id: string, version: number): Observable<CustomerOrder> {
    const body: Schemas['VersionRequest'] = { version };
    return this.http.post<CustomerOrder>(`customer-orders/${id}/confirm`, body);
  }

  /** A draft, or a confirmed one with nothing shipped. */
  cancel(id: string, version: number): Observable<CustomerOrder> {
    const body: Schemas['VersionRequest'] = { version };
    return this.http.post<CustomerOrder>(`customer-orders/${id}/cancel`, body);
  }

  /** RN-82: a partially shipped order closes with its balance; the reason is required. */
  close(id: string, version: number, reason: string): Observable<CustomerOrder> {
    const body: Schemas['CloseCustomerOrderRequest'] = { version, reason };
    return this.http.post<CustomerOrder>(`customer-orders/${id}/close`, body);
  }
}

/** Customer shipments (`/customer-shipments`, RN-81): delivery documents, not invoices (RN-83). */
@Injectable({ providedIn: 'root' })
export class CustomerShipmentsApi {
  private readonly http = inject(HttpClient);

  /** `tab` (All, ToDispatch), `customerId`, `customerOrderId`, `from`/`to`, `q`. */
  list(query: ListQuery, filters: ParamValues = {}): Observable<Page<CustomerShipmentListItem>> {
    return this.http.get<Page<CustomerShipmentListItem>>('customer-shipments', {
      params: toHttpParams(query, filters),
    });
  }

  get(id: string): Observable<CustomerShipment> {
    return this.http.get<CustomerShipment>(`customer-shipments/${id}`);
  }

  /** A draft from a confirmed or partially shipped order, filled with the balance of each line. */
  createFromOrder(orderId: string): Observable<CustomerShipment> {
    return this.http.post<CustomerShipment>(`customer-orders/${orderId}/shipments`, {});
  }

  /** Quantities of the draft (up to the balance plus the tolerance, RN-82). */
  update(
    id: string,
    request: Schemas['UpdateCustomerShipmentRequest'],
  ): Observable<CustomerShipment> {
    return this.http.put<CustomerShipment>(`customer-shipments/${id}`, request);
  }

  /** Posts the exit (first to expire unless lots are chosen) at the average cost; it is final. */
  dispatch(
    id: string,
    request: Schemas['DispatchCustomerShipmentRequest'],
  ): Observable<CustomerShipment> {
    return this.http.post<CustomerShipment>(`customer-shipments/${id}/dispatch`, request);
  }

  cancel(id: string, version: number): Observable<CustomerShipment> {
    const body: Schemas['VersionRequest'] = { version };
    return this.http.post<CustomerShipment>(`customer-shipments/${id}/cancel`, body);
  }

  /** RN-114: marks a dispatched shipment delivered; what returns re-enters the plant, what is lost moves nothing. */
  deliver(
    id: string,
    request: Schemas['DeliverCustomerShipmentRequest'],
  ): Observable<CustomerShipment> {
    return this.http.post<CustomerShipment>(`customer-shipments/${id}/deliver`, request);
  }
}
