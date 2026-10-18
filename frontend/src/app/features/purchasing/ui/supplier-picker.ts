import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Observable } from 'rxjs';
import { LookupPicker } from '../../../shared/components/lookup-picker/lookup-picker';
import { SupplierLookupApi, SupplierOption } from '../data-access/purchasing-api';

/** Active supplier by business name or RFC (`/suppliers/lookup`); the value is the chosen SupplierLookupDto. */
@Component({
  selector: 'app-supplier-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatAutocompleteModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
  ],
  templateUrl: '../../../shared/components/lookup-picker/lookup-picker.html',
  styleUrl: '../../../shared/components/lookup-picker/lookup-picker.scss',
})
export class SupplierPicker extends LookupPicker<SupplierOption> {
  private readonly lookup = inject(SupplierLookupApi);

  protected override runSearch(q: string): Observable<SupplierOption[]> {
    return this.lookup.search(q);
  }

  protected override display(supplier: SupplierOption): string {
    return supplier.name;
  }

  protected override describe(supplier: SupplierOption): string {
    return `${supplier.taxId} · ${supplier.paymentTermsDays === 0 ? 'contado' : supplier.paymentTermsDays + ' días de crédito'}`;
  }
}
