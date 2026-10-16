import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { defaultListQuery, ListQuery } from '../../../core/http/list-query';
import {
  CardDef,
  CellDef,
  DataTable,
  TableColumn,
} from '../../../shared/components/data-table/data-table';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { QtyPipe } from '../../../shared/pipes/qty.pipe';
import { RecipeListItem, RecipesApi } from '../data-access/recipes.api';

/** Productos con receta activa y su versión (spec frontend §7.4). */
@Component({
  selector: 'app-recipes-list-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    PageHeader,
    DataTable,
    CellDef,
    CardDef,
    StatusTag,
    QtyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sgo-page">
      <app-page-header
        title="Recetas"
        subtitle="Lista de materiales de intermedios y terminados, por versión."
      >
        @if (canManage) {
          <a mat-flat-button routerLink="nueva">
            <mat-icon>add</mat-icon>
            Nueva receta
          </a>
        }
      </app-page-header>

      <mat-slide-toggle
        class="toggle"
        [checked]="includeInactive()"
        (change)="includeInactive.set($event.checked); query.set({ ...query(), page: 1 })"
      >
        Incluir versiones anteriores
      </mat-slide-toggle>

      <app-data-table
        [columns]="columns"
        [rows]="recipes.value()?.items ?? []"
        [total]="recipes.value()?.total ?? 0"
        [loading]="recipes.isLoading()"
        [query]="query()"
        [searchable]="true"
        searchPlaceholder="Buscar por SKU o nombre del producto"
        emptyMessage="No hay recetas."
        [emptyActionLabel]="canManage ? 'Nueva receta' : undefined"
        (emptyAction)="create()"
        [rowClickable]="true"
        (rowClick)="open($event)"
        (queryChange)="query.set($event)"
      >
        <ng-template appCell="recipeVersion" let-row>v{{ row.recipeVersion }}</ng-template>
        <ng-template appCell="yieldQty" let-row>{{
          row.yieldQty | qty: row.outputUomCode
        }}</ng-template>
        <ng-template appCell="isUsed" let-row>{{ row.isUsed ? 'Sí' : 'No' }}</ng-template>
        <ng-template appCell="isActive" let-row>
          <app-status-tag
            [label]="row.isActive ? 'Activa' : 'Inactiva'"
            [color]="row.isActive ? 'green' : 'gray'"
          />
        </ng-template>
        <ng-template appCardDef let-row>
          <div class="card-row">
            <strong>{{ row.outputSku }} · v{{ row.recipeVersion }}</strong>
            <app-status-tag
              [label]="row.isActive ? 'Activa' : 'Inactiva'"
              [color]="row.isActive ? 'green' : 'gray'"
            />
          </div>
          <div>{{ row.outputName }}</div>
          <div class="muted">
            Rinde {{ row.yieldQty | qty: row.outputUomCode }} · {{ row.lineCount }} componentes
          </div>
        </ng-template>
      </app-data-table>
    </section>
  `,
  styles: `
    .toggle {
      display: block;
      margin-bottom: var(--sgo-space-3);
    }
    .card-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--sgo-space-2);
    }
    .muted {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class RecipesListPage {
  private readonly api = inject(RecipesApi);
  private readonly router = inject(Router);

  protected readonly canManage = inject(AuthService).can('production.recipes.manage');

  protected readonly columns: TableColumn<RecipeListItem>[] = [
    { key: 'sku', header: 'SKU', sortable: true, value: (row) => row.outputSku },
    { key: 'name', header: 'Producto', sortable: true, value: (row) => row.outputName },
    { key: 'recipeVersion', header: 'Versión' },
    { key: 'yieldQty', header: 'Rendimiento', align: 'end' },
    { key: 'lineCount', header: 'Componentes', align: 'end' },
    { key: 'isUsed', header: 'Usada' },
    { key: 'isActive', header: 'Estado' },
  ];

  protected readonly query = signal<ListQuery>(defaultListQuery('sku:asc'));
  protected readonly includeInactive = signal(false);

  protected readonly recipes = rxResource({
    params: () => ({ query: this.query(), includeInactive: this.includeInactive() }),
    stream: ({ params }) =>
      this.api.list(params.query, { includeInactive: params.includeInactive || null }),
  });

  protected create(): void {
    void this.router.navigate(['/produccion/recetas/nueva']);
  }

  protected open(recipe: RecipeListItem): void {
    void this.router.navigate(['/produccion/recetas', recipe.id]);
  }
}
