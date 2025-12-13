import { globSync } from 'glob';
import path from 'path';

export function getCustomModules() {
  return Object.fromEntries(
    globSync('src/modules/*/index.ts').map((file) => {
      const dir = path.basename(path.dirname(file)); // e.g., image-downloader
      return [dir, file]; // results in image-downloader.js in outDir
    }),
  );
}
