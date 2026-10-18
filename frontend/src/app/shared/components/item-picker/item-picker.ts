import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Observable } from 'rxjs';
import type { ApiEnum } from '../../../core/api/api';
import { ItemLookupApi, ItemOption } from '../../data-access/item-lookup';
import { enumLabel } from '../../pipes/labels';
import { LookupPicker } from '../lookup-picker/lookup-picker';

export type { ItemOption };

/**
 * Item autocomplete by SKU or name (`GET /items/lookup`, frontend §8), filterable by type, presentation and area.
 * The value is the chosen ItemLookupDto (with its unit). The photo arrives with app-item-photo (F-23).
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
  ],
  templateUrl: '../lookup-picker/lookup-picker.html',
  styleUrl: '../lookup-picker/lookup-picker.scss',
})
export class ItemPicker extends LookupPicker<ItemOption> {
  readonly type = input<ApiEnum<'ItemType'> | null>(null);
  readonly presentation = input<ApiEnum<'ItemPresentation'> | null>(null);
  readonly areaId = input<string | null>(null);

  private readonly lookup = inject(ItemLookupApi);

  protected override runSearch(q: string): Observable<ItemOption[]> {
    return this.lookup.search(q, {
      type: this.type(),
      presentation: this.presentation(),
      areaId: this.areaId(),
    });
  }

  protected override display(item: ItemOption): string {
    return `${item.sku} · ${item.name}`;
  }

  protected override describe(item: ItemOption): string {
    return `${enumLabel('ItemType', item.type)} · ${item.baseUomCode}`;
  }
}
