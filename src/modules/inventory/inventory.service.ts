import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { readFileSync } from 'fs'
import { join } from 'path'
import { DataSource, IsNull, Not } from 'typeorm'
import { FALLBACK_VALUE } from '../rfid/constants'
import { FPInventoryEntity } from '../rfid/entities/fp-inventory.entity'
import { TenancyService } from '../tenancy/tenancy.service'
import { SearchInventoryQueryDTO } from './dto/inventory.dto'

@Injectable()
export class InventoryService {
	constructor(
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly datasource: DataSource,
		private readonly tenancyService: TenancyService
	) {}

	async findByMonth(searchTerms: SearchInventoryQueryDTO) {
		const query = readFileSync(join(__dirname, './sql/rfid-inventory.sql'), 'utf-8').toString()
		return await this.datasource.query(query, [
			searchTerms['factory_code.eq'],
			searchTerms['month.eq'],
			searchTerms['custbrand_id.eq']
		])
	}

	async getDailyInboundReport() {
		return await this.tenancyService.dataSource
			.getRepository(FPInventoryEntity)
			.createQueryBuilder('inv')
			.select(/* SQL */ `COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue) AS [mo_no]`)
			.addSelect(/* SQL */ `COUNT(DISTINCT inv.EPC_Code) AS [count]`)
			.addSelect(/* SQL */ `CASE WHEN COUNT(mo_no_actual) > 0 THEN 1 ELSE 0 END AS [is_exchanged]`)
			.where({ rfid_status: Not(IsNull()) })
			.groupBy(/* SQL */ `COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue)`)
			.setParameters({ fallbackValue: FALLBACK_VALUE })
			.getRawMany()
			.then((data) => data.map((item) => ({ ...item, is_exchanged: Boolean(item.is_exchanged) })))
	}
}
