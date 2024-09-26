module.exports = {
	apps: [
		{
			name: 'wms-api',
			script: './dist/main.js',
			cwd: __dirname,
			autorestart: true,
			exec_mode: 'cluster'
		}
	]
}
