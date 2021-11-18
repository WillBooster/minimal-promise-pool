const { build } = require('esbuild');
const { dtsPlugin } = require('esbuild-plugin-d.ts');

Promise.all([
  build({
    bundle: true,
    entryPoints: ['src/index.ts'],
    format: 'esm',
    minify: true,
    outfile: 'dist/index.min.mjs',
    plugins: [dtsPlugin()],
    sourcemap: true,
  }),
  build({
    bundle: true,
    entryPoints: ['src/index.ts'],
    format: 'cjs',
    minify: true,
    outfile: 'dist/index.min.cjs',
    sourcemap: true,
  }),
]).then();
