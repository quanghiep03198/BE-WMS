require('dotenv').config()

/** @type {EcosystemConfig} */
module.exports = {
	apps: [
		{
			name: 'wms-api',
			script: './dist/main.js',
			cwd: __dirname,
			watch: false,
			exec_mode: 'cluster',
			instances: 2,
			max_memory_restart: '1G',
			increment_var: 'PORT',
			env: {
				NODE_ENV: process.env.NODE_ENV,
				PORT: process.env.PORT
			}
		}
	]
}

/**
 * @typedef AppConfig
 * @property {string} name
 * @property {string} script
 * @property {string} args
 * @property {number} instances
 * @property {string} interpreter
 * @property {string} node_args
 * @property {string} cwd
 * @property {boolean} autorestart
 * @property {boolean | string | string[]} watch
 * @property {boolean | string | string[]} ignore_watch
 * @property {string} exec_mode
 * @property {string} max_memory_restart
 * @property {string} cron_restart
 * @property {string} error_file
 * @property {'cluster' | 'fork'} exec_mode
 * @property {[key: string]: string} env
 * @property {boolean} appendEnvToName
 * @property {boolean} source_map_support
 *
 */

/**
 * @typedef {Object} DeployConfig
 * @property {string} user
 */

/**
 * @typedef {Object} EcosystemConfig
 * @property {AppConfig[]} apps
 * @property {Object.<string, DeployConfig>} deploy
 */
