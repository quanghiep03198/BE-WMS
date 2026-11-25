import { WarehouseSchema } from '../../schemas/warehouse.schema'
import { WarehouseRepository } from '../warehouse.repository'

describe('warehouse repository storage-location count', () => {
	it('counts only undeleted locations whose warehouse matches the warehouse id', () => {
		expect(WarehouseSchema.virtuals.total_storage_location?.options).toMatchObject({
			ref: 'StorageLocation',
			localField: '_id',
			foreignField: 'warehouse',
			match: { deleted: false },
			count: true
		})
	})

	it('populates the count when listing warehouses and forwards the query arguments', async () => {
		const result = [{ _id: 'warehouse-id', total_storage_location: 2 }]
		const query = { populate: jest.fn().mockResolvedValue(result) }
		const model = {
			find: jest.fn().mockReturnValue(query),
			findWithDeleted: jest.fn()
		}
		const repository = new WarehouseRepository(model as never, {} as never, {} as never)
		const filter = { name: 'WAREHOUSE' }
		const projection = { name: 1 }
		const options = { sort: { name: 1 } }

		await expect(repository.findAll(filter, projection, options)).resolves.toBe(result)

		expect(model.find).toHaveBeenCalledWith(filter, projection, options)
		expect(model.findWithDeleted).not.toHaveBeenCalled()
		expect(query.populate).toHaveBeenCalledWith('total_storage_location')
	})

	it('uses findWithDeleted and still populates the count when requested', async () => {
		const result = [{ _id: 'warehouse-id', total_storage_location: 2 }]
		const query = { populate: jest.fn().mockResolvedValue(result) }
		const model = {
			find: jest.fn(),
			findWithDeleted: jest.fn().mockReturnValue(query)
		}
		const repository = new WarehouseRepository(model as never, {} as never, {} as never)
		const filter = { name: 'WAREHOUSE' }
		const projection = { name: 1 }
		const options = { sort: { name: 1 } }

		await expect(repository.findAll(filter, projection, options, true)).resolves.toBe(result)

		expect(model.findWithDeleted).toHaveBeenCalledWith(filter, projection, options)
		expect(model.find).not.toHaveBeenCalled()
		expect(query.populate).toHaveBeenCalledWith('total_storage_location')
	})

	it('keeps the existing detail population unchanged', async () => {
		const lean = jest.fn().mockResolvedValue(null)
		const populate = jest.fn().mockReturnValue({ lean })
		const model = { findById: jest.fn().mockReturnValue({ populate }) }
		const repository = new WarehouseRepository(model as never, {} as never, {} as never)

		await repository.findOneById('warehouse-id')

		expect(populate).toHaveBeenCalledWith({ path: 'storage_locations', populate: 'created_by updated_by' })
		expect(populate).not.toHaveBeenCalledWith('total_storage_location')
		expect(lean).toHaveBeenCalledWith({ virtuals: true })
	})
})
