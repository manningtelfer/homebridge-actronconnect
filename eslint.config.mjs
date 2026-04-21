import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['dist/**'],
    rules: {
      'quotes': ['warn', 'single'],
      'indent': ['warn', 2, { SwitchCase: 1 }],
      'comma-dangle': ['warn', 'always-multiline'],
      'no-console': ['warn'],
      'max-len': ['warn', 140],
      'eqeqeq': 'warn',
      'curly': ['warn', 'all'],
      'prefer-arrow-callback': ['warn'],
      'comma-spacing': ['error'],
      'no-multi-spaces': ['warn'],
      'no-trailing-spaces': ['warn'],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },
);
