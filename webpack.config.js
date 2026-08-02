const swcDefaultConfig = require('@nestjs/cli/lib/compiler/defaults/swc-defaults').swcDefaultsFactory().swcOptions
const CopyPlugin = require('copy-webpack-plugin')
const path = require('path')
const nodeExternals = require('webpack-node-externals')

module.exports = function (options, webpack) {
	return {
		...options,
		entry: [options.entry],
		module: {
			rules: [
				{
					test: /\.ts$/,
					exclude: /node_modules/,
					use: {
						loader: 'swc-loader',
						options: {
							...swcDefaultConfig,
							swcrc: true,
							configFile: path.resolve(__dirname, 'infrastructure', '.swcrc')
						}
					}
				}
			]
		},
		externals: [nodeExternals()],
		plugins: [
			...options.plugins,
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
