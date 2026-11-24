import { Types } from 'mongoose'
import {
	CombinationStrategy,
	DefectiveCategory,
	DefectiveGoodsOutboundPurpose,
	DefectiveGoodsSource,
	DefectiveGoodsUnit,
	DefectiveLocation
} from '../constants'
import { NoDefectiveGoodsToStockInException } from '../exceptions'
import { DefectiveGoodsDomainModel, IDefectiveGoodsProps } from './defective-goods.model'

describe('defective goods stock events', () => {
	const userId = new Types.ObjectId()

	function createModel(overrides: Partial<IDefectiveGoodsProps> = {}) {
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
			...overrides
		})
	}

	it('emits a stock-in event after stock in', () => {
		const model = createModel()
		model.stockIn('A1', userId)

		expect(model.getUncommittedEvents().map((event) => event.constructor.name)).toContain(
			'DefectiveGoodsStockedInEvent'
		)
	})

	it.each([
		{ inbound_at: new Date(), storage_location: 'A1' },
		{ inbound_at: new Date() },
		{ storage_location: 'A1' }
	])('rejects stocking in an item with existing stock state', (state) => {
		const model = createModel(state)

		expect(() => model.stockIn('A1', userId)).toThrow(NoDefectiveGoodsToStockInException)
		expect(model.getUncommittedEvents()).toHaveLength(0)
	})

	it('emits a stock-out event after stock out', () => {
		const model = createModel({ inbound_at: new Date(), storage_location: 'A1' })
		model.stockOut(DefectiveGoodsOutboundPurpose.LAB, null, userId)

		expect(model.getUncommittedEvents().map((event) => event.constructor.name)).toContain(
			'DefectiveGoodsStockedOutEvent'
		)
	})

	it('does not report a B_TO_C downgrade as stock out', () => {
		const model = createModel({ inbound_at: new Date(), storage_location: 'A1' })
		model.stockOut(DefectiveGoodsOutboundPurpose.DOWNGRADE, null, userId)

		expect(model.getUncommittedEvents().map((event) => event.constructor.name)).not.toContain(
			'DefectiveGoodsStockedOutEvent'
		)
	})
})
