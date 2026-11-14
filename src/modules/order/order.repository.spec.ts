import mongoose from 'mongoose'
import { OrderRepository } from './order.repository'
import {
	ManufacturingOrderDocument,
	ManufacturingOrderModel,
	ManufacturingOrderSchema
} from './schemas/manufacturing-order.schema'

const manufacturingOrderModel = mongoose.model<ManufacturingOrderDocument>(
	'ManufacturingOrderInventoryRepositoryTest',
	ManufacturingOrderSchema
)

describe('OrderRepository.getManufacturingOrderInventory', () => {
	const createRepository = (sizeLedger: Record<string, object | null>) => {
		const document = manufacturingOrderModel.hydrate({ mo_no: 'MO-123', size_ledger: sizeLedger })
		const model = {
			findOne: jest.fn().mockReturnValue({
				read: jest.fn().mockResolvedValue(document)
			})
		} as unknown as ManufacturingOrderModel

		return new OrderRepository(null as never, model, null as never)
	}

	it('returns each size and its in-stock quantity from a hydrated Mongoose map', async () => {
		const repository = createRepository({
			'6': {
				order_qty: 10,
				stocked_in_qty: 8,
				total_recall_tx: 1,
				total_return_tx: 2,
				shipped_out_qty: 3
			}
		})

		await expect(repository.getManufacturingOrderInventory('MO-123')).resolves.toEqual([
			{ mo_no: 'MO-123', size_numcode: '6', order_qty: 10, instock_qty: 6 }
		])
	})

	it('reports a null size ledger entry with its manufacturing order and size', async () => {
		const repository = createRepository({ '6': null })

		await expect(repository.getManufacturingOrderInventory('MO-123')).rejects.toThrow(
			'Manufacturing order MO-123 has a null size ledger entry for size 6'
		)
	})
})
