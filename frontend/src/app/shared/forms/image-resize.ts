/** Size limits of the item photos (dominio §3, ItemPhoto; the server checks them again). */
export const PHOTO_LIMITS = {
  image: { side: 512, bytes: 300 * 1024 },
  thumbnail: { side: 96, bytes: 50 * 1024 },
} as const;

/** The size that fits `max` on the longer side, keeping the proportion; never enlarges. */
export function fitSize(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** The SKU a photo file is named after (`TRENZA.jpg` → `TRENZA`), for the bulk import. */
export function skuFromFileName(name: string): string {
  // Some browsers include the folder (with / or \).
  const base = name.replace(/^.*[\\/]/, '');
  const dot = base.lastIndexOf('.');
  return (dot > 0 ? base.slice(0, dot) : base).trim().toUpperCase();
}

/** Qualities tried in order until the JPEG fits its byte limit. */
const QUALITIES = [0.86, 0.78, 0.7, 0.6, 0.5, 0.4];

/**
 * Resizes an image with a canvas (frontend §2: no image libraries) to JPEG within `side` px and `bytes`. Transparent
 * pixels become white. Throws a Spanish message when the file is not an image the browser can read or cannot fit.
 */
export async function resizeImage(file: Blob, side: number, bytes: number): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('El archivo no es una imagen que el navegador pueda abrir.');
  }
  const size = fitSize(bitmap.width, bitmap.height, side);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size.width, size.height);
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  for (const quality of QUALITIES) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    );
    if (blob && blob.size <= bytes) return blob;
  }
  throw new Error('No se pudo reducir la imagen al tamaño permitido.');
}

/** Both files of an upload: the photo (512 px) and its thumbnail (96 px). */
export async function photoFiles(file: Blob): Promise<{ image: Blob; thumbnail: Blob }> {
  return {
    image: await resizeImage(file, PHOTO_LIMITS.image.side, PHOTO_LIMITS.image.bytes),
    thumbnail: await resizeImage(file, PHOTO_LIMITS.thumbnail.side, PHOTO_LIMITS.thumbnail.bytes),
  };
}
