import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores(['dist', 'coverage']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/lib/datetime.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'toLocaleString', message: 'Use lib/datetime.ts' },
        { object: 'Date', property: 'toLocaleDateString', message: 'Use lib/datetime.ts' },
        { object: 'Date', property: 'toLocaleTimeString', message: 'Use lib/datetime.ts' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'MemberExpression[property.name=/^(toLocaleString|toLocaleDateString|toLocaleTimeString)$/]',
          message: 'Use lib/datetime.ts',
        },
      ],
    },
  },
])
