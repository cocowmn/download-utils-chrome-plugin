import type { Nullable } from '$utils';

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
export type NormalizedDownloadOptions = Omit<DownloadImageOptions, 'filename' | 'convert'> & {
  filename?: string;
  convertMime?: string;
};

export type ImageMetadata = {
  src: string;
  name?: Nullable<string>;
  extension?: Nullable<string>;
  mimeType?: Nullable<string>;
};
