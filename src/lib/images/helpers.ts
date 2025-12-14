import {
  canvasToBlob as canvasToBlobHelper,
  convertBlobToFormat,
  createImage,
  drawImageToCanvas,
  isDefined,
  isNonEmptyString,
  isNullish,
  triggerDownload,
  type Nullable,
} from '$utils';
import {
  ANIMATED_FORMATS,
  CONVERSION_EXTENSIONS,
  EXTENSION_TO_MIME_MAP,
  IMAGE_TYPE_CANVAS,
  IMAGE_TYPE_IMG,
  IMAGE_TYPE_SVG,
  IMAGE_TYPE_UNKNOWN,
  IMAGE_TYPE_URL,
  KNOWN_IMAGE_EXTENSIONS,
  MIME_TO_EXTENSION_MAP,
  STATIC_IMAGE_EXTENSIONS,
  URL_IMAGE_FORMAT_KEYS,
} from './constants';
import type {
  DownloadableImage,
  DownloadableImageTypeFlag,
  DownloadImageOptions,
  ImageDownloadMetadata,
  ImageMetadata,
  ImageURL,
  NormalizedDownloadOptions,
} from './types';

/* -------------------------------------------------------------------------- */
/* Main paths                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Normalize download options supporting legacy filename or config object.
 * @param {string | { filename?: string | ((self?: HTMLImageElement | SVGSVGElement | ImageURL, params?: any) => string), preferNetwork?: boolean, convert?: 'webp' | 'avif' | 'jpg', params?: any }} input
 * @param {HTMLImageElement | SVGSVGElement | ImageURL} [image]
 * @returns {{ filename?: string, preferNetwork?: boolean, convertMime?: string, params?: any }}
 */
