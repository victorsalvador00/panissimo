import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import type { ApiEnum, Schemas } from '../../../core/api/api';
import {
  ListQuery,
  Page,
  ParamValues,
  httpParams,
  toHttpParams,
} from '../../../shared/data-access/list-query';

export type Recipe = Schemas['RecipeDto'];
export type RecipeLine = Schemas['RecipeLineDto'];
export type RecipeListItem = Schemas['RecipeListItemDto'];
export type Explosion = Schemas['ExplosionDto'];
export type RecipeCosts = Schemas['RecipeCostsDto'];
export type RecipeVersionCost = Schemas['RecipeVersionCostDto'];
export type ProductionOrder = Schemas['ProductionOrderDto'];
export type ProductionOrderListItem = Schemas['ProductionOrderListItemDto'];
export type ProductionOrderTab = ApiEnum<'ProductionOrderTab'>;
export type ProductionCloseListItem = Schemas['ProductionCloseListItemDto'];
export type ProductionClose = Schemas['ProductionCloseDto'];
export type ClosePreview = Schemas['ClosePreviewDto'];
export type ImportPreview = Schemas['ImportPreviewDto'];
export type ImportResult = Schemas['ImportResultDto'];
export type OrderImport = Schemas['ProductionOrderImportDto'];
export type OrderImportListItem = Schemas['ProductionOrderImportListItemDto'];
export type ProductionPlan = Schemas['ProductionPlanDto'];
export type PlanRow = Schemas['ProductionPlanRowDto'];
export type GeneratedOrder = Schemas['GeneratedProductionOrderDto'];
export type ProductionSummary = Schemas['ProductionSummaryDto'];
export type SummaryRow = Schemas['ProductionSummaryRowDto'];
export type SummaryGroupBy = ApiEnum<'ProductionSummaryGroupBy'>;

/** Versioned recipes (`/recipes`, RN-10). */
@Injectable({ providedIn: 'root' })
export class RecipesApi {
  private readonly http = inject(HttpClient);

  /** Active recipes; `includeInactive` adds the previous versions. */
  list(query: ListQuery, filters: ParamValues = {}): Observable<Page<RecipeListItem>> {
    return this.http.get<Page<RecipeListItem>>('recipes', { params: toHttpParams(query, filters) });
  }

  get(id: string): Observable<Recipe> {
    return this.http.get<Recipe>(`recipes/${id}`);
  }

  /** Only one active recipe per item (RN-10). */
  create(request: Schemas['CreateRecipeRequest']): Observable<Recipe> {
    return this.http.post<Recipe>('recipes', request);
  }

  /** Edits the active version; if an order already used it, the answer is version N+1 (another id). */
  update(id: string, request: Schemas['UpdateRecipeRequest']): Observable<Recipe> {
    return this.http.put<Recipe>(`recipes/${id}`, request);
  }

  /** Activating needs the item's active version deactivated first (RN-10). */
  activate(id: string, version: number): Observable<Recipe> {
    const body: Schemas['VersionRequest'] = { version };
    return this.http.post<Recipe>(`recipes/${id}/activate`, body);
  }

  deactivate(id: string, version: number): Observable<Recipe> {
    const body: Schemas['VersionRequest'] = { version };
    return this.http.post<Recipe>(`recipes/${id}/deactivate`, body);
  }

  /** RN-11/RN-12: theoretical consumption for `qty`; with a location, availability, shortage and estimated cost. */
  explode(id: string, qty: number, locationId: string | null): Observable<Explosion> {
    return this.http.get<Explosion>(`recipes/${id}/explode`, {
      params: httpParams({ qty, locationId }),
    });
  }

  /** RN-51: every version of the recipe's product at the location's current average costs, with recent increases. */
  costs(id: string, locationId: string): Observable<RecipeCosts> {
    return this.http.get<RecipeCosts>(`recipes/${id}/costs`, {
      params: httpParams({ locationId }),
    });
  }
}

/** Production orders (`/production-orders`, RN-60) and their closes (RN-61..RN-66). */
@Injectable({ providedIn: 'root' })
export class ProductionOrdersApi {
  private readonly http = inject(HttpClient);

  list(query: ListQuery, filters: ParamValues = {}): Observable<Page<ProductionOrderListItem>> {
    return this.http.get<Page<ProductionOrderListItem>>('production-orders', {
      params: toHttpParams(query, filters),
    });
  }

  get(id: string): Observable<ProductionOrder> {
    return this.http.get<ProductionOrder>(`production-orders/${id}`);
  }

  /** A draft with the product's active recipe; it is produced at that recipe's factory (RN-49). */
  create(request: Schemas['CreateProductionOrderRequest']): Observable<ProductionOrder> {
    return this.http.post<ProductionOrder>('production-orders', request);
  }

  update(
    id: string,
    request: Schemas['UpdateProductionOrderRequest'],
  ): Observable<ProductionOrder> {
    return this.http.put<ProductionOrder>(`production-orders/${id}`, request);
  }

