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
	['GL4_103', 'ca6bd3d3'],
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
	device: { type: 'string', short: 'd' }
	// mo: { type: 'string', short: 'm' }
})

async function main() {
	const logger = new Logger()

	if (!args.flow || !args.device) {
		logger.error('❌ Missing required arguments: --flow <inbound|outbound> --device <device_key> --mo <mo_numbers>')
		process.exit(1)
	}

	const { disconnect, model, Schema } = await mongoose
		.connect('mongodb://10.30.201.201:27017,10.30.201.201:27018,10.30.201.201:27019', {
			dbName: 'data_warehouse',
			replicaSet: 'rs0'
		})
		.catch((error) => {
			logger.error(error)
			process.exit(1)
		})

	const FinishedGoodsEpc = model(
		'epcs_inbound',
		new Schema(
			{
				epc: { type: String },
				recorded_at: { type: Date },
				stored_at: { type: Date }
				// status: { type: String },
				// mo_no: { type: String },
				// po: { type: String },
				// factory_shoes_style: { type: String },
				// cust_shoes_style: { type: String },
				// color_sn: { type: String },
				// size_numcode: { type: String },
				// factory_code_produce: { type: String },
				// inbound_times: { type: Number },
				// inbound_device_sn: { type: String },
				// outbound_device_sn: { type: String },
				// inbound_at: { type: Date },
				// outbound_at: { type: Date },
				// last_scanned_at: { type: Date },
				// created_at: { type: Date },
				// updated_at: { type: Date },
				// storage_location: { type: mongoose.Types.ObjectId },
				// assembly_line: { type: mongoose.Types.ObjectId }
			},
			{ collection: 'epcs_inbound', strict: false }
		)
	)

	try {
		let epcs: string[] = []

		const todayMidnoon = new Date()
		todayMidnoon.setHours(12, 0, 0, 0)

		if (args.flow === 'inbound') {
			epcs = await FinishedGoodsEpc.distinct('epc', {
				scannable: true,
				record_time: { $gte: todayMidnoon },
				stored_at: { $ne: null }
			})
			console.log(epcs)
		}
		if (args.flow === 'outbound')
			epcs = await FinishedGoodsEpc.distinct('epc', {
				// mo_no: { $in: args.mo?.split(',') },
				// status: 'instock'
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
