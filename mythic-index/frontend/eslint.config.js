// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '.svelte-kit/**',
      'build/**',
      'dist/**',
      'node_modules/**',
      '*.cjs',
      '.wrangler/**',
      'drizzle/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.stylistic,
  {
    files: ['**/*.ts', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        extraFileExtensions: ['.svelte'],
      },
    },
    rules: {
      // TypeScript rules aligned with Microsoft TypeScript Style Guide
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-member-accessibility': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          vars: 'all',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports' },
      ],
      '@typescript-eslint/no-empty-function': [
        'error',
        {
          allow: ['private-constructors', 'protected-constructors'],
        },
      ],
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-ignore': 'allow-with-description', minimumDescriptionLength: 3 },
      ],
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/no-inferrable-types': 'off',

      // General code quality rules
      'no-useless-escape': 'error',
      'no-fallthrough': 'error',
      'no-console': ['warn', { allow: ['warn', 'error', 'info', 'debug'] }],
      'no-debugger': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['**/*.spec.ts', 'src/test-setup.ts', '**/test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      'no-console': 'off',
    },
  },
  prettierConfig
);
