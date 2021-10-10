import babel from '@rollup/plugin-babel';
import { terser } from 'rollup-plugin-terser';

const extensions = ['.mjs', '.js', '.json', '.ts'];
const plugins = [babel({ extensions, babelHelpers: 'bundled', exclude: 'node_modules/**' }), terser()];

export default {
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/index.min.mjs',
      format: 'es',
      sourcemap: true,
    },
    {
      file: 'dist/index.umd.min.js',
      format: 'umd',
      name: 'promisePool',
      sourcemap: true,
    },
  ],
  plugins,
};
