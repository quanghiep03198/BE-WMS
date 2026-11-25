import { format } from 'date-fns'
import 'dotenv/config'
import mongoose from 'mongoose'
import path from 'node:path'
import { getArgs } from '../../migrations/utils/get-args'
import { Logger } from '../../migrations/utils/logger'

type TDevice = 'GL1_101' | 'GL1_103' | 'GL3_101' | 'GL3_103' | 'GL4_101' | 'GL4_103'

type TPayload = {
	method: string
	sn: string
	timestamp: string
	data: {
		timestamp: string
		id: string
		temperature: string
		tagList: Array<{
			direction: string
			firstTime: number
			lastTime: number
			ant: number
			firstAnt: number
			rssi: string
			epc: string
		}>
	}
}

const deviceMap: ReadonlyMap<TDevice, string> = new Map([
	['GL1_101', 'd56f07f5'],
	['GL1_103', 'X600000000009626'],
	['GL3_101', 'c6a307dc'],
	['GL3_103', '4233521261'],
	['GL4_101', 'ca6bd3d3'],
	['GL4_103', 'X600000000009479']
])

class HttpRequest {
	static baseURL = 'http://10.30.146.60:3001'

	static async post(url: string, data: TPayload, configs?: RequestInit) {
		const requestURL = new URL(path.join('/api', url), this.baseURL).toString()
		return await fetch(requestURL, {
			method: 'POST',
			body: JSON.stringify(data),
			headers: {
				'Content-Type': 'application/json',
				...configs?.headers
			}
		})
	}
}

class Faker {
	private data: TPayload

	constructor(deviceKey: TDevice, epcs: string[]) {
		const device = deviceMap.get(deviceKey)!
		this.data = {
			method: 'device_report_probe_data',
			sn: device,
			timestamp: new Date().toISOString(),
			data: {
				timestamp: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
				id: device,
				temperature: '0',
				tagList: epcs.map((item) => ({
					direction: '0',
					firstTime: new Date().getTime(),
					lastTime: new Date().getTime(),
					ant: 1,
					firstAnt: 1,
					rssi: '0',
					epc: item.trim()
				}))
			}
		}
	}

	public get payload() {
		return this.data
	}
}

// type StockFlow = 'inbound' | 'outbound'
const args = getArgs({
	flow: { type: 'string', short: 'f' },
	device: { type: 'string', short: 'd' },
	mo: { type: 'string', short: 'm' }
})

async function main() {
	const logger = new Logger()

	if (!args.flow || !args.device) {
		logger.error('❌ Missing required arguments: --flow <inbound|outbound> --device <device_key> --mo <mo_numbers>')
		process.exit(1)
	}

	const { disconnect, model, Schema } = await mongoose
		.connect('mongodb://127.0.0.1:27017,127.0.0.1:27018,127.0.0.1:27019', {
			dbName: 'GL4_data_warehouse',
			replicaSet: 'rs0'
		})
		.catch((error) => {
			logger.error(error)
			process.exit(1)
		})

	const FinishedGoodsMatchEpc = model(
		'finished_goods_epcs_match',
		new Schema(
			{
				epc: { type: String }
			},
			{ collection: 'finished_goods_epcs_match', strict: false }
		)
	)

	const FinishedGoodsEpc = model(
		'finished_goods_epcs',
		new Schema(
			{
				epc: { type: String },
				mo_no: { type: String },
				status: { type: String, enum: ['scanning', 'instock', 'shipped', 'recalled'] }
			},
			{ collection: 'finished_goods_epcs', strict: false }
		)
	)

	try {
		let epcs: string[] = []

		const todayMidnoon = new Date()
		todayMidnoon.setHours(12, 0, 0, 0)

		if (args.flow === 'inbound') {
			epcs = await FinishedGoodsMatchEpc.distinct('epc', {
				mo_no: { $in: args.mo?.split(',') }
			})
			console.log(epcs)
		}
		if (args.flow === 'outbound')
			epcs = await FinishedGoodsEpc.distinct('epc', {
				mo_no: { $in: args.mo?.split(',') },
				status: 'instock'
			})

		const { payload } = new Faker(args.device as TDevice, epcs)

		await HttpRequest.post(`/rfid/${args.flow}/post-data`, payload)

		logger.info('Posted data successfully')
	} catch (error) {
		if (error instanceof Error) logger.error(error)
	} finally {
		await disconnect()
		process.exit(0)
	}
}

main()
