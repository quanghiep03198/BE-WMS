import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { DeleteResult, Repository } from 'typeorm'
import { StorageLocationEntity } from '../entities/storage-location.entity'
import { WarehouseEntity } from '../entities/warehouse.entity'
import { WarehouseService } from '../services/warehouse.service'

export const mockWarehouseRepository = () => ({
	createQueryBuilder: jest.fn().mockReturnValue({
		leftJoinAndSelect: jest.fn().mockReturnThis(),
		select: jest.fn().mockReturnThis(),
		where: jest.fn().mockReturnThis(),
		getMany: jest.fn().mockResolvedValue([])
	}),
	findOne: jest.fn(),
	delete: jest.fn()
})

export const mockStorageLocationRepository = () => ({
	findBy: jest.fn(),
	delete: jest.fn()
})

describe('WarehouseService', () => {
	let service: WarehouseService
	let warehouseRepository: Repository<WarehouseEntity>
	let storageLocationRepository: Repository<StorageLocationEntity>

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				WarehouseService,
				{
					provide: getRepositoryToken(WarehouseEntity, DATA_SOURCE_DATA_LAKE),
					useFactory: mockWarehouseRepository
				},
				{
					provide: getRepositoryToken(StorageLocationEntity, DATA_SOURCE_DATA_LAKE),
					useFactory: mockStorageLocationRepository
				}
			]
		}).compile()

		service = await module.resolve<WarehouseService>(WarehouseService)
		warehouseRepository = await module.resolve<Repository<WarehouseEntity>>(
			getRepositoryToken(WarehouseEntity, DATA_SOURCE_DATA_LAKE)
		)
		storageLocationRepository = await module.resolve<Repository<StorageLocationEntity>>(
			getRepositoryToken(StorageLocationEntity, DATA_SOURCE_DATA_LAKE)
		)
	})

	it('should be defined', () => {
		expect(service).toBeDefined()
	})

	it('warehouseRepository should be defined', () => {
		expect(warehouseRepository).toBeDefined()
	})
	it('storageLocationRepository should be defined', () => {
		expect(storageLocationRepository).toBeDefined()
	})

	describe('findAllByFactory', () => {
		it('should return an array of warehouses', async () => {
			const cofactoryCode = 'VA1'
			const result = [
				new WarehouseEntity({
					id: 1,
					warehouse_num: 'VA1PW01',
					warehouse_name: 'A1.A',
					type_warehouse: 'A',
					cofactory_code: 'VA1'
				}),
				new WarehouseEntity({
					id: 2,
					warehouse_num: 'VA1PW02',
					warehouse_name: 'A1.A',
					type_warehouse: 'B',
					cofactory_code: 'VA1'
				})
			]
			jest.spyOn(warehouseRepository.createQueryBuilder(), 'getMany').mockResolvedValue(result)

			expect(await service.findAllByFactory(cofactoryCode)).toEqual(result)
		})
	})

	describe('findOneByWarehouseCode', () => {
		it('should return a warehouse', async () => {
			const warehouseCode = 'WH123'
			const result = new WarehouseEntity({
				id: 1,
				warehouse_num: 'VA1PW01',
				warehouse_name: 'A1.A',
				type_warehouse: 'A'
			})
			jest.spyOn(warehouseRepository, 'findOne').mockResolvedValue(result)

			expect(await service.findOneByWarehouseCode(warehouseCode)).toEqual(result)
		})

		it('should return null if warehouse not found', async () => {
			const warehouseCode = 'WH123'
			jest.spyOn(warehouseRepository, 'findOne').mockResolvedValue(null)

			expect(await service.findOneByWarehouseCode(warehouseCode)).toBeNull()
		})
	})

	describe('deleteMany', () => {
		it('should delete multiple warehouses', async () => {
			const ids = [1, 2, 3]
			const result: DeleteResult = { affected: ids.length, raw: [] }
			jest.spyOn(warehouseRepository, 'delete').mockResolvedValue(result)

			expect(await service.deleteMany(ids)).toEqual(result)
		})
	})
})
