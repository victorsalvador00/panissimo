import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, shareReplay } from 'rxjs';
import type { ApiEnum, Schemas } from '../../core/api/api';
import { SILENT_ERRORS } from '../../core/http/error.interceptor';
import { httpParams } from './list-query';

export type PhotoSize = ApiEnum<'ItemPhotoSize'>;
export type ItemPhotoInfo = Schemas['ItemPhotoDto'];

/** Object URLs kept at most (thumbnails of a long list plus a few full photos). */
const MAX_CACHED = 400;

/**
 * Item photos (`/items/{id}/photo`, B-24). They need the session, so they download as blobs (the interceptor adds the
 * token) and show through object URLs, cached by item, **revision** and size: a new upload changes the revision, so
 * the old URL is never reused. The browser revalidates the download itself with the ETag (304).
 */
@Injectable({ providedIn: 'root' })
export class ItemPhotosApi {
  private readonly http = inject(HttpClient);
  private readonly cache = new Map<string, { url$: Observable<string | null>; url?: string }>();

  /** The object URL of the photo, or null when the item has none (or it was just removed). */
  url(itemId: string, revision: number, size: PhotoSize): Observable<string | null> {
    const key = `${itemId}|${revision}|${size}`;
    const hit = this.cache.get(key);
    if (hit) {
      // Most recently used goes last.
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit.url$;
    }
    const entry: { url$: Observable<string | null>; url?: string } = { url$: of(null) };
    entry.url$ = this.http
      .get(`items/${itemId}/photo`, {
        params: httpParams({ size }),
        responseType: 'blob',
        // A missing photo is a normal state here, not an error to show.
        context: new HttpContext().set(SILENT_ERRORS, true),
      })
      .pipe(
        map((blob) => (entry.url = URL.createObjectURL(blob))),
        catchError(() => {
          // Not cached: a network blip must not hide the photo for good.
          this.cache.delete(key);
          return of(null);
        }),
        shareReplay(1),
      );
    this.cache.set(key, entry);
    this.trim();
    return entry.url$;
  }

  /** Uploads or replaces the photo (both files already resized by the browser). */
  upload(itemId: string, image: Blob, thumbnail: Blob): Observable<ItemPhotoInfo> {
    const form = new FormData();
    form.append('image', image, `${itemId}.${extension(image.type)}`);
    form.append('thumbnail', thumbnail, `${itemId}-mini.${extension(thumbnail.type)}`);
    return this.http.put<ItemPhotoInfo>(`items/${itemId}/photo`, form);
  }

  remove(itemId: string): Observable<void> {
    return this.http.delete<void>(`items/${itemId}/photo`);
  }

  private trim(): void {
    for (const [key, entry] of this.cache) {
      if (this.cache.size <= MAX_CACHED) return;
      if (entry.url) URL.revokeObjectURL(entry.url);
      this.cache.delete(key);
    }
  }
}

function extension(type: string): string {
  return type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
}
