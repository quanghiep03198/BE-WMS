import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Brackets, Repository } from 'typeorm'
import { UpdatePackingWeightDTO } from './dto/update-packing.dto'
import { PackingEntity } from './entities/packing.entity'

@Injectable()
export class PackingService {
	constructor(
		@InjectRepository(PackingEntity, DATA_SOURCE_DATA_LAKE)
		private readonly packingRepository: Repository<PackingEntity>
	) {}

	private extractSeriesNumber(seriesNumber: string) {
		return seriesNumber.slice(11, -1)
	}

	async getPackingWeightList(scanId?: string) {
		return await this.packingRepository
			.createQueryBuilder('p')
			.select('p.Scan_id', 'scan_id')
			.addSelect('p.Weight', 'weight')
			.where(
				new Brackets((qb) => {
					if (scanId) {
						return qb.where('series_number = :scanId', { scanId: this.extractSeriesNumber(scanId) })
					} else return qb
				})
			)
			.getRawMany()
	}

	async getOneByScanId(scanId: string) {
		const data = await this.packingRepository.findOneBy({ series_number: this.extractSeriesNumber(scanId) })
		if (!data) throw new NotFoundException('Packing item not found')
		return data
	}

	async updatePackingWeight(seriesNumber: string, payload: UpdatePackingWeightDTO) {
		const actualSeriesNumber = this.extractSeriesNumber(seriesNumber)
		const packingItemToUpdate = await this.packingRepository.findOneBy({ series_number: seriesNumber })
		if (!packingItemToUpdate) throw new NotFoundException('Packing item not found')
		return await this.packingRepository.update({ series_number: actualSeriesNumber }, payload)
	}
}
