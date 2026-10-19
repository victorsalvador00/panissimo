import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { RouterLink } from '@angular/router';
import { debounceTime } from 'rxjs';
import type { ApiEnum } from '../../../core/api/api';
import { AuthService } from '../../../core/auth/auth.service';
import { CellDef, DataTable } from '../../../shared/components/data-table/data-table';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { ListQuery } from '../../../shared/data-access/list-query';
import { QtyPipe } from '../../../shared/pipes/pipes';
import { RecipesApi } from '../data-access/production-api';
import { RECIPE_OUTPUT_TYPES } from '../ui/recipe-rules';

/** /produccion/recetas (frontend §7.4): active recipes; the switch adds the previous versions. */
@Component({
  selector: 'app-recipes-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    PageHeader,
    DataTable,
    CellDef,
    QtyPipe,
  ],
  template: `
    <app-page-header title="Recetas">
      @if (canManage) {
        <a matButton="filled" routerLink="nueva">
          <mat-icon>add</mat-icon>
          Nueva receta
        </a>
      }
    </app-page-header>

    <div class="filters">
      <mat-form-field class="search">
        <mat-label>Buscar por SKU o nombre del producto</mat-label>
        <input matInput type="search" [formControl]="search" />
        <mat-icon matSuffix aria-hidden="true">search</mat-icon>
      </mat-form-field>
      <mat-form-field>
        <mat-label>Tipo</mat-label>
        <mat-select [value]="outputType()" (valueChange)="setType($event)">
          <mat-option [value]="null">Todos</mat-option>
          @for (option of typeOptions; track option.value) {
            <mat-option [value]="option.value">{{ option.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-slide-toggle [checked]="includeInactive()" (change)="setIncludeInactive($event.checked)">
        Incluir versiones anteriores
      </mat-slide-toggle>
    </div>

    <app-data-table
      label="Recetas"
      [rows]="rows()"
      [total]="total()"
      [query]="query()"
      [loading]="recipes.isLoading()"
      emptyMessage="No hay recetas con estos filtros."
      (queryChange)="query.set($event)"
    >
      <ng-template appCell="sku" header="SKU" sortable [appCellOf]="rows()" let-recipe>
        <a class="row-link" [routerLink]="recipe.id">{{ recipe.outputSku }}</a>
      </ng-template>
      <ng-template appCell="name" header="Producto" sortable [appCellOf]="rows()" let-recipe>
        {{ recipe.outputName }}
      </ng-template>
      <ng-template appCell="version" header="Versión" [appCellOf]="rows()" let-recipe>
        v{{ recipe.recipeVersion }}
        @if (!recipe.isActive) {
          <span class="muted">· inactiva</span>
        }
      </ng-template>
      <ng-template appCell="yield" header="Rendimiento" end [appCellOf]="rows()" let-recipe>
        {{ recipe.yieldQty | qty: recipe.outputUomCode }}
      </ng-template>
      <ng-template appCell="factory" header="Fábrica" [appCellOf]="rows()" let-recipe>
        {{ recipe.factoryCode ?? '—' }}
      </ng-template>
      <ng-template appCell="lines" header="Componentes" end [appCellOf]="rows()" let-recipe>
        {{ recipe.lineCount }}
      </ng-template>
      <ng-template appCell="used" header="En uso" [appCellOf]="rows()" let-recipe>
        {{ recipe.isUsed ? 'Sí' : 'No' }}
      </ng-template>
    </app-data-table>
  `,
  styleUrl: '../../catalog/pages/catalog-list.scss',
})
export class RecipesListPage {
  private readonly api = inject(RecipesApi);
  protected readonly canManage = inject(AuthService).can('production.recipes.manage');
  protected readonly typeOptions = RECIPE_OUTPUT_TYPES;

  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly outputType = signal<ApiEnum<'ItemType'> | null>(null);
  protected readonly includeInactive = signal(false);
  protected readonly query = signal<ListQuery>({ page: 1, pageSize: 25, sort: 'sku' });

  protected readonly recipes = rxResource({
    params: () => ({
      query: this.query(),
      outputType: this.outputType(),
      includeInactive: this.includeInactive(),
    }),
    stream: ({ params }) =>
      this.api.list(params.query, {
        outputType: params.outputType,
        includeInactive: params.includeInactive || null,
      }),
  });
  protected readonly rows = computed(() =>
    this.recipes.hasValue() ? this.recipes.value().items : [],
  );
  protected readonly total = computed(() =>
    this.recipes.hasValue() ? this.recipes.value().total : 0,
  );

  constructor() {
    this.search.valueChanges
      .pipe(debounceTime(300), takeUntilDestroyed())
      .subscribe((q) => this.query.update((x) => ({ ...x, page: 1, q: q.trim() || undefined })));
  }

  protected setType(type: ApiEnum<'ItemType'> | null): void {
    this.outputType.set(type);
    this.query.update((x) => ({ ...x, page: 1 }));
  }

  protected setIncludeInactive(value: boolean): void {
    this.includeInactive.set(value);
    this.query.update((x) => ({ ...x, page: 1 }));
  }
}
