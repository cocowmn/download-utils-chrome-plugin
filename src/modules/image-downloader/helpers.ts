import { isDefined, isNullish, type Nullable } from '$utils';
import {
  ANIMATED_FORMATS,
  CONVERSION_EXTENSIONS,
  EXTENSION_TO_MIME_MAP,
  KNOWN_IMAGE_EXTENSIONS,
  MIME_TO_EXTENSION_MAP,
  STATIC_IMAGE_EXTENSIONS,
  URL_IMAGE_FORMAT_KEYS,
} from './constants';
import type {
  DownloadableImage,
  DownloadImageOptions,
  ImageMetadata,
  ImageURL,
  NormalizedDownloadOptions,
} from './types';

/* -------------------------------------------------------------------------- */
/* Main paths                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Handle downloading when given an HTMLImageElement.
 * - Single-frame images: canvas path (no extra network) when possible.
 * - Animated-prone formats: fetch original bytes to preserve animation.
 * @param {HTMLImageElement} image
 * @param {{ filename?: string, preferNetwork?: boolean, convertMime?: string }} [options]
 */
export async function startImageTagDownload(
  documentImage: HTMLImageElement,
  options: NormalizedDownloadOptions = {},
) {
  const src = resolveURL(documentImage.currentSrc ?? documentImage.src);
  const copy = await createImage(src, options.downloadTimeoutMS);
  const image = isDefined(copy) ? copy : markDownloadable(documentImage);
  const metadata: ImageMetadata = getMetadataFromURL(src, options);

  return startImageDownload(image, metadata, options);
}

/**
 * Handle downloading when given a URL string.
 */
export async function startURLDownload(
  imageURL: ImageURL,
  options: NormalizedDownloadOptions = {},
) {
  const src = resolveURL(imageURL);
  const metadata = getMetadataFromURL(src, options);
  const defaultOptions = { ...(!options.preferCanvas && { preferNetwork: true }) };

  return startImageDownload(null, metadata, { ...defaultOptions, ...options });
}

/**
 * Handle downloading when given an inline <svg> element.
 * Produces a text/xml (image/svg+xml) file ending in .svg.
 */
export async function startInlineSVGDownload(
  svgEl: SVGSVGElement | Element,
  options: NormalizedDownloadOptions = {},
) {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  if (!clone.getAttribute('xmlns')) {
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }

  const serializer = new XMLSerializer();
  const source = serializer.serializeToString(clone);

  const blob = new Blob([source], { type: 'image/svg+xml' });

  const { filename: overrideName } = options;
  const filename = getDownloadFilename({
    overrideName: overrideName,
    mime: 'image/svg+xml',
    defaultExt: 'svg',
    defaultBase: 'image',
  });

  triggerDownload(blob, filename);
}

/**
 * Handle downloading a canvas element
 */
export async function startCanvasDownload(
  canvas: HTMLCanvasElement,
  options: NormalizedDownloadOptions,
) {
  try {
    return await downloadCanvas(canvas, { src: window.location.href }, options);
  } catch (error) {
    console.warn(`[startCanvasDownload] Failed to download canvas`, error);
  }
}

