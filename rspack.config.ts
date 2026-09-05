import { defineConfig } from '@rspack/cli'
import { type Configuration, type Plugins, rspack } from '@rspack/core'
import path from 'path'
import { RunScriptWebpackPlugin } from 'run-script-webpack-plugin'
import nodeExternals from 'webpack-node-externals'

export default defineConfig((env: Record<string, any>): Configuration => {
	const isDev = env.NODE_ENV !== 'production'

	const plugins: Plugins = [
		new rspack.CopyRspackPlugin({
			patterns: [
				{
					from: path.resolve(import.meta.dirname, 'src/i18n'),
					to: path.resolve(import.meta.dirname, 'dist/i18n')
				}
			]
		}),
		...(isDev
			? [
					new RunScriptWebpackPlugin({
						name: 'main.cjs',
						autoRestart: false
					}),
					new rspack.HotModuleReplacementPlugin()
				]
			: [])
	]

	return {
		context: import.meta.dirname,
		target: 'node',
		entry: {
			main: isDev ? ['@rspack/core/hot/poll?100', './src/main.ts'] : './src/main.ts'
		},
		output: {
			clean: true,
			filename: '[name].cjs'
		},
		resolve: {
			extensions: ['...', '.ts', '.tsx', '.jsx'],
			alias: {
				'@common': path.resolve(import.meta.dirname, 'src/common'),
				'@config': path.resolve(import.meta.dirname, 'src/config'),
				'@databases': path.resolve(import.meta.dirname, 'src/databases'),
				'@generated': path.resolve(import.meta.dirname, 'src/generated'),
				'@modules': path.resolve(import.meta.dirname, 'src/modules'),
				'@redis': path.resolve(import.meta.dirname, 'src/redis'),
				'@tasks': path.resolve(import.meta.dirname, 'src/tasks')
			}
		},
		module: {
			rules: [
				{
					test: /\.ts$/,
					use: {
						loader: 'builtin:swc-loader',
						options: {
							detectSyntax: 'auto',
							jsc: {
								parser: {
									syntax: 'typescript',
									decorators: true,
									dynamicImport: true
								},
								transform: {
									legacyDecorator: true,
									decoratorMetadata: true
								}
							},
							module: { type: 'commonjs' }
						}
					}
				}
			]
		},
		optimization: {
			minimizer: [
				new rspack.SwcJsMinimizerRspackPlugin({
					minimizerOptions: {
						compress: {
							keep_classnames: true,
							keep_fnames: true
						},
						mangle: {
							keep_classnames: true,
							keep_fnames: true
						}
					}
				})
			]
		},
		externalsType: 'commonjs',
		plugins,
		externals: [
			// @ts-ignore
			nodeExternals({
				allowlist: [/@rspack\/core\/hot\/poll/]
			})
		]
	}
})
