import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { Notifier } from '../../../core/http/notifier';
import { ConfirmService } from '../../../shared/components/confirm-summary/confirm-summary';
import { ItemPhoto } from '../../../shared/components/item-photo/item-photo';
import { ItemPhotosApi } from '../../../shared/data-access/item-photos';
import { photoFiles } from '../../../shared/forms/image-resize';

/**
 * Foto tab of an item (frontend §7.2): the current photo, **Elegir foto** or **Tomar foto** (the camera of a phone or
 * tablet), resized in the browser to 512 px and a 96 px thumbnail before uploading, and **Quitar foto**.
 */
@Component({
  selector: 'app-item-photo-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, ItemPhoto],
  template: `
    <section class="pan-card editor" aria-labelledby="item-photo-title">
      <h2 id="item-photo-title">Foto</h2>
      <app-item-photo
        class="preview"
        [itemId]="itemId()"
        [revision]="revision()"
        [name]="name()"
        [sku]="sku()"
        size="Full"
        [px]="240"
        [alt]="revision() ? 'Foto de ' + sku() : 'Sin foto'"
      />
      <p class="muted">
        Sirve para reconocer el producto en los selectores y listas. Se reduce a 512 px antes de
        subirla.
      </p>
      @if (!readonly()) {
        <div class="actions">
          <input #picker type="file" accept="image/*" hidden (change)="chosen($event)" />
          <input
            #camera
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            (change)="chosen($event)"
          />
          <button matButton="filled" type="button" [disabled]="busy()" (click)="picker.click()">
            <mat-icon>upload</mat-icon>
            {{ revision() ? 'Cambiar foto' : 'Elegir foto' }}
          </button>
          <button matButton="tonal" type="button" [disabled]="busy()" (click)="camera.click()">
            <mat-icon>photo_camera</mat-icon>
            Tomar foto
          </button>
          @if (revision()) {
            <button matButton type="button" [disabled]="busy()" (click)="remove()">
              <mat-icon>delete</mat-icon>
              Quitar foto
            </button>
          }
        </div>
      }
      @if (busy()) {
        <p class="muted" role="status">Subiendo la foto…</p>
      }
      @if (error(); as error) {
        <p class="error" role="alert">{{ error }}</p>
      }
    </section>
  `,
  styles: `
    .editor {
      display: grid;
      justify-items: start;
      gap: 12px;
    }
    h2 {
      margin: 0;
      font: var(--mat-sys-title-medium);
    }
    .preview {
      border-radius: 12px;
    }
    .muted {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .error {
      margin: 0;
      color: var(--mat-sys-error);
    }
  `,
})
export class ItemPhotoEditor {
  readonly itemId = input.required<string>();
  readonly sku = input.required<string>();
  readonly name = input.required<string>();
  readonly revision = input<number | null>(null);
  readonly readonly = input(false);
  /** The new revision after uploading, or null after removing. */
  readonly changed = output<number | null>();

  private readonly api = inject(ItemPhotosApi);
  private readonly confirmService = inject(ConfirmService);
  private readonly notifier = inject(Notifier);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async chosen(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.error.set(null);
    this.busy.set(true);
    try {
      const { image, thumbnail } = await photoFiles(file);
      const photo = await firstValueFrom(this.api.upload(this.itemId(), image, thumbnail));
      this.notifier.info('Foto guardada.');
      this.changed.emit(photo.revision);
    } catch (e) {
      // Resizing errors come in Spanish; the server's are shown by the error interceptor.
      if (e instanceof Error && !('status' in e)) this.error.set(e.message);
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Quitar la foto',
      message: `${this.sku()} se mostrará con sus iniciales en los selectores y listas.`,
      confirmLabel: 'Quitar foto',
    });
    if (!confirmed) return;
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.remove(this.itemId()));
      this.notifier.info('Foto quitada.');
      this.changed.emit(null);
    } catch {
      // The error interceptor shows why.
    } finally {
      this.busy.set(false);
    }
  }
}
