const swcDefaultConfig = require('@nestjs/cli/lib/compiler/defaults/swc-defaults').swcDefaultsFactory().swcOptions
const CopyPlugin = require('copy-webpack-plugin')
const path = require('path')
const nodeExternals = require('webpack-node-externals')
const { RunScriptWebpackPlugin } = require('run-script-webpack-plugin')

module.exports = function (options, webpack) {
	return {
		...options,
		entry: ['webpack/hot/poll?100', options.entry],
		module: {
			rules: [
				{
					test: /\.ts$/,
					exclude: /node_modules/,
					use: {
						loader: 'swc-loader',
						options: swcDefaultConfig
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
			...options.plugins,
			new webpack.HotModuleReplacementPlugin(),
			new webpack.WatchIgnorePlugin({ paths: [/\.js$/, /\.d\.ts$/] }),
			new RunScriptWebpackPlugin({ name: options.output.filename, autoRestart: false }),
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
