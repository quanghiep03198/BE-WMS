import { TenancyService } from '@/modules/tenancy/tenancy.service'
import { Injectable } from '@nestjs/common'
import { format } from 'date-fns'
import { IsNull, Like, MoreThanOrEqual } from 'typeorm'
import { PMInventoryEntity } from '../entities/pm-inventory.entity'
import { ProducingProcess } from './../constants/index'

@Injectable()
export class PMInventoryService {
	constructor(private readonly tenancyService: TenancyService) {}

	async fetchLastestDataByProcess(factoryCode: string, producingProcess: ProducingProcess) {
		return await this.tenancyService.dataSource.getRepository(PMInventoryEntity).find({
			select: ['epc', 'mo_no'],
			where: {
				rfid_status: IsNull(),
				record_time: MoreThanOrEqual(format(new Date(), 'yyyy-MM-dd')),
				station_no: Like(`${factoryCode}_${producingProcess}`)
			}
		})
	}
}
