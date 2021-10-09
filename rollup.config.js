import babel from '@rollup/plugin-babel';

const extensions = ['.mjs', '.js', '.json', '.ts'];
const plugins = [babel({ extensions, babelHelpers: 'bundled', exclude: 'node_modules/**' })];

export default {
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/index.js',
      format: 'commonjs',
      sourcemap: true,
    },
  ],
  plugins,
};
