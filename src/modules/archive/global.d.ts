export {};

declare global {
  var Archive: typeof import('$lib/archive').Archive;
  var downloadArchives: typeof import('$lib/archive').downloadArchives;

  interface Window {
    Archive: typeof Archive;
    downloadArchives: typeof downloadArchives;
  }
}
