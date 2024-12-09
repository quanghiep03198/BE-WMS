import { Injectable, Logger } from '@nestjs/common'
import { groupBy } from 'lodash'
import { DataSource, In, IsNull, Like, Not } from 'typeorm'
import { TenancyService } from '../tenancy/tenancy.service'
import { EXCLUDED_EPC_PATTERN, EXCLUDED_ORDERS, FALLBACK_VALUE, INTERNAL_EPC_PATTERN } from './constants'
import { ExchangeEpcDTO } from './dto/rfid.dto'
import { FPInventoryEntity } from './entities/fp-inventory.entity'
import { RFIDMatchCustomerEntity } from './entities/rfid-customer-match.entity'

/**
 * @description Repository for Finished Production Inventory (FPI)
 */
@Injectable()
export class FPIRespository {
	constructor(private readonly tenancyService: TenancyService) {}

	/**
	 * @description Check if there is any invalid EPC exist
	 */
	async checkInvalidEpcExist() {
		return await this.tenancyService.dataSource.getRepository(FPInventoryEntity).existsBy({
			epc: Like(INTERNAL_EPC_PATTERN),
			// record_time: MoreThanOrEqual(format(new Date(), 'yyyy-MM-dd')),
			rfid_status: IsNull()
		})
	}

	/**
	 * @description Get manufacturing order sizes
	 */
	async getOrderDetails() {
		const result = await this.tenancyService.dataSource
			.getRepository(FPInventoryEntity)
			.createQueryBuilder('inv')
			.select([
				/* SQL */ `COALESCE(inv.mo_no_actual, inv.mo_no, cust.mo_no_actual, cust.mo_no, :fallbackValue) AS mo_no`,
				/* SQL */ `COALESCE(cust.mat_code, :fallbackValue) AS mat_code`,
				/* SQL */ `COALESCE(cust.shoestyle_codefactory, :fallbackValue) AS shoes_style_code_factory`,
				/* SQL */ `ISNULL(cust.size_numcode, :fallbackValue) AS size_numcode`,
				/* SQL */ `COUNT(DISTINCT inv.EPC_Code) AS count`
			])
			.leftJoin(
				RFIDMatchCustomerEntity,
				'cust',
				/* SQL */ `inv.EPC_Code = cust.EPC_Code 
					AND COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue) = COALESCE(cust.mo_no_actual, cust.mo_no, :fallbackValue)`
			)
			.where(/* SQL */ `inv.EPC_Code NOT LIKE :excludedEpcPattern`)
			.andWhere(/* SQL */ `inv.EPC_Code NOT LIKE :internalEpcPattern`)
			// .andWhere(/* SQL */ `inv.record_time >= CAST(GETDATE() AS DATE)`)
			.andWhere(/* SQL */ `inv.rfid_status IS NULL`)
			.andWhere(/* SQL */ `COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue) NOT IN (:...excludedOrders)`)
			.andWhere(/* SQL */ `COALESCE(cust.mo_no_actual, cust.mo_no, :fallbackValue) NOT IN (:...excludedOrders)`)
			.groupBy(
				/* SQL */ `
					COALESCE(inv.mo_no_actual, inv.mo_no, cust.mo_no_actual, cust.mo_no, :fallbackValue),
					COALESCE(cust.mat_code, :fallbackValue), COALESCE(cust.shoestyle_codefactory, :fallbackValue),
					ISNULL(cust.size_numcode, :fallbackValue)
				`
			)
			.orderBy('mat_code', 'ASC')
			.addOrderBy('size_numcode', 'ASC')
			.addOrderBy('mo_no', 'ASC')
			.setParameters({
				excludedEpcPattern: EXCLUDED_EPC_PATTERN,
				internalEpcPattern: INTERNAL_EPC_PATTERN,
				fallbackValue: FALLBACK_VALUE,
				excludedOrders: EXCLUDED_ORDERS
			})
			.maxExecutionTime(500)
			.getRawMany()

		return Object.entries(groupBy(result, 'mo_no')).map(([order, sizes]) => ({
			mo_no: order,
			mat_code: sizes[0].mat_code,
			shoes_style_code_factory: sizes[0].shoes_style_code_factory,
			sizes: sizes.map((size) => ({
				size_numcode: size.size_numcode,
				count: size.count
			}))
		}))
	}

