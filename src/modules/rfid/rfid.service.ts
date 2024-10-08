import { FileLogger } from '@/common/helpers/file-logger.helper'
import { Injectable, InternalServerErrorException, Logger, Scope } from '@nestjs/common'
import { format } from 'date-fns'
import { readFileSync } from 'fs'
import { omit, pick } from 'lodash'
import { join } from 'path'
import { Brackets, DataSource, FindOptionsWhere, In, IsNull, Like, MoreThanOrEqual, Not } from 'typeorm'
import { TenancyService } from '../tenancy/tenancy.service'
import { ExchangeEpcDTO, UpdateStockDTO } from './dto/rfid.dto'
import { RFIDCustomerEntity } from './entities/rfid-customer.entity'
import { RFIDInventoryEntity } from './entities/rfid-inventory.entity'

@Injectable({ scope: Scope.REQUEST })
export class RFIDService {
	private readonly dataSource: DataSource

	private readonly IGNORE_ORDERS: Array<string> = ['13D05B006']
	private readonly IGNORE_EPC_PATTERN = '303429%'
	private readonly LIMIT_FETCH_DOCS = 50
	private readonly FALLBACK_VALUE = 'Unknown'

	/**
	 * TODO: Add this ignore EPC pattern to Agency service of SQL Server
	 * private readonly BOX_LINER_EPC = '3312D%'
	 */

	constructor(protected tenacyService: TenancyService) {
		this.dataSource = tenacyService.dataSource
	}

	async fetchItems({ page, filter }: { page: number; filter?: string }) {
		try {
			const [epcs, orders, sizes] = await Promise.all([
				this.findWhereNotInStock({ page, filter }),
				this.getOrderQuantity(),
				this.getOrderSizes()
			])
			return { epcs, orders, sizes }
		} catch (error) {
			await this.dataSource.destroy()
			throw new InternalServerErrorException(error)
		}
	}

	async findWhereNotInStock({ page, filter }: { page: number; filter?: string }) {
		const queryBuilder = this.dataSource
			.getRepository(RFIDInventoryEntity)
			.createQueryBuilder('inv')
			.select('inv.epc', 'epc')
			.addSelect('COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue)', 'mo_no')
			.where({ record_time: MoreThanOrEqual(format(new Date(), 'yyyy-MM-dd')) })
			.andWhere({ rfid_status: IsNull() })
			.andWhere({ epc: Not(Like(this.IGNORE_EPC_PATTERN)) })
			.andWhere('COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue) NOT IN (:...ignoredOrders)')
			.andWhere(
				new Brackets((qb) => {
					if (!filter) return qb
					return qb.andWhere('COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue) = :filter', { filter })
				})
			)
			.setParameters({
				fallbackValue: this.FALLBACK_VALUE,
				ignoredOrders: this.IGNORE_ORDERS
			})

		const [data, totalDocs] = await Promise.all([
			queryBuilder
				.orderBy('inv.record_time', 'DESC')
				.addOrderBy('inv.epc', 'ASC')
				.take(this.LIMIT_FETCH_DOCS)
				.skip((page - 1) * this.LIMIT_FETCH_DOCS)
				.getRawMany(),
			queryBuilder.getCount()
		])

		const totalPages = Math.ceil(totalDocs / this.LIMIT_FETCH_DOCS)

		return {
			data,
			hasNextPage: page < totalPages,
			hasPrevPage: page > 1,
			totalDocs,
			limit: this.LIMIT_FETCH_DOCS,
			page,
			totalPages
		}
	}

	/**
	 * @private
	 */
	private async getOrderSizes() {
		// * Execute raw query is faster than query builder
		const query = readFileSync(join(__dirname, './sql/order-size.sql'), 'utf-8').toString()
		return await this.dataSource.query(query)
	}

	async searchCustomerOrder(orderTarget: string, searchTerm: string) {
		const queryBuilder = this.dataSource
			.createQueryBuilder()
			.select('cust2.mo_no', 'mo_no')
			.from(RFIDCustomerEntity, 'cust1')
			.addFrom(RFIDCustomerEntity, 'cust2')
			.where('cust1.mat_code = cust2.mat_code')
			.andWhere('cust1.mo_no = :orderTarget', { orderTarget })
			.andWhere('cust1.mo_no <> cust2.mo_no')
			.andWhere('cust2.mo_no LIKE :searchTerm', { searchTerm: `${searchTerm}%` })
			.groupBy('cust2.mo_no')

		FileLogger.debug(queryBuilder.getSql())
		// return results
		// if (!results.includes(orderTarget)) return []
		return await queryBuilder.getRawMany()
	}

	/**
	 * @private
	 */
	private async getOrderQuantity() {
		return await this.dataSource
			.getRepository(RFIDInventoryEntity)
			.createQueryBuilder('inv')
			.select('COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue)', 'mo_no')
			.addSelect('COUNT(DISTINCT inv.epc)', 'count')
			.where('inv.epc NOT LIKE :ignoreEpcPattern')
			.andWhere('COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue) NOT IN (:...ignoredOrders)')
			.andWhere('inv.rfid_status IS NULL')
			.andWhere('inv.record_time >= :today')
			.groupBy('COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue)')
			.orderBy('count', 'DESC')
			.setParameters({
				today: format(new Date(), 'yyyy-MM-dd'),
				fallbackValue: this.FALLBACK_VALUE,
				ignoreEpcPattern: this.IGNORE_EPC_PATTERN,
				ignoredOrders: this.IGNORE_ORDERS
			})
			.getRawMany()
	}

