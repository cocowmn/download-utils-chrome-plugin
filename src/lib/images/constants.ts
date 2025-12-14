export const IMAGE_TYPE_IMG = '<img>';
export const IMAGE_TYPE_URL = 'url';
export const IMAGE_TYPE_SVG = '<svg>';
export const IMAGE_TYPE_CANVAS = '<canvas>';
export const IMAGE_TYPE_UNKNOWN = 'unknown';

export const MIME_TO_EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/apng': 'apng',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
};

export const EXTENSION_TO_MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  apng: 'image/apng',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
};

export const CONVERSION_EXTENSIONS = new Set(['webp', 'avif', 'jpg']);

export const KNOWN_IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'apng',
  'avif',
  'svg',
  'bmp',
  'ico',
]);

export const STATIC_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'bmp', 'ico']);

export const ANIMATED_FORMATS: string[] = ['webp', 'gif', 'apng', 'avif'];
export const URL_IMAGE_FORMAT_KEYS: string[] = ['format', 'fm', 'type', 'imageformat', 'ext'];
