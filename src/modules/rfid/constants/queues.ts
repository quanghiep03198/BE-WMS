import { BaseRFIDConsumer, GL1RFIDConsumer, GL3RFIDConsumer, GL4RFIDConsumer } from '../rfid.consumer'

export const POST_DATA_QUEUE_GL1 = 'POST_DATA_QUEUE_GL1'
export const POST_DATA_QUEUE_GL3 = 'POST_DATA_QUEUE_GL3'
export const POST_DATA_QUEUE_GL4 = 'POST_DATA_QUEUE_GL4'

export const queues: Array<{ name: string; consumer: typeof BaseRFIDConsumer }> = [
	{ name: POST_DATA_QUEUE_GL1, consumer: GL1RFIDConsumer },
	{ name: POST_DATA_QUEUE_GL3, consumer: GL3RFIDConsumer },
	{ name: POST_DATA_QUEUE_GL4, consumer: GL4RFIDConsumer }
]
