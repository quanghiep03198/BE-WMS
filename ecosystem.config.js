module.exports = {
	apps: [
		{
			name: 'wms-api',
			script: './dist/main.js',
			cwd: __dirname,
			autorestart: false,
			watch: false,
			exec_mode: 'cluster'
		}
	]
}
