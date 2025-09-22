import { CENTRAL_DATA_SOURCE } from '@/databases/constants'
import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { Brackets, DataSource } from 'typeorm'
import { UpdatePackingWeightDTO } from './dto/update-packing.dto'
import { PackingEntity } from './entities/packing.entity'

@Injectable()
export class PackingService {
	constructor(@Inject(CENTRAL_DATA_SOURCE) private readonly dataSource: DataSource) {}

	private extractSeriesNumber(seriesNumber: string) {
		return seriesNumber.slice(11, -1)
	}

	async getPackingWeightList(scanId?: string) {
		return await this.dataSource
			.getRepository(PackingEntity)
			.createQueryBuilder('p')
			.select('p.Scan_id', 'scan_id')
			.addSelect('p.Weight', 'weight')
			.where(
				new Brackets((qb) => {
					if (scanId) {
						return qb.where('series_number = :series_number', { series_number: this.extractSeriesNumber(scanId) })
					} else return qb
				})
			)
			.getRawMany()
	}

	async getOneByScanId(scanId: string) {
		const data = await this.dataSource
			.getRepository(PackingEntity)
			.findOneBy({ series_number: this.extractSeriesNumber(scanId) })
		if (!data) throw new NotFoundException('Packing item not found')
		return data
	}

	async updatePackingWeight(seriesNumber: string, payload: UpdatePackingWeightDTO) {
		return await this.dataSource
			.getRepository(PackingEntity)
			.update(
				{ series_number: this.extractSeriesNumber(seriesNumber) },
				{ actual_weight_in: payload.Actual_weight_in, weighing_time: new Date() }
			)
	}
}
