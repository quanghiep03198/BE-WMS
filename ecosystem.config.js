module.exports = {
	apps: [
		{
			name: 'wms-api',
			script: './dist/main.js',
			cwd: __dirname,
			autorestart: true,
			watch: false,
			exec_mode: 'cluster',
			max_memory_restart: '500M'
		}
	]
}
