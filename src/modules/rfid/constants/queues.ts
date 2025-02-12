import { env } from '@/common/utils'
import { POST_DATA_QUEUE_GL1, POST_DATA_QUEUE_GL3, POST_DATA_QUEUE_GL4 } from '.'
import { GL1RFIDConsumer, GL3RFIDConsumer, GL4RFIDConsumer } from '../rfid.consumer'

const queues = [
	{ name: POST_DATA_QUEUE_GL1, consumer: GL1RFIDConsumer, tenant: env<string>('TENANT_MAIN_19') },
	{ name: POST_DATA_QUEUE_GL3, consumer: GL3RFIDConsumer, tenant: env<string>('TENANT_MAIN_19') },
	{ name: POST_DATA_QUEUE_GL4, consumer: GL4RFIDConsumer, tenant: env<string>('TENANT_KM_PRIMARY') }
]

export default queues
