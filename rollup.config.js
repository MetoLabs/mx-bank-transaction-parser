import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { terser } from 'rollup-plugin-terser';

export default {
    input: 'src/index.js',
    output: [
        {
            file: 'dist/mx-bank-transaction-parser.esm.js',
            format: 'esm',
            sourcemap: true,
        },
        {
            file: 'dist/mx-bank-transaction-parser.cjs.js',
            format: 'cjs',
            sourcemap: true,
        },
        {
            file: 'dist/mx-bank-transaction-parser.umd.js',
            format: 'umd',
            name: 'MxBankTransactionParser',
            sourcemap: true,
            plugins: [terser()],
        },
    ],
    plugins: [
        resolve(),
        commonjs(),
    ],
};