	async getManufacturingOrderDetail() {
		const [sizes, orders] = await Promise.all([this.getOrderSizes(), this.getOrderQuantity()])
		return { sizes, orders }
	}

	async updateStock(payload: UpdateStockDTO) {
		return await this.dataSource.getRepository(RFIDInventoryEntity).update(
			{
				mo_no: payload.mo_no ?? IsNull(),
				rfid_status: IsNull(),
				record_time: MoreThanOrEqual(format(new Date(), 'yyyy-MM-dd'))
			},
			omit(payload, 'mo_no')
		)
	}

	async deleteUnexpectedOrder(orderCode: string) {
		const queryRunner = this.dataSource.createQueryRunner()
		await queryRunner.startTransaction()
		Logger.debug(orderCode)
		try {
			await queryRunner.manager.query(
				/* SQL */ `DELETE FROM DV_DATA_LAKE.dbo.UHF_RFID_TEST WHERE epc IN (
									SELECT EPC_Code AS epc FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet
									WHERE mo_no = @0)`,
				[orderCode]
			)
			await queryRunner.manager
				.createQueryBuilder()
				.delete()
				.from(RFIDInventoryEntity)
				.where({ mo_no: orderCode })
				.orWhere({ mo_no_actual: orderCode })
				.execute()

			await queryRunner.commitTransaction()
		} catch (error) {
			await queryRunner.rollbackTransaction()
			throw new InternalServerErrorException(error)
		} finally {
			await queryRunner.release()
		}
	}

	/**
	 * @private
	 */
	private async getAllExchangableEpc(payload: Pick<ExchangeEpcDTO, 'mo_no' | 'mo_no_actual'>) {
		const { mo_no, mo_no_actual } = payload
		const query = readFileSync(join(__dirname, './sql/exchangable-epc.sql'), 'utf-8').toString()
		return await this.dataSource.query(query, [mo_no, mo_no_actual])
	}

	/**
	 * @private
	 */
	private async getExchangableEpcBySize(payload: ExchangeEpcDTO) {
		return await this.dataSource
			.getRepository(RFIDInventoryEntity)
			.createQueryBuilder('inv')
			.select('cust.epc AS epc')
			.innerJoin(
				RFIDCustomerEntity,
				'cust',
				/* SQL */ `
					inv.epc = cust.epc 
					AND COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue) = COALESCE(cust.mo_no_actual, cust.mo_no, :fallbackValue)
				`
			)
			.where('inv.rfid_status IS NULL')
			.andWhere('inv.record_time >= :today')
			.andWhere('inv.epc NOT LIKE :ignoreEpcPattern')
			.andWhere('cust.epc NOT LIKE :ignoreEpcPattern')
			.andWhere('COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue) NOT IN (:...ignoredOrders)')
			.andWhere('COALESCE(cust.mo_no_actual, inv.mo_no, :fallbackValue) NOT IN (:...ignoredOrders)')
			.andWhere('COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue) = :manufacturingOrder')
			.andWhere('COALESCE(cust.mo_no_actual, cust.mo_no, :fallbackValue) = :manufacturingOrder')
			.andWhere('cust.mat_code = :finishedProductionCode', { finishedProductionCode: payload.mat_code })
			.andWhere('cust.size_numcode = :sizeNumCode', { sizeNumCode: payload.size_numcode })
			.setParameters({
				today: format(new Date(), 'yyyy-MM-dd'),
				manufacturingOrder: payload.mo_no,
				finishedProductionCode: payload.mat_code,
				sizeNumCode: payload.size_numcode,
				fallbackValue: this.FALLBACK_VALUE,
				ignoreEpcPattern: this.IGNORE_EPC_PATTERN,
				ignoredOrders: this.IGNORE_ORDERS
			})
			.limit(payload.quantity)
			.getRawMany()
	}

	async exchangeEpc(payload: ExchangeEpcDTO) {
		const epcToExchange = payload.multi
			? await this.getAllExchangableEpc(payload)
			: await this.getExchangableEpcBySize(payload)

		Logger.debug(JSON.stringify(epcToExchange, null, 2))
		const queryRunner = this.dataSource.createQueryRunner()
		const criteria: FindOptionsWhere<RFIDCustomerEntity | RFIDInventoryEntity> = {
			epc: In(epcToExchange.map((item) => item.epc))
		}

		FileLogger.debug(epcToExchange)
		const update = pick(payload, 'mo_no_actual')

		await queryRunner.startTransaction()
		try {
			await Promise.all([
				queryRunner.manager.update(RFIDCustomerEntity, criteria, update),
				queryRunner.manager.update(RFIDInventoryEntity, criteria, update)
			])
			await queryRunner.commitTransaction()
		} catch (e) {
			Logger.error(e.message)
			await queryRunner.rollbackTransaction()
			throw new InternalServerErrorException(e.message)
		} finally {
			await queryRunner.release()
		}
	}
}
