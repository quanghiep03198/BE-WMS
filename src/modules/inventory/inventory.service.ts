import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { readFileSync } from 'fs'
import { join } from 'path'
import { DataSource } from 'typeorm'
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
}
