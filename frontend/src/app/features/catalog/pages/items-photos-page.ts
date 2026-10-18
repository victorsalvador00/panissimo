import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ItemPhoto } from '../../../shared/components/item-photo/item-photo';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { ItemLookupApi, ItemOption } from '../../../shared/data-access/item-lookup';
import { ItemPhotosApi } from '../../../shared/data-access/item-photos';
import { photoFiles, skuFromFileName } from '../../../shared/forms/image-resize';

type FileState = 'pending' | 'missing' | 'uploading' | 'done' | 'error';

interface PhotoFile {
  file: File;
  sku: string;
  item: ItemOption | null;
  state: FileState;
  message: string | null;
}

const STATE_TAGS: Record<
  FileState,
  { text: string; color: 'grey' | 'blue' | 'green' | 'red' | 'orange' }
> = {
  pending: { text: 'Por subir', color: 'blue' },
  missing: { text: 'Sin artículo', color: 'orange' },
  uploading: { text: 'Subiendo', color: 'blue' },
  done: { text: 'Lista', color: 'green' },
  error: { text: 'Error', color: 'red' },
};

/**
 * /catalogos/articulos/fotos (frontend §7.2): bulk photos named by SKU (`TRENZA.jpg`). Each file is matched to its active
 * item, resized in the browser (512 px and a 96 px thumbnail) and uploaded **one by one**; a file without an item or
 * that fails does not stop the others. An existing photo is replaced.
 */
@Component({
  selector: 'app-items-photos-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButtonModule, MatIconModule, PageHeader, StatusTag, ItemPhoto],
  template: `
    <app-page-header title="Importar fotos de artículos" />

    <section class="pan-card intro">
      <p>
        Nombra cada foto con el SKU del artículo, por ejemplo <strong>TRENZA.jpg</strong>. Se
        reducen a 512 px antes de subirlas y reemplazan la foto que ya tuviera el artículo.
      </p>
      <div class="actions">
        <input #picker type="file" accept="image/*" multiple hidden (change)="chosen($event)" />
        <button matButton="tonal" type="button" [disabled]="running()" (click)="picker.click()">
          <mat-icon>add_photo_alternate</mat-icon>
          Elegir fotos
        </button>
        @if (ready() > 0) {
          <button matButton="filled" type="button" [disabled]="running()" (click)="upload()">
            <mat-icon>upload</mat-icon>
            Subir {{ ready() }} {{ ready() === 1 ? 'foto' : 'fotos' }}
          </button>
        }
      </div>
      @if (summary(); as summary) {
        <p role="status">{{ summary }}</p>
      }
    </section>

    @if (files().length > 0) {
      <section class="pan-card">
        <div class="table-wrap">
          <table aria-label="Fotos por subir">
            <thead>
              <tr>
                <th scope="col">Archivo</th>
                <th scope="col">Artículo</th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              @for (f of files(); track f.file.name + $index) {
                <tr>
                  <td>{{ f.file.name }}</td>
                  <td>
                    @if (f.item; as item) {
                      <span class="item">
                        <app-item-photo
                          [itemId]="item.id"
                          [revision]="item.photoRevision"
                          [name]="item.name"
                          [sku]="item.sku"
                          [px]="32"
                        />
                        <a class="row-link" [routerLink]="['/catalogos/articulos', item.id]">{{
                          item.sku
                        }}</a>
                        {{ item.name }}
                      </span>
                    } @else {
                      <span class="muted">No hay un artículo activo con SKU {{ f.sku }}</span>
                    }
                  </td>
                  <td>
                    <app-status-tag [text]="tag(f).text" [color]="tag(f).color" />
                    @if (f.message) {
                      <span class="message">{{ f.message }}</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 16px;
    }
    .intro {
      display: grid;
      gap: 12px;
      margin: 0;

      p {
        margin: 0;
      }
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .table-wrap {
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;

      th,
      td {
        padding: 6px 8px;
        border-bottom: 1px solid var(--pan-row-divider);
        text-align: left;
        vertical-align: middle;
      }
      th {
        color: var(--mat-sys-on-surface-variant);
        font: var(--mat-sys-label-medium);
      }
    }
    .item {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .muted,
    .message {
      color: var(--mat-sys-on-surface-variant);
    }
    .message {
      margin-left: 8px;
    }
  `,
})
export class ItemsPhotosPage {
  private readonly lookup = inject(ItemLookupApi);
  private readonly photos = inject(ItemPhotosApi);

  protected readonly files = signal<PhotoFile[]>([]);
  protected readonly running = signal(false);
  protected readonly ready = computed(
    () => this.files().filter((f) => f.state === 'pending').length,
  );
  protected readonly summary = computed(() => {
    const files = this.files();
    const done = files.filter((f) => f.state === 'done').length;
    const failed = files.filter((f) => f.state === 'error').length;
    if (this.running() || done + failed === 0) return null;
    return `${done} ${done === 1 ? 'foto subida' : 'fotos subidas'}${failed ? `, ${failed} con error` : ''}.`;
  });

  protected tag(f: PhotoFile) {
    return STATE_TAGS[f.state];
  }

  protected async chosen(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const chosen = Array.from(input.files ?? []);
    input.value = '';
    const matched = await Promise.all(
      chosen.map(async (file): Promise<PhotoFile> => {
        const sku = skuFromFileName(file.name);
        const found = await firstValueFrom(this.lookup.search(sku)).catch(() => [] as ItemOption[]);
        const item = found.find((i) => i.sku.toUpperCase() === sku) ?? null;
        return { file, sku, item, state: item ? 'pending' : 'missing', message: null };
      }),
    );
    this.files.update((files) => [...files.filter((f) => f.state !== 'done'), ...matched]);
  }

  /** One by one: the server and a phone's memory never get several photos at once. */
  protected async upload(): Promise<void> {
    this.running.set(true);
    for (let i = 0; i < this.files().length; i++) {
      const f = this.files()[i];
      if (f.state !== 'pending' || !f.item) continue;
      this.patch(i, { state: 'uploading', message: null });
      try {
        const { image, thumbnail } = await photoFiles(f.file);
        const photo = await firstValueFrom(this.photos.upload(f.item.id, image, thumbnail));
        this.patch(i, { state: 'done', item: { ...f.item, photoRevision: photo.revision } });
      } catch (e) {
        // Resizing errors come in Spanish; the server's reason is also shown by the error interceptor.
        this.patch(i, {
          state: 'error',
          message: e instanceof Error ? e.message : 'El servidor rechazó la foto.',
        });
      }
    }
    this.running.set(false);
  }

  private patch(index: number, changes: Partial<PhotoFile>): void {
    this.files.update((files) => files.map((f, i) => (i === index ? { ...f, ...changes } : f)));
  }
}
