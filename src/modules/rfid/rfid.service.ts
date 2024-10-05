import {
	BadRequestException,
	Inject,
	Injectable,
	InternalServerErrorException,
	Logger,
	OnModuleDestroy,
	Scope
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { REQUEST } from '@nestjs/core'
import { format } from 'date-fns'
import { Request } from 'express'
import { readFileSync } from 'fs'
import { omit, pick } from 'lodash'
import path, { join } from 'path'
import { Brackets, DataSource, FindOptionsWhere, In, IsNull, Like, MoreThanOrEqual, Not } from 'typeorm'
import { SqlServerConnectionOptions } from 'typeorm/driver/sqlserver/SqlServerConnectionOptions'
import { ExchangeEpcDTO, UpdateStockDTO } from './dto/rfid.dto'
import { RFIDCustomerEntity } from './entities/rfid-customer.entity'
import { RFIDInventoryEntity } from './entities/rfid-inventory.entity'

@Injectable({ scope: Scope.REQUEST })
export class RFIDService implements OnModuleDestroy {
	private readonly dataSource: DataSource

	private readonly IGNORE_ORDERS: Array<string> = ['13D05B006']
	private readonly IGNORE_EPC_PATTERN = '303429%'
	// private readonly BOX_LINER_EPC = '3312D%'
	private readonly LIMIT_FETCH_DOCS = 50
	private readonly FALLBACK_VALUE = 'Unknown'

	constructor(
		@Inject(REQUEST) private readonly request: Request,
		private configService: ConfigService
	) {
		const host = this.request.headers['x-database-host'] as string
		if (!host) throw new BadRequestException('Database host is required')

		this.dataSource = new DataSource({
			...this.configService.getOrThrow<SqlServerConnectionOptions>('database'),
			entities: [path.resolve(path.join(__dirname, './entities/*.entity.{ts,js}'))],
			host
		})
	}

	async onModuleDestroy() {
		await this.dataSource.destroy()
	}

	/**
	 * @private
	 * @description Ensure database connection is established everytime the service is called
	 */
	private async ensureDataSourceInitialized() {
		if (!this.dataSource.isInitialized) await this.dataSource.initialize()
	}

	async fetchItems({ page, filter }: { page: number; filter?: string }) {
		try {
			await this.ensureDataSourceInitialized()
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
		await this.ensureDataSourceInitialized()

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

	private async getOrderSizes() {
		return await this.dataSource
			.createQueryBuilder()
			.select('COALESCE(cust.mo_no_actual, cust.mo_no, :fallbackValue)', 'mo_no')
			.addSelect('cust.mat_code', 'mat_code')
			.addSelect('COALESCE(cust.size_numcode, :fallbackValue)', 'size_numcode')
			.addSelect('COUNT(DISTINCT inv.epc)', 'count')
			.from(RFIDCustomerEntity, 'cust')
			.innerJoin(
				RFIDInventoryEntity,
				'inv',
				'inv.epc = cust.epc AND COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue) = COALESCE(cust.mo_no_actual, cust.mo_no, :fallbackValue)' // Ensure the join condition is correct
			)
			.where('inv.rfid_status IS NULL')
			.andWhere('inv.record_time >= :today')
			.andWhere('inv.epc NOT LIKE :ignoreEpcPattern')
			.andWhere('COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue) NOT IN (:...ignoredOrders)')
			.andWhere('COALESCE(cust.mo_no_actual, cust.mo_no, :fallbackValue) NOT IN (:...ignoredOrders)')
			.groupBy('COALESCE(cust.mo_no_actual, cust.mo_no, :fallbackValue)')
			.addGroupBy('cust.mat_code')
			.addGroupBy('COALESCE(cust.size_numcode, :fallbackValue)')
			.orderBy('size_numcode', 'ASC')
			.setParameters({
				today: format(new Date(), 'yyyy-MM-dd'),
				fallbackValue: this.FALLBACK_VALUE,
				ignoreEpcPattern: this.IGNORE_EPC_PATTERN,
				ignoredOrders: this.IGNORE_ORDERS
			})
			.getRawMany()
	}

	async searchCustomerOrder(searchTerm: string) {
		return await this.dataSource
			.getRepository(RFIDCustomerEntity)
			.createQueryBuilder('cust')
			.select('COALESCE(cust.mo_no_actual, cust.mo_no)', 'mo_no')
			.innerJoin(
				RFIDInventoryEntity,
				'inv',
				'inv.epc = cust.epc AND COALESCE(cust.mo_no_actual, cust.mo_no) = COALESCE(inv.mo_no_actual, inv.mo_no)'
			)
			.where({ epc: Like(searchTerm) })
			.limit(5)
			.getRawMany()
	}

	private async getOrderQuantity() {
		return await this.dataSource
			.getRepository(RFIDInventoryEntity)
			.createQueryBuilder('inv')
			.select('COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue)', 'mo_no')
			.addSelect('COUNT(DISTINCT inv.epc)', 'count')
			.where('inv.rfid_status IS NULL')
			.andWhere('inv.record_time >= :today')
			.andWhere('inv.epc NOT LIKE :ignoreEpcPattern')
			.andWhere('COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue) NOT IN (:...ignoredOrders)')
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
		await this.ensureDataSourceInitialized()
		const [sizes, orders] = await Promise.all([this.getOrderSizes(), this.getOrderQuantity()])

		return { sizes, orders }
	}

	async updateStock(payload: UpdateStockDTO) {
		await this.ensureDataSourceInitialized()
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
		await this.ensureDataSourceInitialized()
		const queryRunner = this.dataSource.createQueryRunner()
		await queryRunner.startTransaction()
		try {
			// Xóa từ RFIDInventoryEntity với điều kiện OR
			await queryRunner.manager
				.createQueryBuilder()
				.delete()
				.from(RFIDInventoryEntity)
				.where({ rfid_status: IsNull() })
				.andWhere({ record_time: MoreThanOrEqual(format(new Date(), 'yyyy-MM-dd')) })
				.where(
					new Brackets((qb) => {
						if (orderCode === this.FALLBACK_VALUE) return qb.where({ mo_no: IsNull() })
						return qb.where({ mo_no: orderCode }).orWhere({
							mo_no_actual: orderCode
						})
					})
				)
				.execute()

			// Xóa từ RFIDCustomerEntity với điều kiện OR
			await queryRunner.manager
				.createQueryBuilder()
				.delete()
				.from(RFIDCustomerEntity)
				.where(
					new Brackets((qb) => {
						if (orderCode === this.FALLBACK_VALUE) return qb.where({ mo_no: IsNull() })
						return qb.where({ mo_no: orderCode }).orWhere({
							mo_no_actual: orderCode
						})
					})
				)

				.execute()
			await queryRunner.commitTransaction()
		} catch (error) {
			Logger.error(error.message)
			await queryRunner.rollbackTransaction()
			throw new InternalServerErrorException(error)
		} finally {
			await queryRunner.release()
		}
	}

	private async getAllExchangableEpc(payload: Pick<ExchangeEpcDTO, 'mo_no' | 'mo_no_actual'>) {
		const { mo_no, mo_no_actual } = payload
		const query = readFileSync(join(__dirname, './sql/exchangable-orders.sql'), 'utf8').toString()
		return await this.dataSource.query(query, [mo_no, mo_no_actual])
	}

	private async getExchangableEpcBySize(payload: ExchangeEpcDTO) {
		return await this.dataSource
			.getRepository(RFIDInventoryEntity)
			.createQueryBuilder('inv')
			.select('cust.epc AS epc')
			.innerJoin(
				RFIDCustomerEntity,
				'cust',
				`
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
		await this.ensureDataSourceInitialized()
		const epcToExchange = payload.multi
			? await this.getAllExchangableEpc(payload)
			: await this.getExchangableEpcBySize(payload)

		const queryRunner = this.dataSource.createQueryRunner()
		const criteria: FindOptionsWhere<RFIDCustomerEntity | RFIDInventoryEntity> = {
			epc: In(epcToExchange.map((item) => item.epc))
		}
		const update = pick(payload, 'mo_no_actual')

		await queryRunner.startTransaction()
		try {
			await queryRunner.manager.update(RFIDCustomerEntity, criteria, update)
			await queryRunner.manager.update(RFIDInventoryEntity, criteria, update)
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
