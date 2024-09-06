module.exports = {
	apps: [
		{
			name: 'wms-api',
			script: './dist/main.js',
			watch: '.',
			instances: 'max',
			exec_mode: 'cluster'
		}
	],

	deploy: {
		production: {
			user: 'administrator',
			host: '10.30.0.19',
			ref: 'origin/develop',
			repo: 'https://github.com/quanghiep03198/BE-WMS.git',
			path: 'C:/Users/Administrator/i-wms/server',
			'pre-deploy-local': 'npm run build',
			'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
			'pre-setup': 'npm run build'
		}
	}
}
