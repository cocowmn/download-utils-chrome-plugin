import { isNonEmptyString, type Nullable } from '$utils/optional';

export interface Downloadable {
  blob: Blob;
  mime: Nullable<string>;
  filename?: string;
}

export function pathJoin(...parts: (string | undefined)[]) {
  const nonnullParts = parts.filter((p) => isNonEmptyString(p));
  return sanitizeFilepath(nonnullParts.join('/'));
}

/**
 * Download a blob as a file with the given file name.
 */
export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function sanitizeFilename(name: string): string {
  if (!isNonEmptyString(name)) return 'file';
  const base = (name ?? '').toString().trim();
  const cleaned = base
    .replace(/[\\/:*?"<>|]+/g, '-') // swap invalid characters
    .replace(/[\u0000-\u001f\u007f]+/g, '') // strip control chars
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .replace(/\.+$/, '');

  return isNonEmptyString(cleaned) ? cleaned : 'file';
}

export function sanitizeFilepath(path: string): string {
  const normalized = (path ?? '').toString().replace(/\\/g, '/');
  const hasTrailing = /\/$/.test(normalized);

  const parts = normalized
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
    .map((segment) => sanitizeFilename(segment));

  const cleaned = parts.join('/');
  if (!cleaned) return 'file';
  return hasTrailing ? `${cleaned}/` : cleaned;
}