export function normalizeDownloadOptions(
  input: Nullable<string | DownloadImageOptions | NormalizedDownloadOptions>,
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
  const convertMime =
    ('convert' in input && getMimeForConvert(input.convert)) ||
    ('convertMime' in input && input.convertMime) ||
    undefined;

  // Default to 5000 when key undefined; allows value undefined to be used when timeout should not occur
  const downloadTimeoutMS = 'downloadTimeoutMS' in input ? input.downloadTimeoutMS : 5000;

  return {
    ...(hasFilename && { filename }),
    ...(input.preferNetwork === true && { preferNetwork: true }),
    ...(input.preferCanvas === true && { preferCanvas: true }),
    ...(convertMime && { convertMime }),
    ...(input.params && { params: input.params }),
    downloadTimeoutMS,
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

export async function imageToBlobHelper(
  imageElement: Nullable<HTMLImageElement>,
  metadata: ImageMetadata,
  options: NormalizedDownloadOptions,
): Promise<ImageDownloadMetadata> {
  let download: ImageDownloadMetadata | undefined = undefined;

  const downloadFromNetwork = async (isRetry = false) => {
    try {
      download = await getImageBlobFromNetwork(metadata.src, options);
    } catch (error) {
      if (isRetry) throw error;
      downloadFromCanvas(true);
    }
  };

  const downloadFromCanvas = async (isRetry = false) => {
    try {
      const image = isDefined(imageElement) ? imageElement : await createImage(metadata.src);
      download = await getImageBlobFromCanvas(image, metadata, options);
    } catch (error) {
      if (isRetry) throw error;
      downloadFromNetwork(true);
    }
  };

  if (doesPreferNetwork(metadata, options)) await downloadFromNetwork();
  else await downloadFromCanvas();

  if (isNullish(download)) throw `Failed to download an image`;

  metadata.name = getDownloadFilename({
    ...(isNonEmptyString(options.filename) && { overrideName: options.filename }),
    ...(isNonEmptyString(metadata.src) && { url: metadata.src }),
    ...(isNonEmptyString((download as ImageDownloadMetadata).mime) && {
      mime: (download as ImageDownloadMetadata).mime!,
    }),
    defaultExt: 'img',
    defaultBase: 'image',
  });

  return mergeMetadata(download, metadata);
}

export async function saveImage(
  download: ImageDownloadMetadata,
  options: NormalizedDownloadOptions = {},
) {
  download = await convertBlob(download, options);
  const { blob, mime, src: url } = download;
  const { filename: overrideName } = options;

  const filename = getDownloadFilename({
    ...(isNonEmptyString(overrideName) && { overrideName }),
    ...(isNonEmptyString(url) && { url }),
    ...(isNonEmptyString(mime) && { mime }),
    defaultExt: 'img',
    defaultBase: 'image',
  });

  triggerDownload(blob, filename);
}

async function getImageBlobFromNetwork(
  url: ImageURL,
  options?: Pick<NormalizedDownloadOptions, 'convertMime'>,
): Promise<ImageDownloadMetadata> {
  let response;
  try {
    response = await fetch(url);
  } catch (_) {
    throw `[getImageBlob_fetch] Network error while fetching image`;
  }

  if (!response.ok)
    throw `[getImageBlob_fetch]: network error, status ${response.status} while fetching image`;

  const contentTypeHeader = response.headers.get('Content-Type') || '';
  const contentType = contentTypeHeader.split(';')[0]?.trim().toLowerCase();

  if (contentType && !contentType.startsWith('image/'))
    throw `[getImageBlob_fetch] fetched resource is not an image: Content-Type: ${contentTypeHeader}`;

  const blob = await response.blob();
  const mime =
    contentType && contentType.startsWith('image/')
      ? contentType
      : blob.type && blob.type.startsWith('image/')
        ? blob.type
        : undefined;

  if (!mime || !mime.startsWith('image/'))
    throw `[getImageBlob_fetch] fetched data is not an image (no usable image MIME type)`;

  return convertBlob({ blob, mime }, options);
}

async function getImageBlobFromCanvas(
  image: HTMLImageElement,
  metadata: ImageMetadata,
  options: NormalizedDownloadOptions,
): Promise<ImageDownloadMetadata> {
  const canvas = drawImageToCanvas(image);
  if (isNullish(canvas))
    throw `[getImageBlob_canvas] Failed to draw image to canvas (${metadata.src})`;

  const blob = await canvasToBlobHelper(canvas, options.convertMime ?? metadata.extension);
  const mime = blob.type || options.convertMime || metadata.extension || 'image/png';

  return mergeMetadata({ blob, mime }, metadata);
}

/* -------------------------------------------------------------------------- */
/* Blob & Canvas Helpers                                                               */
/* -------------------------------------------------------------------------- */

export function svgToBlob(
  svgEl: SVGSVGElement | Element,
  metadata?: ImageMetadata,
): ImageDownloadMetadata {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  if (!clone.getAttribute('xmlns')) {
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }

  const serializer = new XMLSerializer();
  const source = serializer.serializeToString(clone);
  const mime = 'image/svg+xml';

  const name = getDownloadFilename({
    mime,
    defaultExt: 'svg',
    defaultBase: 'image',
  });

  return mergeMetadata({ blob: new Blob([source], { type: mime }), mime }, {
    ...metadata,
    extension: 'svg',
    name,
  } as ImageMetadata);
}

export async function canvasToBlob(
  canvas: HTMLCanvasElement,
  metadata: ImageMetadata,
  options?: Pick<NormalizedDownloadOptions, 'convertMime'>,
): Promise<ImageDownloadMetadata> {
  const blob = await canvasToBlobHelper(canvas, options?.convertMime ?? metadata.extension);
  const mime = blob.type || options?.convertMime || metadata.extension || 'image/png';
  return mergeMetadata({ blob, mime }, metadata);
}

async function convertBlob(
  download: ImageDownloadMetadata,
  options?: NormalizedDownloadOptions,
): Promise<ImageDownloadMetadata> {
  if (isNullish(options?.convertMime) || options.convertMime === download.mime) return download;

  try {
    return {
      ...download,
      blob: await convertBlobToFormat(download.blob, options.convertMime),
      mime: options.convertMime,
    };
  } catch (error) {
    console.warn(
      `[convertBlob] Failed to convert image from ${download.mime} to ${options.convertMime}`,
      error,
    );
    return download;
  }
}

/* -------------------------------------------------------------------------- */
/* URL, type, and filename helpers                                            */
/* -------------------------------------------------------------------------- */

export function getImageInputType(image: DownloadableImage): DownloadableImageTypeFlag {
  const isHTMLImage = image instanceof HTMLImageElement;
  if (isHTMLImage) return IMAGE_TYPE_IMG;

  const isURL = typeof image === 'string';
  if (isURL) return IMAGE_TYPE_URL;

  const isCanvas = image instanceof HTMLCanvasElement;
  if (isCanvas) return IMAGE_TYPE_CANVAS;

  if (isSVGElement(image)) return IMAGE_TYPE_SVG;

  return IMAGE_TYPE_UNKNOWN;
}

/**
 * Parse file formatting information from image URL
 */
export function getMetadataFromURL(
  url: ImageURL,
  { filename }: NormalizedDownloadOptions,
): ImageMetadata {
  const extension = getExtensionFromURL(url);

  return {
    src: url,
    extension,
    mime: getMimeFromExtension(extension),
    ...(filename && { name: filename }),
  };
}

function mergeMetadata(
  download: ImageDownloadMetadata,
  metadata?: ImageMetadata,
): ImageDownloadMetadata {
  return {
    ...(isDefined(metadata) && metadata),
    ...download,
  };
}

/**
 * Detect if a given element is an <svg>. Supports fallback when `SVGSVGElement` is not available
 */
function isSVGElement(value: unknown): value is SVGSVGElement {
  return (
    (typeof SVGSVGElement !== 'undefined' && value instanceof SVGSVGElement) ||
    (isDefined(value) &&
      typeof value === 'object' &&
      (value as any).nodeType === 1 &&
      typeof (value as any).tagName === 'string' &&
      (value as any).tagName.toLowerCase() === 'svg')
  );
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
/* Mime Type & File Extension helpers                                         */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* Heuristics                                                                 */
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
