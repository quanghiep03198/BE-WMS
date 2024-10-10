import { Injectable, InternalServerErrorException, Scope } from '@nestjs/common'
import { format } from 'date-fns'
import { readFileSync } from 'fs'
import { chunk, omit, pick } from 'lodash'
import { join } from 'path'
import { Brackets, DataSource, FindOptionsWhere, In, IsNull, MoreThanOrEqual } from 'typeorm'
import { TenancyService } from '../tenancy/tenancy.service'
import { ExchangeEpcDTO, UpdateStockDTO } from './dto/rfid.dto'
import { RFIDCustomerEntity } from './entities/rfid-customer.entity'
import { RFIDInventoryEntity } from './entities/rfid-inventory.entity'

@Injectable({ scope: Scope.REQUEST })
export class RFIDService {
	private readonly dataSource: DataSource

	private readonly IGNORE_ORDERS: Array<string> = ['13D05B006']
	private readonly IGNORE_EPC_PATTERN = '303429%'
	private readonly INTERNAL_EPC_PATTERN = 'E28%'
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
			.select(/* SQL */ `inv.epc`, 'epc')
			.addSelect(/* SQL */ `COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue)`, 'mo_no')
			.where(/* SQL */ `inv.record_time >= :today`)
			.andWhere(/* SQL */ `inv.rfid_status IS NULL`)
			.andWhere(/* SQL */ `inv.epc NOT LIKE :ignoreEpcPattern`)
			.andWhere(/* SQL */ `inv.epc NOT LIKE :internalEpcPattern`)
			.andWhere(/* SQL */ `COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue) NOT IN (:...ignoredOrders)`)
			.andWhere(
				new Brackets((qb) => {
					if (!filter) return qb
					return qb.andWhere(/* SQL */ `COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue) = :orderCode`, {
						orderCode: filter
					})
				})
			)
			.setParameters({
				today: format(new Date(), 'yyyy-MM-dd'),
				fallbackValue: this.FALLBACK_VALUE,
				ignoredOrders: this.IGNORE_ORDERS,
				ignoreEpcPattern: this.IGNORE_EPC_PATTERN,
				internalEpcPattern: this.INTERNAL_EPC_PATTERN
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
			.select(/* SQL */ `cust2.mo_no`, 'mo_no')
			.from(RFIDCustomerEntity, 'cust1')
			.addFrom(RFIDCustomerEntity, 'cust2')
			.where(/* SQL */ `cust1.mat_code = cust2.mat_code`)
			.andWhere(/* SQL */ `cust1.mo_no = :orderTarget`, { orderTarget })
			.andWhere(/* SQL */ `cust1.mo_no <> cust2.mo_no`)
			.andWhere(/* SQL */ `cust2.mo_no LIKE :searchTerm`, { searchTerm: `%${searchTerm}%` })
			.groupBy(/* SQL */ `cust2.mo_no`)

		return await queryBuilder.getRawMany()
	}

	/**
	 * @private
	 */
	private async getOrderQuantity() {
		return await this.dataSource
			.getRepository(RFIDInventoryEntity)
			.createQueryBuilder('inv')
			.select(/* SQL */ `COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue)`, 'mo_no')
			.addSelect(/* SQL */ `COUNT(DISTINCT inv.epc)`, 'count')
			.where(/* SQL */ `inv.epc NOT LIKE :ignoreEpcPattern`)
			.andWhere(/* SQL */ `inv.epc NOT LIKE :internalEpcPattern`)
			.andWhere(/* SQL */ `COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue) NOT IN (:...ignoredOrders)`)
			.andWhere(/* SQL */ `inv.rfid_status IS NULL`)
			.andWhere(/* SQL */ `inv.record_time >= :today`)
			.groupBy(/* SQL */ `COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue)`)
			.orderBy('count', 'DESC')
			.setParameters({
				today: format(new Date(), 'yyyy-MM-dd'),
				fallbackValue: this.FALLBACK_VALUE,
				ignoreEpcPattern: this.IGNORE_EPC_PATTERN,
				internalEpcPattern: this.INTERNAL_EPC_PATTERN,
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
		try {
			await queryRunner.manager.query(
				/* SQL */ `
					DELETE FROM DV_DATA_LAKE.dbo.UHF_RFID_TEST WHERE epc IN (
						SELECT EPC_Code AS epc FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet
						WHERE mo_no = @0)
					`,
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
			.select(/* SQL */ `cust.epc`, 'epc')
			.innerJoin(
				RFIDCustomerEntity,
				'cust',
				/* SQL */ `inv.epc = cust.epc AND COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue) = COALESCE(cust.mo_no_actual, cust.mo_no, :fallbackValue)`
			)
			.where('inv.rfid_status IS NULL')
			.andWhere(/* SQL */ `inv.record_time >= :today`)
			.andWhere(/* SQL */ `inv.epc NOT LIKE :ignoreEpcPattern`)
			.andWhere(/* SQL */ `inv.epc NOT LIKE :internalEpcPattern`)
			.andWhere(/* SQL */ `cust.epc NOT LIKE :ignoreEpcPattern`)
			.andWhere(/* SQL */ `COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue) NOT IN (:...ignoredOrders)`)
			.andWhere(/* SQL */ `COALESCE(cust.mo_no_actual, inv.mo_no, :fallbackValue) NOT IN (:...ignoredOrders)`)
			.andWhere(/* SQL */ `COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue) = :manufacturingOrder`)
			.andWhere(/* SQL */ `COALESCE(cust.mo_no_actual, cust.mo_no, :fallbackValue) = :manufacturingOrder`)
			.andWhere(/* SQL */ `cust.mat_code = :finishedProductionCode`, { finishedProductionCode: payload.mat_code })
			.andWhere(/* SQL */ `cust.size_numcode = :sizeNumCode`, { sizeNumCode: payload.size_numcode })
			.setParameters({
				today: format(new Date(), 'yyyy-MM-dd'),
				manufacturingOrder: payload.mo_no,
				finishedProductionCode: payload.mat_code,
				sizeNumCode: payload.size_numcode,
				fallbackValue: this.FALLBACK_VALUE,
				ignoreEpcPattern: this.IGNORE_EPC_PATTERN,
				internalEpcPattern: this.INTERNAL_EPC_PATTERN,
				ignoredOrders: this.IGNORE_ORDERS
			})
			.limit(payload.quantity)
			.getRawMany()
	}

	async exchangeEpc(payload: ExchangeEpcDTO) {
		const epcToExchange = payload.multi
			? await this.getAllExchangableEpc(payload)
			: await this.getExchangableEpcBySize(payload)

		const queryRunner = this.dataSource.createQueryRunner()
		const update = pick(payload, 'mo_no_actual')

		const BATCH_SIZE = 2000
		const epcBatches = chunk(
			epcToExchange.map((item) => item.epc),
			BATCH_SIZE
		)
		await queryRunner.startTransaction()
		try {
			for (const epcBatch of epcBatches) {
				const criteria: FindOptionsWhere<RFIDCustomerEntity | RFIDInventoryEntity> = {
					epc: In(epcBatch) // Sử dụng nhóm EPC hiện tại
				}
				await Promise.all([
					queryRunner.manager.update(RFIDCustomerEntity, criteria, update),
					queryRunner.manager.update(RFIDInventoryEntity, criteria, update)
				])
			}
			await queryRunner.commitTransaction()
		} catch (e) {
			await queryRunner.rollbackTransaction()
			throw new InternalServerErrorException(e.message)
		} finally {
			await queryRunner.release()
		}
	}
}
