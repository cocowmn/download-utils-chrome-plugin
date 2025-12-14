import { batchDelayForEach, createImage, resolveURL, type Nullable } from '$utils';
import { IMAGE_TYPE_CANVAS, IMAGE_TYPE_IMG, IMAGE_TYPE_SVG, IMAGE_TYPE_URL } from './constants';
import {
  canvasToBlob,
  getImageInputType,
  getMetadataFromURL,
  imageToBlobHelper,
  mergeOptionsWithDefaults,
  normalizeDownloadOptions,
  saveImage,
  svgToBlob,
} from './helpers';
import type {
  BatchImageDownloadOptions,
  DownloadableImage,
  ImageDownloadMetadata,
  ImageMetadata,
  NameOrDownloadImageOptions,
} from './types';

/**
 * Retrieve Blob data from:
 *  - an <img> element
 *  - an inline <svg> element
 *  - a <canvas> element
 *  - a URL string (absolute or relative)
 */
export async function imageToBlob(
  inputImage: DownloadableImage,
  filenameOrOptions?: NameOrDownloadImageOptions,
): Promise<ImageDownloadMetadata> {
  const options = normalizeDownloadOptions(filenameOrOptions, inputImage);
  let image: Nullable<HTMLImageElement>, metadata: ImageMetadata;

  const type = getImageInputType(inputImage);
  switch (type) {
    case IMAGE_TYPE_IMG: {
      image = inputImage as HTMLImageElement;
      const src = resolveURL(image.currentSrc ?? image.src);
      metadata = getMetadataFromURL(src, options);
      break;
    }
    case IMAGE_TYPE_URL: {
      const src = resolveURL(inputImage as string);
      metadata = getMetadataFromURL(src, options);
      if (options.preferCanvas) image = await createImage(src, options.downloadTimeoutMS);
      break;
    }
    case IMAGE_TYPE_SVG:
      return svgToBlob(inputImage as SVGSVGElement);
    case IMAGE_TYPE_CANVAS:
      return await canvasToBlob(inputImage as HTMLCanvasElement, { src: 'HTML5 Canvas' }, options);
    default:
      throw TypeError(`Unrecognized image input`);
  }

  return await imageToBlobHelper(image, metadata, options);
}

/**
 * Download an image from:
 *  - an <img> element
 *  - an inline <svg> element
 *  - a <canvas> element
 *  - a URL string (absolute or relative)
 */
export async function downloadImage(
  image: DownloadableImage,
  filenameOrOptions?: NameOrDownloadImageOptions,
) {
  const options = normalizeDownloadOptions(filenameOrOptions, image);
  const download = await imageToBlob(image, options);
  saveImage(download, options);
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
  images: (DownloadableImage | [DownloadableImage, NameOrDownloadImageOptions])[],
  options: BatchImageDownloadOptions = {},
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
