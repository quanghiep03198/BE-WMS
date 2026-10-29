import js from '@eslint/js'
import prettierRecommended from 'eslint-plugin-prettier/recommended'
import unusedImports from 'eslint-plugin-unused-imports'
import { defineConfig } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig(
	{
		ignores: [
			'dist',
			'ecosystem.config.cjs',
			'src/generated/i18n.generated.ts',
			'deprecated',
			'.tmp',
			'src/**/.tmp/*',
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
				tsconfigRootDir: import.meta.dirname
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
			'@typescript-eslint/explicit-function-return-type': 'off',
			'@typescript-eslint/explicit-module-boundary-types': 'off',
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-unused-vars': 'warn',
			'@typescript-eslint/no-require-imports': 'off',
			'@typescript-eslint/no-non-null-assertion': 'warn', // cản việc lạm dụng `!`
			'@typescript-eslint/no-unnecessary-condition': 'warn', // báo check null thừa
			'@typescript-eslint/prefer-optional-chain': 'warn', // auto-fix: a && a.b -> a?.b
			'@typescript-eslint/prefer-nullish-coalescing': 'warn', // auto-fix: || -> ??
			'@typescript-eslint/no-unnecessary-type-assertion': 'warn', // auto-fix: bỏ `as`/`!` thừa
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
