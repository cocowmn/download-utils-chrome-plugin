import { batchDelayForEach, type BatchDelayOptions } from '$utils';
import {
  isSVGElement,
  mergeOptionsWithDefaults,
  normalizeDownloadOptions,
  startCanvasDownload,
  startImageTagDownload,
  startInlineSVGDownload,
  startURLDownload,
} from './helpers';
import type { DownloadImageOptions, DownloadableImage } from './types';

/**
 * Download an image from:
 *  - an <img> element
 *  - an inline <svg> element
 *  - a URL string (absolute or relative)
 */
export async function downloadImage(
  image: DownloadableImage,
  filenameOrOptions?: string | DownloadImageOptions,
) {
  const options = normalizeDownloadOptions(filenameOrOptions, image);

  const isHTMLImage = image instanceof HTMLImageElement;
  if (isHTMLImage) return startImageTagDownload(image, options);

  const isURL = typeof image === 'string';
  if (isURL) return startURLDownload(image, options);

  const isCanvas = image instanceof HTMLCanvasElement;
  if (isCanvas) return startCanvasDownload(image, options);

  if (isSVGElement(image)) return startInlineSVGDownload(image, options);

  console.warn('downloadImage: Unsupported input type', image);
}

/**
 * Download multiple images with controlled concurrency.
 *
 * @param images
 *   Items to download. Each entry can be a single image/URL or a tuple of [image/URL, filenameOrOptions].
 * @param options Timing/concurrency options and global defaults applied per item unless overridden.
 * @param {number} [options.batchSize=5] Number of items to process concurrently per batch (default = 5)
 * @param {number} [options.delayMS=500] Delay between batches in milliseconds (default = 500)
 * @returns {Promise<unknown[]>}
 */
export async function downloadImages(
  images: (DownloadableImage | [DownloadableImage, string | DownloadImageOptions])[],
  options: BatchDelayOptions & DownloadImageOptions = {},
) {
  const { batchSize = 5, delayMS = 500, ...defaults } = options ?? {};
  if (images instanceof NodeList) images = Array.from(images);

  return batchDelayForEach(
    images,
    (entry) => {
      const [image, itemOptions] = Array.isArray(entry) ? entry : [entry!, undefined];
      const downloadOptions = mergeOptionsWithDefaults(itemOptions, defaults);
      return downloadImage(image, downloadOptions);
    },
    { batchSize, delayMS },
  );
}
