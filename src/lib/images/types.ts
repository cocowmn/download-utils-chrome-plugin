import type { BatchDelayOptions, Nullable } from '$utils';
import type { Downloadable } from '$utils/download';
import {
  IMAGE_TYPE_CANVAS,
  IMAGE_TYPE_IMG,
  IMAGE_TYPE_SVG,
  IMAGE_TYPE_UNKNOWN,
  IMAGE_TYPE_URL,
} from './constants';

export type ImageURL = `http://${string}` | `https://${string}` | `/${string}` | (string & {});

export type DownloadableImage = HTMLImageElement | HTMLCanvasElement | SVGSVGElement | ImageURL;

export type FilenameGetter = (self?: DownloadableImage, params?: any) => string;

export interface DownloadImageOptions {
  filename?: string | FilenameGetter;
  preferNetwork?: boolean;
  preferCanvas?: boolean;
  convert?: 'webp' | 'avif' | 'jpg';
  downloadTimeoutMS?: number;
  params?: any;
}

export type NameOrDownloadImageOptions = string | DownloadImageOptions;

export type BatchImageDownloadOptions = BatchDelayOptions & DownloadImageOptions;

export type NormalizedDownloadOptions = Omit<DownloadImageOptions, 'filename' | 'convert'> & {
  filename?: string;
  convertMime?: string;
};

export type ImageMetadata = {
  src: string;
  name?: Nullable<string>;
  extension?: Nullable<string>;
  mime?: Nullable<string>;
};

export type ImageDownloadMetadata = Downloadable & Partial<ImageMetadata>;

const _downloadableImageTypes = [
  IMAGE_TYPE_IMG,
  IMAGE_TYPE_URL,
  IMAGE_TYPE_SVG,
  IMAGE_TYPE_CANVAS,
  IMAGE_TYPE_UNKNOWN,
] as const;
export type DownloadableImageTypeFlag = (typeof _downloadableImageTypes)[number];
