import { DATA_SOURCE_DATA_LAKE, DATA_SOURCE_ERP } from '@/databases/constants'
import { ConflictException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { readFileSync } from 'fs'
import { chunk, pick } from 'lodash'
import { join } from 'path'
import { DataSource, In, Repository } from 'typeorm'
import { CreateTransferOrderDTO, DeleteTransferOrderDTO, UpdateTransferOrderDTO } from '../dto/transfer-order.dto'
import { TransferOrderDetailEntity } from '../entities/transfer-order-detail.entity'
import { TransferOrderEntity } from '../entities/transfer-order.entity'
import { ITransferOrderDatalistParams } from '../interfaces/transfer-order.interface'

@Injectable()
export class TransferOrderService {
	constructor(
		@InjectRepository(TransferOrderEntity, DATA_SOURCE_DATA_LAKE)
		private readonly transferOrderRepository: Repository<TransferOrderEntity>,
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly dataSourceDL: DataSource,
		@InjectDataSource(DATA_SOURCE_ERP) private readonly dataSourceERP: DataSource
	) {}

	async getTransferOrderByFactory(factoryCode: string) {
		return await this.transferOrderRepository.findBy({ cofactory_code: factoryCode })
	}

	async getTransferOrderDatalist(params: ITransferOrderDatalistParams) {
		const query = readFileSync(join(__dirname, '../sql/pack-list.sql'), 'utf-8').toString()
		return await this.dataSourceDL.query(query, [
			params.time_range.from,
			params.time_range.to,
			params.customer_brand,
			params.factory_code
		])
	}

	async searchCustomerBrand(searchTerm: string) {
		const queryBuilder = this.dataSourceERP
			.createQueryBuilder()
			.select(['brand_name', 'custbrand_id'])
			.from('ta_brand', 'b')
		if (!searchTerm) return await queryBuilder.limit(5).getRawMany()
		return await queryBuilder
			.where(/* SQL */ `b.brand_name LIKE CONCAT('%', :searchTerm, '%')`, { searchTerm })
			.limit(5)
			.getRawMany()
	}

	async createTransferOrder(factoryCode: string, payload: CreateTransferOrderDTO) {
		// Check if payload has any order existed
		const hasAnyOrderExisted = await this.transferOrderRepository.existsBy({
			or_no: In(payload.map((item) => item.or_no))
		})

		if (hasAnyOrderExisted) throw new ConflictException('Order already existed')

		const queryRunner = await this.dataSourceDL.createQueryRunner()

		const transferOrderPayload = payload.map((item) => ({ ...item, cofactory_code: factoryCode }))

		const batchData = chunk(transferOrderPayload, 1000)

		await queryRunner.startTransaction()
		try {
			const createdTransferOrders = []
			for (const item of transferOrderPayload) {
				const newOrder = this.transferOrderRepository.create(item)
				const createdOrder = await this.transferOrderRepository.save(newOrder)
				createdTransferOrders.push(createdOrder)
				// await queryRunner.manager.createQueryBuilder().insert().into(TransferOrderEntity).values(transferOrderPayload).execute()
			}
			const newTransferOrderDetail = await queryRunner.manager
				.createQueryBuilder()
				.insert()
				.into(TransferOrderDetailEntity)
				.values(createdTransferOrders.map((item) => pick(item, ['transfer_order_code', 'or_no'])))

			await queryRunner.commitTransaction()
		} catch (error) {
			queryRunner.rollbackTransaction()
			throw new InternalServerErrorException(error.message)
		} finally {
			await queryRunner.release()
		}
		const transferOrder = this.transferOrderRepository.create(payload)
		return await this.transferOrderRepository.save(transferOrder)
	}

	async updateTransferOrder(id: number, payload: UpdateTransferOrderDTO) {
		const transferOrder = await this.transferOrderRepository.findOneBy({ id })
		if (!transferOrder) throw new NotFoundException('Transfer order could not be found')
		return await this.transferOrderRepository.update({ id }, payload)
	}

	async deleteTransferOrder(payload: DeleteTransferOrderDTO) {
		return await this.transferOrderRepository.delete({ id: In(payload) })
	}
}
