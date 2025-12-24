import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import tsdoc from 'eslint-plugin-tsdoc';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['node_modules/**', 'dist/**', 'build/**', '*.cjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.stylistic,
  {
    plugins: {
      tsdoc,
    },
    rules: {
      // TSDoc/JSDoc enforcement
      'tsdoc/syntax': 'warn',

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
      'no-console': 'off', // CLI tool, console is expected
      'no-debugger': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
    },
    settings: {
      tsdoc: {
        customTags: [
          {
            tagName: '@template',
            syntaxKind: 'block',
            allowAnyContent: true,
          },
        ],
      },
    },
  },
  prettierConfig
);
