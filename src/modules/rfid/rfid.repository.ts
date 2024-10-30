import { Injectable } from '@nestjs/common'
import { format } from 'date-fns'
import { IsNull, Like, MoreThanOrEqual, Not } from 'typeorm'
import { TenancyService } from '../tenancy/tenancy.service'
import { EXCLUDED_EPC_PATTERN, EXCLUDED_ORDERS, FALLBACK_VALUE, INTERNAL_EPC_PATTERN } from './constants'
import { ExchangeEpcDTO } from './dto/rfid.dto'
import { RFIDCustomerEntity } from './entities/rfid-customer.entity'
import { RFIDInventoryEntity } from './entities/rfid-inventory.entity'

@Injectable()
export class RFIDRepository {
	constructor(private readonly tenancyService: TenancyService) {}

	/**
	 * @description Check if there is any invalid EPC exist
	 */
	async checkInvalidEpcExist() {
		return await this.tenancyService.dataSource.getRepository(RFIDInventoryEntity).existsBy({
			epc: Like(INTERNAL_EPC_PATTERN),
			record_time: MoreThanOrEqual(format(new Date(), 'yyyy-MM-dd')),
			rfid_status: IsNull()
		})
	}

	/**
	 * @description Get manufacturing order sizes
	 */
	async getOrderSizes() {
		return await this.tenancyService.dataSource
			.getRepository(RFIDInventoryEntity)
			.createQueryBuilder('inv')
			.select([
				/* SQL */ `COALESCE(inv.mo_no_actual, inv.mo_no, cust.mo_no_actual, cust.mo_no, :fallbackValue) AS mo_no`,
				/* SQL */ `COALESCE(cust.mat_code, :fallbackValue) AS mat_code`,
				/* SQL */ `COALESCE(cust.shoestyle_codefactory, :fallbackValue) AS shoes_style_code_factory`,
				/* SQL */ `ISNULL(cust.size_numcode, :fallbackValue) AS size_numcode`,
				/* SQL */ `COUNT(DISTINCT inv.EPC_Code) AS count`
			])
			.leftJoin(
				RFIDCustomerEntity,
				'cust',
				/* SQL */ `inv.EPC_Code = cust.EPC_Code AND COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue) = COALESCE(cust.mo_no_actual, cust.mo_no, :fallbackValue)`
			)
			.where(/* SQL */ `inv.EPC_Code NOT LIKE :excludedEpcPattern`)
			.andWhere(/* SQL */ `inv.EPC_Code NOT LIKE :internalEpcPattern`)
			.andWhere(/* SQL */ `inv.rfid_status IS NULL`)
			.andWhere(/* SQL */ `COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue) NOT IN (:...excludedOrders)`)
			.andWhere(/* SQL */ `COALESCE(cust.mo_no_actual, cust.mo_no, :fallbackValue) NOT IN (:...excludedOrders)`)
			.groupBy(
				/* SQL */ `COALESCE(inv.mo_no_actual, inv.mo_no, cust.mo_no_actual, cust.mo_no, :fallbackValue), COALESCE(cust.mat_code, :fallbackValue), COALESCE(cust.shoestyle_codefactory, :fallbackValue), ISNULL(cust.size_numcode, :fallbackValue)`
			)
			.orderBy('mat_code', 'ASC')
			.addOrderBy('size_numcode', 'ASC')
			.setParameters({
				excludedEpcPattern: EXCLUDED_EPC_PATTERN,
				internalEpcPattern: INTERNAL_EPC_PATTERN,
				fallbackValue: FALLBACK_VALUE,
				excludedOrders: EXCLUDED_ORDERS
			})
			.getRawMany()
	}

	/**
	 * @description Get manufacturing order quantity
	 */
	async getOrderQuantity() {
		return await this.tenancyService.dataSource
			.getRepository(RFIDInventoryEntity)
			.createQueryBuilder('inv')
			.select(/* SQL */ `COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue)`, 'mo_no')
			.addSelect(/* SQL */ `COUNT(DISTINCT inv.epc)`, 'count')
			.where(/* SQL */ `inv.epc NOT LIKE :excludedEpcPattern`)
			.andWhere(/* SQL */ `COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue) NOT IN (:...excludedOrders)`)
			.andWhere(/* SQL */ `inv.rfid_status IS NULL`)
			.groupBy(/* SQL */ `COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue)`)
			.orderBy('count', 'DESC')
			.setParameters({
				fallbackValue: FALLBACK_VALUE,
				excludedEpcPattern: EXCLUDED_EPC_PATTERN,
				excludedOrders: EXCLUDED_ORDERS
			})
			.getRawMany()
	}

	/**
	 * @description Get all exchangable EPC
	 */
	async getAllExchangableEpc(payload: Pick<ExchangeEpcDTO, 'mo_no' | 'mo_no_actual' | 'quantity'>) {
		const { mo_no, mo_no_actual } = payload
		if (mo_no === FALLBACK_VALUE)
			return await this.tenancyService.dataSource
				.getRepository(RFIDInventoryEntity)
				.createQueryBuilder('inv')
				.select('inv.epc', 'epc')
				.where({ mo_no: IsNull() })
				.andWhere({ mo_no_actual: IsNull() })
				.andWhere({ epc: Not(Like(INTERNAL_EPC_PATTERN)) })
				.andWhere({ rfid_status: IsNull() })
				.andWhere({ record_time: MoreThanOrEqual(format(new Date(), 'yyyy-MM-dd')) })
				.limit(payload.quantity)
				.getRawMany()

		const subQuery = this.tenancyService.dataSource
			.getRepository(RFIDCustomerEntity)
			.createQueryBuilder('cust1')
			.select('cust1.EPC_Code')
			.innerJoin(RFIDCustomerEntity, 'cust2', 'cust1.mat_code = cust2.mat_code AND cust1.mo_no <> cust2.mo_no')
			.where('COALESCE(cust1.mo_no_actual, cust1.mo_no) IN (:...ordersToExchange)', {
				ordersToExchange: mo_no.split(',').map((m) => m.trim())
			})

		const queryBuilder = this.tenancyService.dataSource
			.getRepository(RFIDInventoryEntity)
			.createQueryBuilder('inv')
			.select('inv.EPC_Code', 'epc')
			.where(`inv.EPC_Code IN (${subQuery.getQuery()})`)
			.andWhere('inv.EPC_Code NOT LIKE :internalEpcPattern', { internalEpcPattern: INTERNAL_EPC_PATTERN })
			.andWhere('inv.mo_no <> :mo_no_actual', { mo_no_actual })
			.setParameters(subQuery.getParameters())

		const result = await queryBuilder.getRawMany()
		return result
	}

	/**
	 * @description Get exchangable EPC by size
	 */
	async getExchangableEpcBySize(payload: ExchangeEpcDTO) {
		return await this.tenancyService.dataSource
			.getRepository(RFIDInventoryEntity)
			.createQueryBuilder('inv')
			.select(/* SQL */ `cust.epc`, 'epc')
			.innerJoin(
				RFIDCustomerEntity,
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
}
