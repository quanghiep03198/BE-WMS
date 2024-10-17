import { Injectable, InternalServerErrorException, NotFoundException, Scope } from '@nestjs/common'
import { format } from 'date-fns'
import { readFileSync } from 'fs'
import { chunk, omit, pick } from 'lodash'
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
	private readonly INTERNAL_EPC_PATTERN = 'E28%'
	private readonly LIMIT_FETCH_DOCS = 50
	private readonly FALLBACK_VALUE = 'Unknown'

	constructor(protected tenacyService: TenancyService) {
		this.dataSource = tenacyService.dataSource
	}

	async fetchItems({ page, filter }: { page: number; filter?: string }) {
		try {
			const [epcs, orders, sizes, has_invalid_epc] = await Promise.all([
				this.findWhereNotInStock({ page, filter }),
				this.getOrderQuantity(),
				this.getOrderSizes(),
				this.checkInvalidEpcExist()
			])
			return { epcs, orders, sizes, has_invalid_epc }
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
				ignoreEpcPattern: this.IGNORE_EPC_PATTERN
			})

		const [data, totalDocs] = await Promise.all([
			queryBuilder
				.orderBy(/* SQL */ `inv.record_time`, 'DESC')
				.addOrderBy(/* SQL */ `inv.epc`, 'ASC')
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

	async getManufacturingOrderDetail() {
		const [sizes, orders] = await Promise.all([this.getOrderSizes(), this.getOrderQuantity()])
		return { sizes, orders }
	}

	async updateStock(payload: UpdateStockDTO) {
		return await this.dataSource
			.getRepository(RFIDInventoryEntity)
			.createQueryBuilder()
			.update()
			.set(omit(payload, 'mo_no'))
			.where(/* SQL */ `COALESCE(mo_no_actual, mo_no, :fallbackValue) = :mo_no`, {
				mo_no: payload.mo_no,
				fallbackValue: this.FALLBACK_VALUE
			})
			.execute()
	}

	async deleteUnexpectedOrder(orderCode: string) {
		if (orderCode === this.FALLBACK_VALUE) return // * Only delete defined manufacturing order

		const queryRunner = this.dataSource.createQueryRunner()
		await queryRunner.startTransaction()
		try {
			await queryRunner.manager.query(
				/* SQL */ `DELETE FROM DV_DATA_LAKE.dbo.UHF_RFID_TEST WHERE epc IN (
						SELECT EPC_Code as epc FROM DV_DATA_LAKE.dbo.dv_InvRFIDrecorddet
						WHERE COALESCE(mo_no_actual, mo_no) = @0)`,
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

	async getAllExchangableEpc(payload: Pick<ExchangeEpcDTO, 'mo_no' | 'mo_no_actual' | 'quantity'>) {
		const { mo_no, mo_no_actual } = payload
		if (mo_no === this.FALLBACK_VALUE)
			return await this.dataSource
				.getRepository(RFIDInventoryEntity)
				.createQueryBuilder('inv')
				.select('inv.epc', 'epc')
				.where({ mo_no: IsNull() })
				.andWhere({ rfid_status: IsNull() })
				.andWhere({ record_time: MoreThanOrEqual(format(new Date(), 'yyyy-MM-dd')) })
				.andWhere({ epc: Not(Like(this.INTERNAL_EPC_PATTERN)) })
				.limit(payload.quantity)
				.getRawMany()
		const query = readFileSync(join(__dirname, './sql/exchangable-epc.sql'), 'utf-8').toString()
		return await this.dataSource.query(query, [mo_no, mo_no_actual])
	}

	async searchCustomerOrder(searchTerm: string) {
		return await this.dataSource.query(
			/* SQL */ `WITH datalist as (
					SELECT DISTINCT mo_no
					FROM DV_DATA_LAKE.dbo.dv_RFIDrecordmst_cust
					UNION ALL SELECT DISTINCT mo_no
					FROM DV_DATA_LAKE.dbo.dv_rfidmatchmst_cust
				) SELECT DISTINCT TOP 5 * FROM datalist WHERE mo_no LIKE CONCAT('%', @0, '%')`,
			[searchTerm]
		)
	}

	async exchangeEpc(payload: ExchangeEpcDTO) {
		const epcToExchange = payload.multi
			? await this.getAllExchangableEpc(payload)
			: await this.getExchangableEpcBySize(payload)

		if (epcToExchange.length === 0) {
			throw new NotFoundException('No matching EPC')
		}

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

	/**
	 * @private
	 */
	private async checkInvalidEpcExist() {
		return await this.dataSource.getRepository(RFIDInventoryEntity).existsBy({ epc: Like(this.INTERNAL_EPC_PATTERN) })
	}

	/**
	 * @private
	 */
	private async getOrderSizes() {
		// * Execute raw query is faster than query builder
		const query = readFileSync(join(__dirname, './sql/order-size.sql'), 'utf-8').toString()
		return await this.dataSource.query(query)
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
			.andWhere(/* SQL */ `COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue) NOT IN (:...ignoredOrders)`)
			.andWhere(/* SQL */ `inv.rfid_status IS NULL`)
			.andWhere(/* SQL */ `inv.record_time >= :today`)
			.groupBy(/* SQL */ `COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue)`)
			.orderBy('count', 'DESC')
			.setParameters({
				today: format(new Date(), 'yyyy-MM-dd'),
				fallbackValue: this.FALLBACK_VALUE,
				ignoreEpcPattern: this.IGNORE_EPC_PATTERN,
				ignoredOrders: this.IGNORE_ORDERS
			})
			.getRawMany()
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
			.where(/* SQL */ `inv.rfid_status IS NULL`)
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
}
