import { Injectable } from '@nestjs/common'
import type { ManifestListDto } from '../dto/manifest-filter.dto'
import { ManifestRepository } from '../repositories/manifest.repository'

@Injectable()
export class ManifestService {
	constructor(private readonly repository: ManifestRepository) {}

	async getList(factoryCode: string, filter: ManifestListDto) {
		const [totalDocs, rows] = await Promise.all([
			this.repository.count(factoryCode, filter),
			this.repository.page(factoryCode, filter)
		])
		const data = rows.map(({ cursor_id, ...row }) => {
			if (!Number.isInteger(cursor_id)) throw new Error('Manifest row has an invalid cursor')
			return row
		})
		const page = filter.page
		const limit = filter.pageSize
		const totalPages = Math.ceil(totalDocs / limit)
		return {
			data,
			totalDocs,
			totalPages,
			hasNextPage: page < totalPages,
			hasPrevPage: page > 1,
			nextPage: page < totalPages ? page + 1 : null,
			prevPage: page > 1 ? page - 1 : null,
			page,
			limit
		} satisfies Pagination<(typeof data)[number]>
	}
}
