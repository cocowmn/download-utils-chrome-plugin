import { defineConfig } from 'tsup';
import { getCustomModules } from './scripts/get-custom-modules';
import { updateContentScript } from './scripts/update-content-script';

const modules = getCustomModules();

export default defineConfig({
  entry: modules,
  outDir: 'plugin/modules',
  format: ['esm'],
  target: 'esnext',
  minify: true,
  splitting: false,
  sourcemap: false,
  clean: false,
  treeshake: true,

  onSuccess: updateContentScript(Object.keys(modules)),
});
