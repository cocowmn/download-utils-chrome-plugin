<div>
<h1 style="display: flex; align-items: center;">
  <img src="./logo.png" alt="sloppity bo-boppity Chrome Download Tools plugin logo" width="48"/>&nbsp;&nbsp;Chrome Download Tools
</h1>
</div>

A Chrome extension that adds javascript utilities for downloading images from web pages, including sensible batching and animation-safe handling. In the spirit of being Real and True **and** Honest&trade;, although this repo is like 85% AI generated, it's 100% jabroni approved.

## Installation

Load as an unpacked extension in Chrome:
  1. Clone or download this repository to a permanent location on your device
  2. Open Chrome and navigate to `chrome://extensions`.
  3. Enable "Developer mode" (top-right toggle).
  4. Click "Load unpacked" and select the `plugin/` directory.

## API Overview
The core download helpers are exposed on `window`:
- `downloadImage(image, filenameOrOptions?)`
- `downloadImages(images, options?)`

### `downloadImage(image, filenameOrOptions?)`
Download a single image from an `<img>` element, inline `<svg>`, `<canvas>`, or URL.
- `image`: `HTMLImageElement | SVGSVGElement | HTMLCanvasElement | string`
- `filenameOrOptions` (optional):
  - String: base filename (with or without extension).
  - Object:
    - `filename?: string | (self?: HTMLImageElement | SVGSVGElement | HTMLCanvasElement | string, params?: any) => string` — override filename or lazy resolver. Receives the image argument as `self` and your `params` value.
    - `preferNetwork?: boolean` — force fetch of original bytes (useful to preserve animations). Defaults to `true` for raw URLs and when the URL looks animated/unknown; otherwise uses canvas.
    - `preferCanvas?: boolean` — force a canvas-based download even when the URL looks animated or would otherwise fetch.
    - `convert?: 'webp' | 'avif' | 'jpg'` — re-encode single-frame images to the specified format. Cannot convert SVG.
    - `downloadTimeoutMS?: number` — max time to wait for a provided `<img>` to finish loading before falling back.
    - `params?: any` — arbitrary data forwarded to the `filename` function.

Returns a `Promise<void>`.

### `downloadImages(images, options?)`
Batch-download multiple images with controlled concurrency.
- `images`: Array of:
  - `HTMLImageElement | SVGSVGElement | HTMLCanvasElement | string`, or
  - `[image, filenameOrOptions]` tuple to pass per-item options (same shape as `downloadImage`).
- `options` (optional):
  - Batch Options
    - `batchSize?: number` — items processed concurrently per batch (default: 5).
    - `delayMS?: number` — delay between batches in milliseconds (default: 500).
  - Default Image Download Options
    - `filename?: string | (self?: HTMLImageElement | SVGSVGElement | HTMLCanvasElement | string, params?: any) => string` — override filename or lazy resolver. Receives the image argument as `self` and your `params` value.
    - `preferNetwork?: boolean` — signal to prefer fetching original bytes (useful to preserve animations). Defaults follow `downloadImage`.
    - `preferCanvas?: boolean` — signla to prefer HTML canvas-based downloads.
    - `convert?: 'webp' | 'avif' | 'jpg'` — re-encode single-frame images to the specified format. Cannot convert SVG.
    - `downloadTimeoutMS?: number` — max wait for `<img>` loads before timing out.
    - `params?: any` — arbitrary data forwarded to the `filename` function.

Returns a `Promise<PromiseSettledResult[]>`.

## Usage Examples

### Single Image
```js
const image = document.querySelector('img#some-specific-image');

// Can download using 
// the tag reference,
await downloadImage(image);
// the absolute URL,
await downloadImage('https://example.com/picture.png');
// or a relative URL
await downloadImage('/images/sample.svg');
// or a canvas element
await downloadImage(document.querySelector('canvas'));


// Optional second argument can specify a base file name
await downloadImage('/img/asdf123.png', 'my-picture'); // downloads 'my-picture.png'
// Optional second argument can specify config options
await downloadImage(image, {
  filename: (self, params) => `${params.prefix || 'img'}-${Date.now()}`,
  params: { prefix: 'hero' },
  convert: 'jpg', // convert to JPG
  preferNetwork: true, // force the image to be downloaded via fetch instead of using HTML canvas
}); // downloads like 'hero-1697040000000.jpg'
```

### Batch Downloads
```js
await downloadImages([
  img1,
  img2,
  [img3, 'third-photo'],
  ['/photo.gif', { preferNetwork: true }],
  ['/wallpaper.png', { convert: 'avif' }],
], { batchSize: 3, delayMS: 300 });
```

```js
const images = Array.from(document.querySelectorAll('article.post img.image-class'));
await downloadImages(images);
```

You may also specify default values for downloading images in the `options` argument of `downloadImages`. These can be overridden on a per-image basis in the `images` argument array as demonstrated below:
```js
await downloadImages([
  img1, // prefer network = true, converts to webp
  [img2, {convert: 'jpg'}], // prefer network = true, converts to jpg
  [img3, {preferNetwork: false}], // prefer network = false, converts to webp
], {
  batchSize: 5, preferNetwork: true, convert: 'webp'
})
```

## Building & Modification
Source TypeScript lives under `src/`. Bundled, minified modules land in `plugin/modules/`.

  1. Install dependencies: `npm install`
  2. Build: `npm run build`
     - Each `src/<feature>/index.ts` bundles to `plugin/modules/<feature>.js` (e.g., `src/image-downloader` → `plugin/modules/image-downloader.js`).
  3. Reload the extension from `plugin/` in Chrome to pick up the new bundle.

Edit code in `src/<feature>/*` (e.g., `src/image-downloader`) and rebuild to regenerate the JS used by the extension.

### Add New Features
Each feature functions as a standalone script that is loaded in the browser via `<script>` tag. To add a new feature:

  1. Create the feature folder in `/src/<new-feature-name>`, and add an `index.ts` file&mdash;this will be your feature entry point. See `/src/image-downloader` for inspiration.
     * _**Note: your feature name should ideally be lower kebab-case, no spaces**_
  2. Run `npm run build` to transpile the source code into minified javascript. If your feature was called `archive-tool`, it would be bundled and saved to `/plugin/modules/archive-tool.js`.
  3. After running `npm run build`, you should notice that the `scripts` array at the top of `plugin/content.js` has been updated with your feature. If it has not been added, you may manually add the base filename of the script that was added to `plugin/modules`. If the file added was called `my-feature.js`, you would add `'my-feature'` to the `scripts` array.
  4. In chrome, navigate to `chrome://extensions` in the URL bar and reload the `Chrome Download Tools` extension to load the latest changes.

### Build-Free JavaScript-only Additions

To add modifications without writing typescript or pulling in node and build steps, you can manually add features as individual javascript files to `/plugin/modules`. After adding your files, continue with steps 3 and 4 from the above list to load your changes in the browser.
