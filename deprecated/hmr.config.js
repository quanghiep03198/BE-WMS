// @ts-nocheck
const CopyPlugin = require('copy-webpack-plugin')
const path = require('path')
const nodeExternals = require('webpack-node-externals')
const { RunScriptWebpackPlugin } = require('run-script-webpack-plugin')

/**
 * @typedef {import('webpack').Configuration} WebpackConfiguration
 * @typedef {typeof import('webpack')} WebpackModule
 */

/**
 * @param {WebpackConfiguration} options
 * @param {WebpackModule} webpack
 * @returns {WebpackConfiguration}
 */
module.exports = function (options, webpack) {
	const baseEntry = /** @type {string} */ (options.entry)

	return {
		...options,
		entry: ['webpack/hot/poll?100', baseEntry],
		module: {
			rules: [
				{
					test: /\.ts$/,
					exclude: /node_modules/,
					use: {
						loader: 'swc-loader',
						options: {
							swcrc: true,
							configFile: path.resolve(__dirname, 'infrastructure', '.swcrc')
						}
					}
				}
			]
		},
		externals: [
			nodeExternals({
				allowlist: ['webpack/hot/poll?100']
			})
		],
		plugins: [
			...(options.plugins ?? []),
			new webpack.HotModuleReplacementPlugin(),
			new webpack.WatchIgnorePlugin({ paths: [/\.js$/, /\.d\.ts$/] }),
			new RunScriptWebpackPlugin({
				name: /** @type {string} */ (options.output?.filename ?? 'main.js'),
				autoRestart: false
			}),
			new CopyPlugin({
				patterns: [
					{
						from: path.resolve(__dirname, 'src/i18n'),
						to: path.resolve(__dirname, 'dist/i18n')
					}
				]
			})
		]
	}
}