	/**
	 * @description Get all exchangable EPC
	 */
	async getAllExchangableEpc(payload: Pick<ExchangeEpcDTO, 'mo_no' | 'mo_no_actual' | 'quantity'>) {
		const { mo_no, mo_no_actual } = payload
		if (mo_no === FALLBACK_VALUE) {
			return await this.tenancyService.dataSource
				.getRepository(FPInventoryEntity)
				.createQueryBuilder('inv')
				.select('inv.epc', 'epc')
				.where({ mo_no: IsNull() })
				.andWhere({ mo_no_actual: IsNull() })
				.andWhere({ epc: Not(Like(INTERNAL_EPC_PATTERN)) })
				.andWhere({ rfid_status: IsNull() })
				.limit(payload.quantity)
				.getRawMany()
		}

		const subQuery = this.tenancyService.dataSource
			.getRepository(RFIDMatchCustomerEntity)
			.createQueryBuilder('cust1')
			.select('cust1.EPC_Code')
			.innerJoin(
				RFIDMatchCustomerEntity,
				'cust2',
				/* SQL */ `cust1.mat_code = cust2.mat_code AND cust1.mo_no <> cust2.mo_no`
			)
			.where(/* SQL */ `COALESCE(cust1.mo_no_actual, cust1.mo_no) IN (:...ordersToExchange)`, {
				ordersToExchange: mo_no.split(',').map((m) => m.trim())
			})

		const queryBuilder = this.tenancyService.dataSource
			.getRepository(FPInventoryEntity)
			.createQueryBuilder('inv')
			.select(/* SQL */ `inv.EPC_Code`, 'epc')
			.where(/* SQL */ `inv.EPC_Code IN (${subQuery.getQuery()})`)
			.andWhere(/* SQL */ `inv.EPC_Code NOT LIKE :internalEpcPattern`, { internalEpcPattern: INTERNAL_EPC_PATTERN })
			.andWhere(/* SQL */ `inv.mo_no <> :mo_no_actual`, { mo_no_actual })
			.setParameters(subQuery.getParameters())

		const result = await queryBuilder.getRawMany()
		return result
	}

	/**
	 * @description Get exchangable EPC by size
	 */
	async getExchangableEpcBySize(payload: ExchangeEpcDTO) {
		return await this.tenancyService.dataSource
			.getRepository(FPInventoryEntity)
			.createQueryBuilder('inv')
			.select(/* SQL */ `cust.epc`, 'epc')
			.innerJoin(
				RFIDMatchCustomerEntity,
				'cust',
				/* SQL */ `inv.epc = cust.epc AND COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue) = COALESCE(cust.mo_no_actual, cust.mo_no, :fallbackValue)`
			)
			.where(/* SQL */ `inv.rfid_status IS NULL`)
			.andWhere(/* SQL */ `inv.epc NOT LIKE :excludedEpcPattern`)
			.andWhere(/* SQL */ `inv.epc NOT LIKE :internalEpcPattern`)
			.andWhere(/* SQL */ `cust.epc NOT LIKE :excludedEpcPattern`)
			.andWhere(/* SQL */ `COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue) NOT IN (:...excludedOrders)`)
			.andWhere(/* SQL */ `COALESCE(cust.mo_no_actual, inv.mo_no, :fallbackValue) NOT IN (:...excludedOrders)`)
			.andWhere(/* SQL */ `COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue) = :manufacturingOrder`)
			.andWhere(/* SQL */ `COALESCE(cust.mo_no_actual, cust.mo_no, :fallbackValue) = :manufacturingOrder`)
			.andWhere(/* SQL */ `cust.mat_code = :finishedProductionCode`, { finishedProductionCode: payload.mat_code })
			.andWhere(/* SQL */ `cust.size_numcode = :sizeNumCode`, { sizeNumCode: payload.size_numcode })
			.setParameters({
				manufacturingOrder: payload.mo_no,
				finishedProductionCode: payload.mat_code,
				sizeNumCode: payload.size_numcode,
				fallbackValue: FALLBACK_VALUE,
				excludedEpcPattern: EXCLUDED_EPC_PATTERN,
				internalEpcPattern: INTERNAL_EPC_PATTERN,
				excludedOrders: EXCLUDED_ORDERS
			})
			.limit(payload.quantity)
			.getRawMany()
	}

