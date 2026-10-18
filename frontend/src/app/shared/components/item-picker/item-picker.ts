import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Observable, forkJoin, map } from 'rxjs';
import type { ApiEnum } from '../../../core/api/api';
import { ItemLookupApi, ItemOption } from '../../data-access/item-lookup';
import { enumLabel } from '../../pipes/labels';
import { ItemPhoto } from '../item-photo/item-photo';
import { LookupPicker } from '../lookup-picker/lookup-picker';

export type { ItemOption };

/**
 * Item autocomplete by SKU or name (`GET /items/lookup`, frontend §8), filterable by type, presentation and area.
 * The value is the chosen ItemLookupDto (with its unit). `types` allows several types (one search per type). Each
 * option and the chosen item show their photo (app-item-photo, F-23).
 */
@Component({
  selector: 'app-item-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatAutocompleteModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    ItemPhoto,
  ],
  templateUrl: './item-picker.html',
  styleUrl: './item-picker.scss',
})
export class ItemPicker extends LookupPicker<ItemOption> {
  readonly type = input<ApiEnum<'ItemType'> | null>(null);
  readonly types = input<readonly ApiEnum<'ItemType'>[]>([]);
  readonly presentation = input<ApiEnum<'ItemPresentation'> | null>(null);
  readonly areaId = input<string | null>(null);

  private readonly lookup = inject(ItemLookupApi);

  protected override runSearch(q: string): Observable<ItemOption[]> {
    const filters = { presentation: this.presentation(), areaId: this.areaId() };
    const types = this.types();
    if (types.length === 0) return this.lookup.search(q, { ...filters, type: this.type() });
    return forkJoin(types.map((type) => this.lookup.search(q, { ...filters, type }))).pipe(
      map((results) => results.flat().sort((a, b) => a.sku.localeCompare(b.sku))),
    );
  }

  /** The chosen item (the field holds text while the user types). */
  protected chosen(): ItemOption | null {
    const value = this.text.value;
    return value && typeof value === 'object' ? value : null;
  }

  protected override display(item: ItemOption): string {
    return `${item.sku} · ${item.name}`;
  }

  protected override describe(item: ItemOption): string {
    return `${enumLabel('ItemType', item.type)} · ${item.baseUomCode}`;
  }
}
