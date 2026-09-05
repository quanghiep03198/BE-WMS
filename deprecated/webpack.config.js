// @ts-nocheck
const CopyPlugin = require('copy-webpack-plugin')
const path = require('path')
const nodeExternals = require('webpack-node-externals')

/**
 * @typedef {import('webpack').Configuration} WebpackConfiguration
 * @typedef {typeof import('webpack')} WebpackModule
 */

/**
 * @param {WebpackConfiguration} options
 * @returns {WebpackConfiguration}
 */
module.exports = function (options) {
	const baseEntry = /** @type {string} */ (options.entry)

	return {
		...options,
		entry: [baseEntry],
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
		externals: [nodeExternals()],
		plugins: [
			...(options.plugins ?? []),
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
