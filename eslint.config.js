const js = require('@eslint/js')
const tseslint = require('typescript-eslint')
const prettierRecommended = require('eslint-plugin-prettier/recommended')
const unusedImports = require('eslint-plugin-unused-imports')
const globals = require('globals')

module.exports = tseslint.config(
	{
		ignores: [
			'ecosystem.config.js',
			'src/generated/i18n.generated.ts',
			'deprecated/**',
			'.tmp/**',
			'hmr.config.js',
			'webpack.config.js',
			'eslint.config.js'
		]
	},

	js.configs.recommended,
	...tseslint.configs.recommended,
	prettierRecommended,

	{
		files: ['**/*.ts'],
		languageOptions: {
			parserOptions: {
				project: 'tsconfig.eslint.json',
				tsconfigRootDir: __dirname
			},
			sourceType: 'module',
			globals: {
				...globals.node,
				...globals.jest
			}
		},
		plugins: {
			'unused-imports': unusedImports
		},
		rules: {
			'@typescript-eslint/interface-name-prefix': 'off',
			'@typescript-eslint/explicit-function-return-type': 'off',
			'@typescript-eslint/explicit-module-boundary-types': 'off',
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-unused-vars': 'warn',
			'@typescript-eslint/no-require-import': 'off',
			'unused-imports/no-unused-imports': 'off',
			'no-useless-escape': 'off',
			'unused-imports/no-unused-vars': [
				'warn',
				{
					vars: 'all',
					varsIgnorePattern: '^_',
					args: 'after-used',
					argsIgnorePattern: '^_'
				}
			],

			'prettier/prettier': [
				'warn',
				{
					singleQuote: true,
					trailingComma: 'none',
					useTabs: true,
					tabWidth: 3,
					semi: false,
					printWidth: 120,
					endOfLine: 'auto',
					plugins: ['prettier-plugin-organize-imports']
				}
			]
		}
	}
)
