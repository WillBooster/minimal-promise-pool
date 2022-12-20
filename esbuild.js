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
    target: 'node14',
  }),
  build({
    bundle: true,
    entryPoints: ['src/index.ts'],
    format: 'cjs',
    minify: true,
    outfile: 'dist/index.min.cjs',
    sourcemap: true,
    target: 'node14',
  }),
]).then();
