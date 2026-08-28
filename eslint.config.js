import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import sonarjs from 'eslint-plugin-sonarjs';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['coverage/**', 'dist/**', 'node_modules/**'],
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
  },
  eslint.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      complexity: ['error', { max: 8 }],
      curly: ['error', 'all'],
      eqeqeq: ['error', 'always'],
      'max-depth': ['error', 3],
      'no-console': 'error',
      'no-implicit-coercion': 'error',
      'no-nested-ternary': 'error',
      'no-param-reassign': 'error',
      'no-warning-comments': [
        'error',
        {
          terms: ['todo', 'fixme', 'hack'],
        },
      ],
      'prefer-const': 'error',
    },
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.vitest,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  ...[
    ...tseslint.configs.strictTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
  ].map((config) => ({
    ...config,
    files: ['**/*.ts'],
  })),
  {
    files: ['**/*.ts'],
    plugins: {
      sonarjs,
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          fixStyle: 'inline-type-imports',
          prefer: 'type-imports',
        },
      ],
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/strict-boolean-expressions': [
        'error',
        {
          allowNullableBoolean: false,
          allowNullableObject: false,
          allowNumber: false,
          allowString: false,
        },
      ],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      complexity: ['error', { max: 8 }],
      curly: ['error', 'all'],
      eqeqeq: ['error', 'always'],
      'max-depth': ['error', 3],
      'max-lines-per-function': [
        'error',
        {
          max: 40,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
      'no-console': 'error',
      'no-implicit-coercion': 'error',
      'no-nested-ternary': 'error',
      'no-param-reassign': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSEnumDeclaration',
          message:
            'Use union types or const objects instead of TypeScript enums.',
        },
      ],
      'no-warning-comments': [
        'error',
        {
          terms: ['todo', 'fixme', 'hack'],
        },
      ],
      'prefer-const': 'error',
      'sonarjs/cognitive-complexity': ['error', 12],
      'sonarjs/no-duplicated-branches': 'error',
      'sonarjs/no-identical-functions': 'error',
      'sonarjs/no-nested-functions': 'error',
      'sonarjs/no-small-switch': 'error',
    },
  },
  {
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
      'max-lines-per-function': [
        'error',
        {
          max: 80,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
    },
  },
  prettier,
);
