export {};

declare global {
  var imageToBlob: typeof import('$lib/images/api').imageToBlob;
  var downloadImage: typeof import('$lib/images/api').downloadImage;
  var downloadImages: typeof import('$lib/images/api').downloadImages;

  interface Window {
    imageToBlob: typeof imageToBlob;
    downloadImage: typeof downloadImage;
    downloadImages: typeof downloadImages;
  }
}
