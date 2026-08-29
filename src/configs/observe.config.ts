import { env } from '@common/utils'
import { registerAs } from '@nestjs/config'
import { ObserveOptions } from '@nestjs/observe'

export default registerAs('observe', (): ObserveOptions => ({
	appKey: env<string>('OBSERVE_APP_KEY'),
	appSecret: env<string>('OBSERVE_APP_SECRET'),
	serviceId: 'wms-16522',
	jobs: {
		setAttributes: (job) => ({ queueName: job.queueName, jobName: job.name })
	},
	http: {
		tags: { project: 'WMS', env: process.env.NODE_ENV ?? 'development' },
		setAttributes: (req) => ({
			'user-agent': req.headers['user-agent'],
			'client-ip': req.ip
		})
	}
}))