	async upsertBulk(dataSource: DataSource, payload: { [key: string]: RFIDMatchCustomerEntity[] }): Promise<void> {
		const queryRunner = dataSource.createQueryRunner()
		await queryRunner.connect()

		try {
			// Start a transaction
			await queryRunner.startTransaction()

			const chunkPayload = Object.entries(payload)
			for (const [commandNumber, epcData] of chunkPayload) {
				await queryRunner.query(/* SQL */ `
					MERGE INTO dv_rfidmatchmst_cust AS target
					USING (
						VALUES ${epcData
							.map((item) => {
								return `(
									'${item.epc}', '${item.mo_no}', '${item.mat_code}','${item.mo_noseq}', '${item.or_no}', 
									'${item.or_cust_po}', '${item.shoes_style_code_factory}', '${item.cust_shoes_style}', '${item.size_code}', '${item.size_numcode}', 
									'${item.factory_code_orders}', '${item.factory_name_orders}', '${item.factory_code_produce}', '${item.factory_name_produce}', ${item.size_qty || 1}
								)`
							})
							.join(',')}
					)  AS source (
							EPC_Code, mo_no, mat_code, mo_noseq, or_no, 
						 	or_custpo, shoestyle_codefactory, cust_shoestyle, size_code, size_numcode,
							factory_code_orders, factory_name_orders, factory_code_produce, factory_name_produce, size_qty
						)
					ON target.EPC_Code = source.EPC_Code
						WHEN MATCHED THEN
							UPDATE SET 
								target.mo_no = source.mo_no,
								target.mat_code = source.mat_code,
								target.mo_noseq = source.mo_noseq,
								target.or_no = source.or_no,
								target.or_custpo = source.or_custpo,
								target.shoestyle_codefactory = source.shoestyle_codefactory,
								target.cust_shoestyle = source.cust_shoestyle,
								target.size_code = source.size_code,
								target.size_numcode = source.size_numcode,
								target.factory_code_orders = source.factory_code_orders,
								target.factory_name_orders = source.factory_name_orders,
								target.factory_code_produce = source.factory_code_produce,
								target.factory_name_produce = source.factory_name_produce,
								target.size_qty = source.size_qty
						WHEN NOT MATCHED THEN
					INSERT (
						EPC_Code, mo_no, mat_code, mo_noseq, or_no, or_custpo, 
						shoestyle_codefactory, cust_shoestyle, size_code, size_numcode,
					  	factory_code_orders, factory_name_orders, factory_code_produce, factory_name_produce, size_qty, 
						isactive, created, ri_date, ri_type, ri_foot, ri_cancel)
					VALUES (
						source.EPC_Code, source.mo_no, source.mat_code, source.mo_noseq, source.or_no, 
						source.or_custpo, source.shoestyle_codefactory, source.cust_shoestyle, source.size_code, source.size_numcode,
						source.factory_code_orders, source.factory_name_orders, source.factory_code_produce, source.factory_name_produce, source.size_qty, 
						'Y', GETDATE(), CAST(GETDATE() AS DATE), 'A', 'A', 0
					);`)

				await dataSource
					.getRepository(FPInventoryEntity)
					.createQueryBuilder()
					.update()
					.set({ mo_no: commandNumber })
					.where({ epc: In(epcData.map((item) => item.epc)) })
					.execute()
			}

			// Commit the transaction
			await queryRunner.commitTransaction()
		} catch (error) {
			Logger.error(error)
			await queryRunner.rollbackTransaction()
			throw new Error(`Failed to upsert data: ${error.message}`)
		} finally {
			await queryRunner.release()
		}
	}
}
