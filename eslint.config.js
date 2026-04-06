import tseslint from '@typescript-eslint/eslint-plugin'

export default [
  // Spread typescript-eslint flat/recommended (parser + plugin + rules)
  ...tseslint.configs['flat/recommended'],

  // Project-scoped overrides
  {
    files: ['packages/*/src/**/*.ts', 'scripts/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 'off',
    },
  },

  // Global ignores
  {
    ignores: ['**/dist/**', '**/node_modules/**'],
  },
]
