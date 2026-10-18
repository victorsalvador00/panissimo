import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { ItemPhotosApi, PhotoSize } from '../../data-access/item-photos';

/** Up to two initials of the item's name (or SKU): "Concha de vainilla" → "CV". */
export function photoInitials(
  name: string | null | undefined,
  sku: string | null | undefined,
): string {
  const words = (name || sku || '?')
    .split(/[\s\-_.]+/)
    .filter(
      (w) =>
        /[\p{L}\p{N}]/u.test(w) && !['de', 'del', 'la', 'el', 'y', 'con'].includes(w.toLowerCase()),
    );
  const initials = words
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return initials || '?';
}

/**
 * Thumbnail of an item (frontend §8) or its initials when it has no photo. Decorative by default: the SKU and name are
 * always next to it; `alt` makes it meaningful where the photo stands alone. Downloads with the session and caches by
 * revision (`ItemPhotosApi`).
 */
@Component({
  selector: 'app-item-photo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (url(); as url) {
      <img
        [src]="url"
        [attr.alt]="alt() ?? ''"
        [width]="px()"
        [height]="px()"
        loading="lazy"
        decoding="async"
      />
    } @else {
      <span
        class="initials"
        [attr.role]="alt() ? 'img' : null"
        [attr.aria-hidden]="alt() ? null : 'true'"
        [attr.aria-label]="alt()"
      >
        {{ initials() }}
      </span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      width: var(--pan-photo-size);
      height: var(--pan-photo-size);
      overflow: hidden;
      border-radius: 8px;
      background: var(--mat-sys-surface-container-high);
      vertical-align: middle;
    }
    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .initials {
      display: grid;
      place-items: center;
      width: 100%;
      height: 100%;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-label-medium);
      font-size: calc(var(--pan-photo-size) * 0.36);
      font-weight: 700;
    }
  `,
  host: { '[style.--pan-photo-size.px]': 'px()' },
})
export class ItemPhoto {
  readonly itemId = input.required<string>();
  /** `photoRevision` of the item DTO; null = no photo (shows the initials without asking the server). */
  readonly revision = input<number | null | undefined>(null);
  readonly name = input<string | null>(null);
  readonly sku = input<string | null>(null);
  readonly size = input<PhotoSize>('Thumbnail');
  readonly px = input(40);
  /** Alternative text when the photo carries meaning by itself; otherwise decorative. */
  readonly alt = input<string | null>(null);

  private readonly api = inject(ItemPhotosApi);
  private readonly photo = rxResource({
    params: () => ({ id: this.itemId(), revision: this.revision(), size: this.size() }),
    stream: ({ params }) =>
      params.revision ? this.api.url(params.id, params.revision, params.size) : of(null),
  });
  protected readonly url = computed(() => (this.photo.hasValue() ? this.photo.value() : null));
  protected readonly initials = computed(() => photoInitials(this.name(), this.sku()));
}
