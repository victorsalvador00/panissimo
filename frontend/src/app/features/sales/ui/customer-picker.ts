import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Observable } from 'rxjs';
import { LookupPicker } from '../../../shared/components/lookup-picker/lookup-picker';
import { CustomerLookupApi, CustomerOption } from '../data-access/sales-api';

/** Active customer by code or name (`/customers/lookup`); the value is the chosen CustomerLookupDto. */
@Component({
  selector: 'app-customer-picker',
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
export class CustomerPicker extends LookupPicker<CustomerOption> {
  private readonly lookup = inject(CustomerLookupApi);

  protected override runSearch(q: string): Observable<CustomerOption[]> {
    return this.lookup.search(q);
  }

  protected override display(customer: CustomerOption): string {
    return `${customer.code} · ${customer.name}`;
  }
}
