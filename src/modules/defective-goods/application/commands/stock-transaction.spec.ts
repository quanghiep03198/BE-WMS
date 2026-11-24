import { Types } from 'mongoose'
import {
	CombinationStrategy,
	DefectiveCategory,
	DefectiveGoodsOutboundPurpose,
	DefectiveGoodsSource,
	DefectiveGoodsUnit,
	DefectiveLocation
} from '../../domain/constants'
import { DefectiveGoodsDomainModel } from '../../domain/models/defective-goods.model'
import { DefectiveGoodsStockReportHandler } from '../events/defective-goods-stock-report.handler'
import { StockInDefectiveGoodsCommand } from './stock-in/stock-in.command'
import { StockInDefectiveGoodsHandler } from './stock-in/stock-in.handler'
import { StockOutDefectiveGoodsCommand } from './stock-out/stock-out.command'
import { StockOutDefectiveGoodsHandler } from './stock-out/stock-out.handler'

describe('stock commands with a storage-independent unit of work', () => {
	const userId = new Types.ObjectId()

	function model(inStock: boolean) {
		return new DefectiveGoodsDomainModel({
			_id: new Types.ObjectId(),
			epc: 'epc-1',
			combination_strategy: CombinationStrategy.MANUALLY,
			defective_category: DefectiveCategory.B_GRADE,
			brand_name: 'brand',
			cust_shoes_style: 'customer',
			factory_shoes_style: 'factory',
			color_sn: 'black',
			size_numcode: '40',
			unit: DefectiveGoodsUnit.PRS,
			defective_location: DefectiveLocation.ALL,
			shoe_source: DefectiveGoodsSource.FINAL_INSPECTION,
			defective_description: 'defect',
			created_by: userId,
			...(inStock ? { inbound_at: new Date(), storage_location: 'A1' } : {})
		})
	}

	it.each(['inbound', 'outbound'] as const)('commits %s only after the unit of work succeeds', async (flow) => {
		const item = model(flow === 'outbound')
		const steps: string[] = []
		const publisher = { mergeObjectContext: (value: DefectiveGoodsDomainModel) => value }
		jest.spyOn(item, 'commit').mockImplementation(() => steps.push('published'))
		const transaction = {
			stockIn: async () => {
				steps.push('stock-in')
			},
			stockOut: async () => {
				steps.push('stock-out')
			},
			mergeStockEvents: async (events: object[]) => {
				expect(events).toHaveLength(1)
				steps.push('report')
			}
		}
		const unitOfWork = {
			execute: async (work: (tx: typeof transaction) => Promise<void>) => {
				await work(transaction)
				steps.push('committed')
			}
		}
		const reports: DefectiveGoodsStockReportHandler = Reflect.construct(DefectiveGoodsStockReportHandler, [])
		const repository = {
			findPendingStockIn: jest.fn(async () => [item]),
			findPendingStockOut: jest.fn(async () => [item])
		}
		const filters = { brand_name: 'brand', combination_strategy: CombinationStrategy.UHF }
		if (flow === 'inbound') {
			const handler: StockInDefectiveGoodsHandler = Reflect.construct(StockInDefectiveGoodsHandler, [
				repository,
				publisher,
				unitOfWork,
				reports
			])
			await handler.execute(
				new StockInDefectiveGoodsCommand(
					{ combination_strategy: CombinationStrategy.MANUALLY, epcs: [item.epc], storage_location: 'A1' },
					userId,
					filters,
					0
				)
			)
		} else {
			const handler: StockOutDefectiveGoodsHandler = Reflect.construct(StockOutDefectiveGoodsHandler, [
				repository,
				publisher,
				unitOfWork,
				reports
			])
			await handler.execute(
				new StockOutDefectiveGoodsCommand(
					{
						combination_strategy: CombinationStrategy.MANUALLY,
						epcs: [item.epc],
						outbound_purpose: DefectiveGoodsOutboundPurpose.LAB
					},
					userId,
					filters,
					0
				)
			)
		}
		const findPending = flow === 'inbound' ? repository.findPendingStockIn : repository.findPendingStockOut
		expect(findPending).toHaveBeenCalledWith(
			{ ...filters, combination_strategy: CombinationStrategy.MANUALLY },
			[item.epc],
			0
		)
		expect(steps).toEqual([flow === 'inbound' ? 'stock-in' : 'stock-out', 'report', 'committed', 'published'])
	})
})