  /** RN-111: where each component of the recipe may come from, with its free stock and the default of its type. */
  componentSources(
    locationId: string,
    recipeId: string,
  ): Observable<Schemas['ComponentSourceOptionDto'][]> {
    return this.http.get<Schemas['ComponentSourceOptionDto'][]>(
      'production-orders/component-sources',
      {
        params: httpParams({ locationId, recipeId }),
      },
    );
  }

  /** With a factory in the recipe: reserves the ingredients and creates their vouchers (RN-110/RN-112). */
  release(id: string, version: number): Observable<ProductionOrder> {
    const body: Schemas['VersionRequest'] = { version };
    return this.http.post<ProductionOrder>(`production-orders/${id}/release`, body);
  }

  /** A draft, or released without closes. */
  cancel(id: string, version: number): Observable<ProductionOrder> {
    const body: Schemas['VersionRequest'] = { version };
    return this.http.post<ProductionOrder>(`production-orders/${id}/cancel`, body);
  }

  closes(id: string): Observable<ProductionCloseListItem[]> {
    return this.http.get<ProductionCloseListItem[]>(`production-orders/${id}/closes`);
  }

  /** Theoretical per component for `qty` (RN-11), stock, estimated cost and the lot it would create (RN-62). */
  closePreview(id: string, qty: number): Observable<ClosePreview> {
    return this.http.get<ClosePreview>(`production-orders/${id}/close-preview`, {
      params: httpParams({ qty }),
    });
  }

  /**
   * Partial or final close in one transaction (RN-61, RN-63): a 409 brings the shortages (nothing is posted) or
   * another close of the same order (RN-66).
   */
  close(id: string, request: Schemas['CreateProductionCloseRequest']): Observable<ProductionClose> {
    return this.http.post<ProductionClose>(`production-orders/${id}/closes`, request);
  }
}

/** Every production close (`/production-closes`), with its consumption and lots. */
@Injectable({ providedIn: 'root' })
export class ProductionClosesApi {
  private readonly http = inject(HttpClient);

  list(query: ListQuery, filters: ParamValues = {}): Observable<Page<ProductionCloseListItem>> {
    return this.http.get<Page<ProductionCloseListItem>>('production-closes', {
      params: toHttpParams(query, filters),
    });
  }

  get(id: string): Observable<ProductionClose> {
    return this.http.get<ProductionClose>(`production-closes/${id}`);
  }
}

/** Production orders from Excel (`/production-order-imports`, RN-90..RN-95): all or nothing, warnings confirmed. */
@Injectable({ providedIn: 'root' })
export class OrderImportsApi {
  private readonly http = inject(HttpClient);

  template(): Observable<Blob> {
    return this.http.get('production-order-imports/template', { responseType: 'blob' });
  }

  /** Validates without saving: errors by row and column, warnings and the orders to create. */
  validate(file: File): Observable<ImportPreview> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<ImportPreview>('production-order-imports/validate', form);
  }

  /** Revalidates and creates the orders; 400 with `rowErrors`, 422 when the warnings were not confirmed. */
  import(file: File, confirmWarnings: boolean, releaseOnImport: boolean): Observable<ImportResult> {
    const form = new FormData();
    form.append('file', file);
    form.append('confirmWarnings', String(confirmWarnings));
    form.append('releaseOnImport', String(releaseOnImport));
    return this.http.post<ImportResult>('production-order-imports', form);
  }

  list(query: ListQuery): Observable<Page<OrderImportListItem>> {
    return this.http.get<Page<OrderImportListItem>>('production-order-imports', {
      params: toHttpParams(query),
    });
  }

  get(id: string): Observable<OrderImport> {
    return this.http.get<OrderImport>(`production-order-imports/${id}`);
  }
}

/** Production plan of the plant (`/production-plan`, RN-70, RN-71): a query; generating creates draft orders. */
@Injectable({ providedIn: 'root' })
export class ProductionPlanApi {
  private readonly http = inject(HttpClient);

  /** Without dates: today + `production.plan_default_days`; the answer brings the range used. */
  get(filters: ParamValues): Observable<ProductionPlan> {
    return this.http.get<ProductionPlan>('production-plan', { params: httpParams(filters) });
  }

  /** One draft order per product, date and shift, linked to the order lines it attends. All or nothing. */
  generate(request: Schemas['GenerateProductionPlanRequest']): Observable<GeneratedOrder[]> {
    return this.http
      .post<Schemas['GenerateProductionPlanResult']>('production-plan/generate', request)
      .pipe(map((result) => result.orders));
  }
}

/** Production summary (`/reports/production-summary`, RN-53): planned, produced, compliance, cost and waste. */
@Injectable({ providedIn: 'root' })
export class ProductionSummaryApi {
  private readonly http = inject(HttpClient);

  get(
    locationId: string,
    from: string,
    to: string,
    groupBy: SummaryGroupBy,
  ): Observable<ProductionSummary> {
    return this.http.get<ProductionSummary>('reports/production-summary', {
      params: httpParams({ locationId, from, to, groupBy }),
    });
  }
}
