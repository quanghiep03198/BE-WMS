/* eslint-disable prefer-const */
import { FileLogger } from '@/common/helpers/file-logger.helper'
import {
	BadRequestException,
	Inject,
	Injectable,
	InternalServerErrorException,
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
import { And, Brackets, DataSource, Equal, FindOptionsWhere, In, IsNull, Like, MoreThanOrEqual, Not } from 'typeorm'
import { SqlServerConnectionOptions } from 'typeorm/driver/sqlserver/SqlServerConnectionOptions'
import { ExchangeEpcDTO, UpdateStockDTO } from './dto/rfid.dto'
import { RFIDCustomerEntity } from './entities/rfid-customer.entity'
import { RFIDInventoryEntity } from './entities/rfid-inventory.entity'

@Injectable({ scope: Scope.REQUEST })
export class RFIDService implements OnModuleDestroy {
	/**
	 * @private
	 * Dynamic data source based on host that attached to request header
	 */
	private readonly dataSource: DataSource
	/**
	 * @private
	 * Ignore stucked orders inside RFID machine
	 */
	private readonly IGNORE_ORDERS: Array<string> = ['13D05B006']
	/**
	 * @private
	 * Ignore all EPC of partner Dancle
	 */
	private readonly IGNORE_EPC_PATTERN = '303429%'

	/**
	 * @private
	 * Chunk size for each fetching data response
	 */
	private readonly LIMIT_FETCH_DOCS = 50

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
			console.log(error)
			return error
		}
	}

	private async findWhereNotInStock({ page, filter }: { page: number; filter?: string }) {
		const [data, totalDocs] = await Promise.all([
			this.dataSource
				.getRepository(RFIDInventoryEntity)
				.createQueryBuilder()
				.select(['EPC_Code as epc', "ISNULL(mo_no, 'Unknown') AS mo_no"])
				.where('record_time >= :today', { today: format(new Date(), 'yyyy-MM-dd') })
				.andWhere('rfid_status IS NULL')
				.andWhere('EPC_Code NOT LIKE :ignoreEpcPattern', { ignoreEpcPattern: this.IGNORE_EPC_PATTERN })
				.andWhere('mo_no NOT IN (:...orders)', { orders: this.IGNORE_ORDERS })
				.andWhere(
					new Brackets((qb) => {
						if (!filter) return qb
						return qb.andWhere('mo_no = :filter', { filter })
					})
				)
				.orderBy('record_time', 'DESC')
				.orderBy('epc', 'ASC')
				.take(this.LIMIT_FETCH_DOCS)
				.skip((page - 1) * this.LIMIT_FETCH_DOCS)
				.getRawMany(),
			this.dataSource.getRepository(RFIDInventoryEntity).countBy({
				rfid_status: IsNull(),
				record_time: MoreThanOrEqual(format(new Date(), 'yyyy-MM-dd')),
				epc: Not(Like(this.IGNORE_EPC_PATTERN)),
				mo_no: !!filter ? And(Not(In(this.IGNORE_ORDERS)), Equal(filter)) : Not(In(this.IGNORE_ORDERS))
			})
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
		const query = readFileSync(join(__dirname, './sql/size-qty.sql'), 'utf8').toString()
		return await this.dataSource.query(query)
	}

	private async getOrderQuantity() {
		const query = readFileSync(join(__dirname, './sql/order-qty.sql'), 'utf8').toString()
		return await this.dataSource.query(query)
	}

	async updateStock(payload: UpdateStockDTO) {
		await this.ensureDataSourceInitialized()
		// TODO: Update stock movement
		return await this.dataSource.getRepository(RFIDInventoryEntity).update(
			{
				mo_no: payload.mo_no,
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
			await Promise.all([
				queryRunner.manager.delete(RFIDInventoryEntity, { mo_no: orderCode }),
				queryRunner.manager.delete(RFIDCustomerEntity, { mo_no: orderCode })
			])
		} catch (error) {
			await queryRunner.rollbackTransaction()
			throw new InternalServerErrorException(error)
		} finally {
			await queryRunner.release()
		}
	}

	async exchangeEpc(payload: ExchangeEpcDTO) {
		FileLogger.debug(payload)
		await this.ensureDataSourceInitialized()
		const epcToExchange = await this.dataSource
			.getRepository(RFIDInventoryEntity)
			.createQueryBuilder('inv')
			.select('cust.epc AS epc')
			.leftJoin(RFIDCustomerEntity, 'cust', 'inv.epc = cust.epc')
			.where('inv.mo_no = :orderCode', { orderCode: payload.mo_no })
			.andWhere('inv.rfid_status IS NULL')
			.andWhere('cust.mo_no_actual IS NULL')
			.andWhere('inv.record_time >= :today', { today: format(new Date(), 'yyyy-MM-dd') })
			.andWhere('cust.mat_code = :materialCode', { materialCode: payload.mat_code })
			.andWhere('cust.size_numcode = :sizeNumCode', { sizeNumCode: payload.size_numcode })
			.limit(payload.quantity)
			.getRawMany<{ epc: string }>()

		const queryRunner = this.dataSource.createQueryRunner()

		const criteria: FindOptionsWhere<RFIDCustomerEntity | RFIDInventoryEntity> = {
			epc: In(epcToExchange.map((item) => item.epc))
		}
		const update = pick(payload, 'mo_no_actual')

		await queryRunner.startTransaction()
		try {
			await Promise.all([
				queryRunner.manager.update(RFIDCustomerEntity, criteria, update),
				queryRunner.manager.update(RFIDInventoryEntity, criteria, update)
			])
			await queryRunner.commitTransaction()
		} catch (e) {
			await queryRunner.rollbackTransaction()
			throw new InternalServerErrorException(e.message)
		} finally {
			await queryRunner.release()
		}
	}
}
