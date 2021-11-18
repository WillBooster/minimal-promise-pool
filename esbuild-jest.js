const { builtinModules } = require('module');
const path = require('path');

const package = require(path.resolve('package.json'));

const external = [
  ...builtinModules,
  ...Object.keys(package.dependencies || {}),
  ...Object.keys(package.devDependencies || {}),
  ...Object.keys(package.peerDependencies || {}),
];

module.exports = {
  process(_, filename) {
    const outputFiles = buildCode(filename);
    return {
      code: outputFiles.find(({ path }) => !path.endsWith('.map')).text,
      map: outputFiles.find(({ path }) => path.endsWith('.map')).text,
    };
  },
};

function buildCode(filename) {
  const { buildSync } = require('esbuild');
  const { outputFiles } = buildSync({
    bundle: true,
    entryPoints: [filename],
    external,
    minify: false,
    outdir: './dist',
    sourcemap: true,
    target: 'node12',
    write: false,
  });
  // Try cleaning-up workers in esbuild
  delete require.cache[require.resolve('esbuild')];
  return outputFiles;
}
