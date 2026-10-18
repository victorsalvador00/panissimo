import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Observable } from 'rxjs';
import type { ApiEnum, Schemas } from '../../../core/api/api';
import { httpParams } from '../../data-access/list-query';
import { enumLabel } from '../../pipes/labels';
import { LookupPicker } from '../lookup-picker/lookup-picker';

export type ItemOption = Schemas['ItemLookupDto'];

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

  private readonly http = inject(HttpClient);

  protected override runSearch(q: string): Observable<ItemOption[]> {
    const params = httpParams({
      q,
      type: this.type(),
      presentation: this.presentation(),
      areaId: this.areaId(),
      limit: 20,
    });
    return this.http.get<ItemOption[]>('items/lookup', { params });
  }

  protected override display(item: ItemOption): string {
    return `${item.sku} · ${item.name}`;
  }

  protected override describe(item: ItemOption): string {
    return `${enumLabel('ItemType', item.type)} · ${item.baseUomCode}`;
  }
}
