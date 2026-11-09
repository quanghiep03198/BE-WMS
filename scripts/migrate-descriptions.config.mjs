import path from 'node:path'
import { fileURLToPath } from 'node:url'
import nodeExternals from 'webpack-node-externals'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export default {
	mode: 'production',
	context: root,
	target: 'node',
	entry: { migration: './scripts/migrate-descriptions.ts' },
	output: {
		path: path.resolve(root, 'dist', 'migrations'),
		filename: '[name].cjs',
		chunkFilename: '[id].cjs',
		clean: true
	},
	resolve: {
		extensions: ['...', '.ts'],
		alias: {
			'@common': path.resolve(root, 'src', 'common'),
			'@databases': path.resolve(root, 'src', 'databases'),
			'@modules': path.resolve(root, 'src', 'modules')
		}
	},
	module: {
		rules: [
			{
				test: /\.ts$/,
				use: {
					loader: 'builtin:swc-loader',
					options: {
						jsc: {
							parser: { syntax: 'typescript', decorators: true },
							transform: { legacyDecorator: true, decoratorMetadata: true }
						},
						module: { type: 'commonjs' }
					}
				}
			}
		]
	},
	externalsType: 'commonjs',
	externals: [nodeExternals()]
}
