export {};

declare global {
  var downloadImage: typeof import('./image-downloader/api').downloadImage;
  var downloadImages: typeof import('./image-downloader/api').downloadImages;

  interface Window {
    downloadImage: typeof downloadImage;
    downloadImages: typeof downloadImages;
  }
}