async function startImageDownload(
  imageElement: Nullable<HTMLImageElement>,
  metadata: ImageMetadata,
  options: NormalizedDownloadOptions,
) {
  let didNetworkFail = false;
  if (doesPreferNetwork(metadata, options)) {
    try {
      return await downloadImageFromNetwork(metadata, options);
    } catch (error) {
      didNetworkFail = true;
      console.warn(
        `[startImageDownload] Encountered an error while fetching ${metadata.src} via network; will attempt to download via canvas`,
        error,
      );
    }
  }

  const image = isDefined(imageElement) ? imageElement : await createImage(metadata.src);
  if (isNullish(image))
    throw `[startImageDownload] Failed to load image into tag (${metadata.src})`;

  try {
    return await downloadImageFromCanvas(image, metadata, options);
  } catch (error) {
    if (didNetworkFail) {
      console.warn(`[startImageDownload] Failed to download canvas for ${metadata.src}`, error);
      return;
    } else {
      console.warn(
        `[startImageDownload] Failed to download canvas for ${metadata.src}; attempting network download`,
        error,
      );
      try {
        return await downloadImageFromNetwork(metadata, options);
      } catch (nestedError) {
        console.warn(
          `[startImageDownload] Encountered an error while fetching ${metadata.src} via network`,
          nestedError,
        );
        return;
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* URL, type, and filename helpers                                            */
/* -------------------------------------------------------------------------- */

function doesPreferNetwork(metadata: ImageMetadata, options: NormalizedDownloadOptions) {
  if (options.preferNetwork) return true;
  if (options.preferCanvas) return false;

  const hasKnownExtension = metadata.extension && KNOWN_IMAGE_EXTENSIONS.has(metadata.extension);
  const hasStaticExtension = metadata.extension && STATIC_IMAGE_EXTENSIONS.has(metadata.extension);
  const hasUnknownExtension = isNullish(metadata.extension) || !hasKnownExtension;
  return (
    hasUnknownExtension ||
    isPossiblyAnimated(metadata.src) ||
    (hasAnimatedFormatHint(metadata.src) && !hasStaticExtension)
  );
}

/**
 * Resolve a possibly-relative URL against the current page.
 */
function resolveURL(url: string): string {
  try {
    return new URL(url, window.location.href).href;
  } catch {
    return url; // If URL is invalid, let fetch fail and warn later.
  }
}

/**
 * Detect if a given element is an <svg>. Supports fallback when `SVGSVGElement` is not available
 */
export function isSVGElement(value: HTMLElement | (NonNullable<any> & {})) {
  return (
    (typeof SVGSVGElement !== 'undefined' && value instanceof SVGSVGElement) ||
    (isDefined(value) &&
      value.nodeType === 1 &&
      typeof value.tagName === 'string' &&
      value.tagName.toLowerCase() === 'svg')
  );
}

/**
 * Parse file formatting information from image URL
 */
function getMetadataFromURL(url: ImageURL, { filename }: NormalizedDownloadOptions): ImageMetadata {
  const extension = getExtensionFromURL(url);

  return {
    src: url,
    extension,
    mimeType: getMimeFromExtension(extension),
    ...(filename && { name: filename }),
  };
}

/**
 * Wait for an HTMLImageElement to finish loading.
 */
function ensureImageLoaded(img: HTMLImageElement, timeoutMS?: number): Promise<void> {
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
 * Infer an extension from a MIME type.
 */
function getExtensionFromMime(mime: string): Nullable<string> {
  if (!mime) return undefined;
  mime = mime.toLowerCase().trim();

  if (MIME_TO_EXTENSION_MAP[mime]) return MIME_TO_EXTENSION_MAP[mime];

  if (mime.startsWith('image/')) {
    return mime.slice('image/'.length);
  }
  return undefined;
}

/**
 * Infer an extension from a URL's pathname.
 */
function getExtensionFromURL(url: string): Nullable<string> {
  try {
    const u = new URL(url, window.location.href);
    const pathname = u.pathname;
    const lastSegment = pathname.split('/').pop() || '';
    const [base] = lastSegment.split('?');
    const [namePart] = base!.split('#');
    const idx = namePart!.lastIndexOf('.');
    if (idx === -1) return undefined;

    const ext = namePart!.slice(idx + 1).toLowerCase();
    if (!/^[a-z0-9+]+$/.test(ext)) return undefined;
    return ext;
  } catch {
    const path = url.split(/[?#]/)[0];
    const lastSegment = path!.split('/').pop() || '';
    const idx = lastSegment.lastIndexOf('.');
    if (idx === -1) return undefined;
    const ext = lastSegment.slice(idx + 1).toLowerCase();
    if (!/^[a-z0-9+]+$/.test(ext)) return undefined;
    return ext;
  }
}

/**
 * Infer a MIME type from an extension.
 */
function getMimeFromExtension(ext: Nullable<string>): Nullable<string> {
  if (!ext || []) return undefined;
  ext = ext.toLowerCase();

  return EXTENSION_TO_MIME_MAP[ext] || undefined;
}

function getMimeForConvert(ext: Nullable<string>) {
  if (!ext || !CONVERSION_EXTENSIONS.has(ext)) return undefined;
  return ext ? EXTENSION_TO_MIME_MAP[ext] : undefined;
}

/**
 * Normalize download options supporting legacy filename or config object.
 * @param {string | { filename?: string | ((self?: HTMLImageElement | SVGSVGElement | ImageURL, params?: any) => string), preferNetwork?: boolean, convert?: 'webp' | 'avif' | 'jpg', params?: any }} input
 * @param {HTMLImageElement | SVGSVGElement | ImageURL} [image]
 * @returns {{ filename?: string, preferNetwork?: boolean, convertMime?: string, params?: any }}
 */
export function normalizeDownloadOptions(
  input: Nullable<string | DownloadImageOptions>,
  image: DownloadableImage,
): NormalizedDownloadOptions {
  if (typeof input === 'string') {
    return { filename: input };
  }
  if (!input || typeof input !== 'object') return {};

  let filename = input.filename;
  if (typeof filename === 'function') {
    try {
      filename = filename(image, input.params);
    } catch {
      filename = undefined;
    }
  }

  const hasFilename = typeof filename === 'string';
  const convertMime = getMimeForConvert(input.convert);
  return {
    ...(hasFilename && { filename }),
    ...(input.preferNetwork === true && { preferNetwork: true }),
    ...(input.preferCanvas === true && { preferCanvas: true }),
    convertMime,
    params: input.params,
  };
}

export function mergeOptionsWithDefaults(
  perItemOptions?: string | DownloadImageOptions,
  defaults?: DownloadImageOptions,
) {
  if (isNullish(perItemOptions)) return isDefined(defaults) ? { ...defaults } : {};

  const hasDefaults = isDefined(defaults) && Object.keys(defaults).length > 0;
  if (!hasDefaults) return perItemOptions;

  if (typeof perItemOptions === 'string') {
    return { ...defaults, filename: perItemOptions };
  }

  if (perItemOptions && typeof perItemOptions === 'object') {
    return { ...defaults, ...perItemOptions };
  }

  return { ...defaults };
}

interface GetDownloadFilename {
  overrideName?: string;
  url?: string;
  mime?: string;
  defaultExt: string;
  defaultBase: string;
}
/**
 * Compute a reasonable download filename, honoring an optional override.
 *
 * - If overrideName includes an extension, it is used as-is.
 * - If overrideName has no extension, we append one derived from MIME/URL/fallback.
 * - Otherwise, derive from the URL path if possible.
 */
function getDownloadFilename({
  overrideName,
  url,
  mime,
  defaultExt = 'img',
  defaultBase = 'image',
}: GetDownloadFilename): string {
  const extFromMime = mime ? getExtensionFromMime(mime) : null;
  const extFromURL = url ? getExtensionFromURL(url) : null;
  const ext = extFromMime || extFromURL || defaultExt;

  if (overrideName && typeof overrideName === 'string') {
    let name = overrideName.trim();
    if (!name) name = defaultBase;
    const baseName = name.split(/[\/\\]/).pop()!; // strip any path
    const dotIndex = baseName.lastIndexOf('.');
    if (dotIndex > 0 && dotIndex < baseName.length - 1) {
      return baseName;
    } else {
      // No extension on override; append our best guess.
      return `${baseName}.${ext}`;
    }
  }

  if (url) {
    try {
      const u = new URL(url, window.location.href);
      const lastSeg = (u.pathname.split('/').pop() || '').split(/[?#]/)[0];
      if (lastSeg) {
        const dotIndex = lastSeg.lastIndexOf('.');
        if (dotIndex > 0) {
          const base = lastSeg.slice(0, dotIndex);
          return `${base}.${ext}`;
        } else {
          return `${lastSeg}.${ext}`;
        }
      }
    } catch {
      // ignore, fall through
    }
  }

  return `${defaultBase}.${ext}`;
}

/* -------------------------------------------------------------------------- */
/* Blob and fetch helpers                                                     */
/* -------------------------------------------------------------------------- */

async function downloadImageFromNetwork(
  image: ImageMetadata,
  { filename: overrideName, convertMime }: NormalizedDownloadOptions,
) {
  const result = await fetchImageBlob(image.src);
  if (isNullish(result)) throw `[downloadImageFromNetwork] failed to fetch ${image.src}`;

  let { blob, mime } = result;
  if (isDefined(convertMime) && mime !== convertMime) {
    blob = await convertBlobToFormat(blob, convertMime);
    mime = convertMime;
  }

  const filename = getDownloadFilename({
    overrideName,
    url: image.src,
    ...(mime && { mime }),
    defaultExt: 'img',
    defaultBase: 'image',
  });
  triggerDownload(blob, filename);
  return;
}

async function downloadImageFromCanvas(
  image: HTMLImageElement,
  metadata: ImageMetadata,
  options: NormalizedDownloadOptions,
) {
  const canvas = drawImageToCanvas(image);
  if (isNullish(canvas))
    throw `[downloadImageFromCanvas] Failed to draw image to canvas (${metadata.src})`;

  return downloadCanvas(canvas, metadata, options);
}

async function downloadCanvas(
  canvas: HTMLCanvasElement,
  metadata: ImageMetadata,
  { filename: overrideName, convertMime }: NormalizedDownloadOptions,
) {
  try {
    const blob = await canvasToBlob(canvas, convertMime ?? metadata.extension);
    const mimeType = blob.type || convertMime || metadata.extension || 'image/png';

    const filename = getDownloadFilename({
      overrideName: overrideName,
      url: metadata.src,
      mime: mimeType,
      defaultExt: convertMime ? getExtensionFromMime(convertMime) || 'img' : 'png',
      defaultBase: 'image',
    });

    triggerDownload(blob, filename);
  } catch (err) {
    const message = `[downloadImageFromCanvas] canvas export failed (possibly due to CORS)`;
    console.warn(message, err);
    throw message;
  }
}

async function createImage(url: ImageURL, timeoutMS?: number): Promise<Nullable<HTMLImageElement>> {
  const image = markDownloadable(new Image());
  image.src = url;

  try {
    await ensureImageLoaded(image, timeoutMS);
    return image;
  } catch (error) {
    console.warn(`Failed to load image ${url}`, error);
  }
}

function markDownloadable(image: HTMLImageElement): HTMLImageElement {
  image.crossOrigin = 'anonymous';
  image.loading = 'eager';
  image.referrerPolicy = 'no-referrer';
  return image;
}

/**
 * Download a blob as a file with the given file name.
 */
function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function drawImageToCanvas(image: HTMLImageElement): Nullable<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;

  ctx.drawImage(image, 0, 0);
  return canvas;
}

/**
 * Wrap canvas.toBlob in a Promise.
 */
function canvasToBlob(canvas: HTMLCanvasElement, type?: Nullable<string>): Promise<Blob> {
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
async function convertBlobToFormat(blob: Blob, targetMime: string): Promise<Blob> {
  if (!targetMime) return blob;
  try {
    const canvas = document.createElement('canvas');
    let drew = false;

    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(blob);
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0);
        drew = true;
      }
      if (typeof bitmap.close === 'function') bitmap.close();
    }

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

interface FetchImageBlob {
  blob: Blob;
  mime: Nullable<string>;
}
/**
 * Fetch an image URL as a Blob, validating it is an image.
 */
async function fetchImageBlob(url: ImageURL): Promise<Nullable<FetchImageBlob>> {
  let response;
  try {
    response = await fetch(url);
  } catch (err) {
    console.warn('downloadImage: network error while fetching image:', err);
    return undefined;
  }

  if (!response.ok) {
    console.warn(
      'downloadImage: network error, status ' + response.status + ' while fetching image',
    );
    return undefined;
  }

  const contentTypeHeader = response.headers.get('Content-Type') || '';
  const contentType = contentTypeHeader.split(';')[0]?.trim().toLowerCase();

  if (contentType && !contentType.startsWith('image/')) {
    console.warn(
      'downloadImage: fetched resource is not an image. Content-Type:',
      contentTypeHeader,
    );
    return undefined;
  }

  const blob = await response.blob();
  const mime =
    contentType && contentType.startsWith('image/')
      ? contentType
      : blob.type && blob.type.startsWith('image/')
        ? blob.type
        : undefined;

  if (!mime || !mime.startsWith('image/')) {
    console.warn('downloadImage: fetched data is not an image (no usable image MIME type).');
    return undefined;
  }

  return { blob, mime };
}

/* -------------------------------------------------------------------------- */
/* Heuristics                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Heuristic: does the URL point to a format that *may* be animated?
 * (We use this to decide whether to prefer network download over canvas.)
 */
function isPossiblyAnimated(url: ImageURL) {
  return /\.(gif|apng|webp|avif)(?=($|[?#]))/i.test(url);
}

/**
 * Heuristic: does the URL contain querystring hints implying an animated-capable format?
 * e.g., format=webp, fm=gif, type=apng
 */
function hasAnimatedFormatHint(url: ImageURL) {
  try {
    const u = new URL(url, window.location.href);
    const params = u.searchParams;
    for (const key of URL_IMAGE_FORMAT_KEYS) {
      const value = params.get(key);
      if (value && ANIMATED_FORMATS.includes(value.toLowerCase())) {
        return true;
      }
    }
    const search = u.search.toLowerCase();
    return ANIMATED_FORMATS.some(
      (fmt) => search.includes(`format=${fmt}`) || search.includes(`fm=${fmt}`),
    );
  } catch {
    return /(format|fm)=\s*(webp|gif|apng|avif)/i.test(url);
  }
}
