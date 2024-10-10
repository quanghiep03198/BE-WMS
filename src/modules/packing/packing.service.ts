import { DATASOURCE_DATA_LAKE } from '@/databases/constants'
import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { UpdatePackingWeightDTO } from './dto/update-packing.dto'
import { PackingEntity } from './entities/packing.entity'

@Injectable()
export class PackingService {
	constructor(
		@InjectRepository(PackingEntity, DATASOURCE_DATA_LAKE)
		private readonly packingRepository: Repository<PackingEntity>
	) {}

	private extractSeriesNumber(seriesNumber: string) {
		return seriesNumber.slice(11, -1)
	}

	async getPackingWeightList({ page, limit }: PaginationParams) {
		const [data, totalDocs] = await this.packingRepository.findAndCount({
			take: limit,
			skip: (page - 1) * limit
		})
		const totalPages = Math.ceil(totalDocs / limit)
		if (page < 1 || page > totalPages) {
			throw new NotFoundException('Page not found')
		}
		const hasNextPage = totalPages > page
		const hasPrevPage = page > 1
		return { data, totalDocs, totalPages, hasNextPage, hasPrevPage, ...{ page, limit } }
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
