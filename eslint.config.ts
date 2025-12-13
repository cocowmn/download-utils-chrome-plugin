import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import markdown from '@eslint/markdown';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';

export default defineConfig([
  includeIgnoreFile(
    fileURLToPath(new URL('.gitignore', import.meta.url)),
    'Imported .gitignore patterns',
  ),

  // JS (plain)
  {
    files: ['**/*.{js,mjs,cjs}'],
    plugins: { js },
    extends: ['js/recommended'],
    languageOptions: {
      globals: {
        ...globals.browser,
        chrome: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': [
        'warn',
        {
          varsIgnorePattern: '^_($|[A-Za-z0-9_]+)',
          argsIgnorePattern: '^_($|[A-Za-z0-9_]+)',
          caughtErrorsIgnorePattern: '^_($|[A-Za-z0-9_]+)',
          ignoreRestSiblings: true,
        },
      ],
    },
  },

  // TypeScript base
  // @ts-ignore
  tseslint.configs.recommended,

  // TypeScript overrides
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    rules: {
      'no-unused-vars': 'off',

      // Allow empty interface/object type (new name replaces no-empty-interface)
      '@typescript-eslint/no-empty-object-type': 'off',

      // Allow explicit any
      '@typescript-eslint/no-explicit-any': 'off',

      // allow @ts-ignore
      '@typescript-eslint/ban-ts-comment': 'off',

      // allow unused variables with leading underscore
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          varsIgnorePattern: '^_($|[A-Za-z0-9_]+)',
          argsIgnorePattern: '^_($|[A-Za-z0-9_]+)',
          caughtErrorsIgnorePattern: '^_($|[A-Za-z0-9_]+)',
          ignoreRestSiblings: true,
        },
      ],
    },
  },

  // Markdown
  {
    files: ['**/*.md'],
    plugins: { markdown },
    language: 'markdown/gfm',
    extends: ['markdown/recommended'],
  },
]);
