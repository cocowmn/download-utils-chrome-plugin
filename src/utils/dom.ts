import { isDefined, type Nullable } from '$utils/optional';

/**
 * Resolve a possibly-relative URL against the current page.
 */
export function resolveURL(url: string): string {
  try {
    return new URL(url, window.location.href).href;
  } catch {
    return url; // If URL is invalid, let fetch fail and warn later.
  }
}

/**
 * Wait for an HTMLImageElement to finish loading.
 */
export function imageIsLoaded(img: HTMLImageElement, timeoutMS?: number): Promise<void> {
  if (img.complete && img.naturalWidth !== 0) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const hasTimeout = isDefined(timeoutMS) && typeof timeoutMS === 'number' && timeoutMS > 0;

    const onLoad = () => {
      cleanup();
      resolve();
    };
    const onError = (e: any) => {
      cleanup();
      reject(e || new Error('Image failed to load'));
    };
    const cleanup = () => {
      if (timeout) clearTimeout(timeout);
      img.removeEventListener('load', onLoad);
      img.removeEventListener('error', onError);
    };
    const onTimeout = hasTimeout
      ? () => {
          cleanup();
          reject(`Image failed to load before the timeout of ${timeoutMS}ms`);
        }
      : () => {};

    img.addEventListener('load', onLoad, { once: true });
    img.addEventListener('error', onError, { once: true });

    const timeout: Nullable<ReturnType<typeof setTimeout>> =
      (hasTimeout && setTimeout(onTimeout, timeoutMS)) || undefined;
  });
}

/**
 * Set image attributes that will typically prevent the image from tainting a <canvas>
 */
export function markImageDownloadable(image: HTMLImageElement): HTMLImageElement {
  image.crossOrigin = 'anonymous';
  image.loading = 'eager';
  image.referrerPolicy = 'no-referrer';
  return image;
}

/**
 * Create an <img> with typically <canvas>-safe attributes, then wait for it to finish loading
 */
export async function createImage(url: string, timeoutMS?: number): Promise<HTMLImageElement> {
  const image = markImageDownloadable(new Image());
  image.src = url;
  await imageIsLoaded(image, timeoutMS);
  return image;
}

/**
 * Wrap canvas.toBlob in a Promise.
 */
export function canvasToBlob(canvas: HTMLCanvasElement, type?: Nullable<string>): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) =>
          isDefined(blob) ? resolve(blob) : reject(new Error('Canvas toBlob returned null')),
        type || undefined,
      );
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Re-encode an image blob to a target MIME using a canvas.
 * Falls back to the original blob if conversion fails.
 */
export async function convertBlobToFormat(blob: Blob, targetMime: string): Promise<Blob> {
  if (!targetMime) return blob;
  try {
    const canvas = document.createElement('canvas');
    let drew = false;

    const bitmap = await createImageBitmap(blob);
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(bitmap, 0, 0);
      drew = true;
    }
    bitmap.close();

    if (!drew) {
      const img = document.createElement('img');
      const url = URL.createObjectURL(blob);
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return blob;
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
    }

    const converted = await canvasToBlob(canvas, targetMime);
    return converted || blob;
  } catch {
    return blob;
  }
}

/**
 * Create or update a <canvas> and draw a given <img> to it
 */
export function drawImageToCanvas(
  image: HTMLImageElement,
  canvas?: HTMLCanvasElement,
): Nullable<HTMLCanvasElement> {
  canvas = isDefined(canvas) ? canvas : document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;

  ctx.drawImage(image, 0, 0);
  return canvas;
}
