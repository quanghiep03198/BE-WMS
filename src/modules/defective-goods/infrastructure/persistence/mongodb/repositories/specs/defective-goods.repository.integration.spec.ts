import {
	CombinationStrategy,
	DefectiveCategory,
	DefectiveGoodsSource,
	DefectiveGoodsUnit,
	DefectiveLocation
} from '@modules/defective-goods/domain/constants'
import {
	DefectiveGoodsDomainModel,
	IDefectiveGoodsProps
} from '@modules/defective-goods/domain/models/defective-goods.model'
import { Connection, createConnection, Schema, Types } from 'mongoose'
import { randomUUID } from 'node:crypto'
import { DefectiveGoods, DefectiveGoodsModel, DefectiveGoodsSchema } from '../../schemas/defective-goods.schema'
import { DefectiveGoodsRepository } from '../defective-goods.repository'

const localMongo = process.env.DEFECTIVE_GOODS_MONGO_TEST === '1' ? describe : describe.skip

localMongo('pending stock EPC selection', () => {
	let connection: Connection
	let repository: DefectiveGoodsRepository
	const userId = new Types.ObjectId()
	const filters = {
		brand_name: 'UGG',
		mo_no: '15D12C019',
		factory_shoes_style: 'UGG F25 W121-L',
		color_sn: 'BLK'
	}

	beforeAll(async () => {
		connection = await createConnection('mongodb://127.0.0.1:27017', {
			dbName: `wms_pending_stock_test_${randomUUID().replaceAll('-', '')}`
		}).asPromise()
		connection.model('User', new Schema({}, { strict: false }))
		connection.model('Department', new Schema({}, { strict: false }))
		const model = connection.model<DefectiveGoods, DefectiveGoodsModel>(DefectiveGoods.name, DefectiveGoodsSchema)
		repository = new DefectiveGoodsRepository(model)
	})

	afterAll(async () => {
		if (connection) {
			await connection.dropDatabase()
			await connection.close()
		}
	})

	it.each(['inbound', 'outbound'] as const)('applies manual filters and take=5 for %s', async (flow) => {
		const batch = randomUUID().toUpperCase()
		const row = (overrides: Partial<IDefectiveGoodsProps> = {}): IDefectiveGoodsProps => ({
			_id: new Types.ObjectId(),
			epc: randomUUID(),
			combination_strategy: CombinationStrategy.MANUALLY,
			defective_category: DefectiveCategory.B_GRADE,
			...filters,
			po: batch,
			cust_shoes_style: 'CUSTOMER',
			size_numcode: '40',
			unit: DefectiveGoodsUnit.PRS,
			defective_location: DefectiveLocation.ALL,
			shoe_source: DefectiveGoodsSource.FINAL_INSPECTION,
			defective_description: 'defect',
			created_by: userId,
			deleted: false,
			inbound_at: flow === 'outbound' ? new Date() : null,
			storage_location: flow === 'outbound' ? 'A1' : null,
			...overrides
		})
		const valid = Array.from({ length: 7 }, () => row())
		await connection.collection<IDefectiveGoodsProps>('defective_goods').insertMany(
			[
				row({ brand_name: 'OTHER' }),
				row({ mo_no: 'OTHER' }),
				row({ factory_shoes_style: 'OTHER' }),
				row({ color_sn: 'OTHER' }),
				row({ combination_strategy: CombinationStrategy.UHF }),
				row({ combination_strategy: CombinationStrategy.USB }),
				row({ deleted: true }),
				row({
					inbound_at: flow === 'outbound' ? null : new Date(),
					storage_location: flow === 'outbound' ? null : 'A1'
				}),
				...valid
			],
			{ writeConcern: { w: 'majority' } }
		)
		const find =
			flow === 'inbound'
				? repository.findPendingStockIn.bind(repository)
				: repository.findPendingStockOut.bind(repository)
		const selected = await find({ ...filters, po: batch, combination_strategy: CombinationStrategy.MANUALLY }, [], 5)

		expect(selected).toHaveLength(5)
		for (const item of selected) {
			expect(item).toBeInstanceOf(DefectiveGoodsDomainModel)
			expect(valid.map((item) => item.epc)).toContain(item.epc)
		}
	})

	it.each([
		['inbound', CombinationStrategy.UHF],
		['inbound', CombinationStrategy.USB],
		['outbound', CombinationStrategy.UHF],
		['outbound', CombinationStrategy.USB]
	] as const)('selects only scanned %s EPCs with strategy %s', async (flow, strategy) => {
		const row = (combination_strategy: CombinationStrategy): IDefectiveGoodsProps => ({
			_id: new Types.ObjectId(),
			epc: randomUUID(),
			combination_strategy,
			defective_category: DefectiveCategory.B_GRADE,
			...filters,
			cust_shoes_style: 'CUSTOMER',
			size_numcode: '41',
			unit: DefectiveGoodsUnit.PRS,
			defective_location: DefectiveLocation.ALL,
			defective_description: 'defect',
			created_by: userId,
			deleted: false,
			inbound_at: flow === 'outbound' ? new Date() : null,
			storage_location: flow === 'outbound' ? 'A1' : null
		})
		const valid = [row(strategy), row(strategy)]
		const wrongStrategy = row(CombinationStrategy.MANUALLY)
		await connection
			.collection<IDefectiveGoodsProps>('defective_goods')
			.insertMany([...valid, wrongStrategy, row(strategy)], { writeConcern: { w: 'majority' } })
		const find =
			flow === 'inbound'
				? repository.findPendingStockIn.bind(repository)
				: repository.findPendingStockOut.bind(repository)
		const selected = await find(
			{ combination_strategy: strategy },
			[...valid.map((item) => item.epc), wrongStrategy.epc],
			1
		)

		expect(selected.map((item) => item.epc).sort()).toEqual(valid.map((item) => item.epc).sort())
	})
})
