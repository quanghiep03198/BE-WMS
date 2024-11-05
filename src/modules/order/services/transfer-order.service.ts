import { DATA_SOURCE_DATA_LAKE, DATA_SOURCE_ERP } from '@/databases/constants'
import { StorageLocationEntity } from '@/modules/warehouse/entities/storage-location.entity'
import { WarehouseEntity } from '@/modules/warehouse/entities/warehouse.entity'
import { ConflictException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { format } from 'date-fns'
import { readFileSync } from 'fs'
import { join } from 'path'
import { DataSource, In, Repository } from 'typeorm'
import {
	CreateTransferOrderDTO,
	DeleteTransferOrderDTO,
	getTransferOrderDetailValidatorDTO,
	UpdateTransferOrderDTO
} from '../dto/transfer-order.dto'
import { TransferOrderDetailEntity } from '../entities/transfer-order-detail.entity'
import { TransferOrderEntity } from '../entities/transfer-order.entity'
import { ITransferOrderDatalistParams } from '../interfaces/transfer-order.interface'

@Injectable()
export class TransferOrderService {
	constructor(
		@InjectRepository(TransferOrderEntity, DATA_SOURCE_DATA_LAKE)
		private readonly transferOrderRepository: Repository<TransferOrderEntity>,
		@InjectRepository(TransferOrderDetailEntity, DATA_SOURCE_DATA_LAKE)
		private readonly transferOrderDetailRepository: Repository<TransferOrderDetailEntity>,
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly dataSourceDL: DataSource,
		@InjectDataSource(DATA_SOURCE_ERP) private readonly dataSourceERP: DataSource
	) {}

	async getTransferOrderByFactory(factoryCode: string) {
		const queryBuilder = this.dataSourceDL
			.getRepository(TransferOrderEntity)
			.createQueryBuilder('t')
			.leftJoin(StorageLocationEntity, 's1', 't.or_location = s1.storage_num')
			.leftJoin(StorageLocationEntity, 's2', 't.new_location = s2.storage_num')
			.leftJoin(WarehouseEntity, 'w1', 't.or_warehouse = w1.warehouse_num')
			.leftJoin(WarehouseEntity, 'w2', 't.new_warehouse = w2.warehouse_num')
			.where('t.cofactory_code = :factoryCode', { factoryCode })

		const result = await queryBuilder
			.select([
				't.*',
				's1.storage_name AS or_storage_name',
				's2.storage_name AS new_storage_name',
				'w1.warehouse_name AS or_warehouse_name',
				'w2.warehouse_name AS new_warehouse_name'
			])
			.getRawMany()

		return result
	}

	async getTransferOrderDatalist(params: ITransferOrderDatalistParams) {
		Logger.debug(params)
		const query = readFileSync(join(__dirname, '../sql/pack-list.sql'), 'utf-8').toString()
		const startDate = format(params.time_range.from, 'yyyy-MM-dd')
		const endDate = format(params.time_range.to, 'yyyy-MM-dd')
		return await this.dataSourceERP.query(query, [startDate, endDate, params.customer_brand, params.factory_code])
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
		const orderNos = payload.map((item) => item.or_no)
		const hasAnyOrderExisted = await this.transferOrderRepository.existsBy({
			or_no: In(orderNos)
		})

		if (hasAnyOrderExisted) throw new ConflictException('Order already existed')

		const queryRunner = this.dataSourceDL.createQueryRunner()
		const transferOrderPayload = payload.map((item) => ({
			...item,
			cofactory_code: factoryCode
		}))

		await queryRunner.startTransaction()

		try {
			const createdTransferOrders = []
			for (const item of transferOrderPayload) {
				const newOrder = this.transferOrderRepository.create(item)
				const createdOrder = await queryRunner.manager.save(newOrder)
				createdTransferOrders.push(createdOrder)
			}

			await queryRunner.manager
				.createQueryBuilder()
				.insert()
				.into(TransferOrderDetailEntity)
				.values(
					createdTransferOrders.map((item) => ({
						transfer_order_code: item.transfer_order_code,
						or_no: item.or_no
					}))
				)
				.execute()

			await queryRunner.commitTransaction()
			return createdTransferOrders
		} catch (error) {
			await queryRunner.rollbackTransaction()
			throw new InternalServerErrorException(error.message)
		} finally {
			await queryRunner.release()
		}
	}

	async updateTransferOrder(transfer_order_code: string, payload: UpdateTransferOrderDTO) {
		const transferOrder = await this.transferOrderDetailRepository.findOneBy({ transfer_order_code })

		console.log(transferOrder, 'transferOrdertransferOrder')

		if (!transferOrder) throw new NotFoundException('Transfer order could not be found')
		return await this.transferOrderDetailRepository.update({ transfer_order_code }, payload as any)
	}

	async updateTransferOrderApprove(transfer_order_code: string, payload: UpdateTransferOrderDTO) {
		const transferOrder = await this.transferOrderRepository.findOneBy({ transfer_order_code })

		console.log(transferOrder, 'transferOrdertransferOrder')

		if (!transferOrder) throw new NotFoundException('Transfer order could not be found')
		return await this.transferOrderRepository.update({ transfer_order_code }, payload)
	}

	async deleteTransferOrder(payload: DeleteTransferOrderDTO | any) {
		const deleteDetailsResult = await this.transferOrderDetailRepository.delete({
			transfer_order_code: In(payload.transfer_order_code)
		})

		if (deleteDetailsResult.affected === 0) {
			throw new NotFoundException(`No transfer order details found for codes: ${payload.transfer_order_code}`)
		}

		const deleteMasterResult = await this.transferOrderRepository.delete({
			transfer_order_code: In(payload.transfer_order_code)
		})

		if (deleteMasterResult.affected === 0) {
			throw new NotFoundException(`No transfer orders found for codes: ${payload.transfer_order_code}`)
		}

		return {
			message: 'Transfer orders and their details deleted successfully.',
			deletedOrders: deleteMasterResult.affected,
			deletedDetails: deleteDetailsResult.affected
		}
	}

	async getDetail(id: getTransferOrderDetailValidatorDTO) {
		return await this.transferOrderDetailRepository.findOne({ where: { transfer_order_code: id } })
	}

	async updateMulti(payload: any) {
		const index = 'transfer_order_code'
		console.log(payload)

		const updatePromises = payload.map(async (item) => {
			console.log(item, 'itemitem')
			if (!item[index]) {
				throw new Error(`Missing ${index} in item: ${JSON.stringify(item)}`)
			}

			return await this.transferOrderRepository.update({ [index]: item[index] }, item)
		})

		return await Promise.all(updatePromises)
	}
}
