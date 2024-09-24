module.exports = {
	apps: [
		{
			name: 'wms-api',
			script: './dist/main.js',
			watch: '.',
			instances: 'max',
			exec_mode: 'cluster'
		}
	]
}
