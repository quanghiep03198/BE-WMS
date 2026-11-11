import { Injectable } from '@nestjs/common'
import type { ManifestListDto } from './manifest-filter.dto'
import { ManifestRepository } from './manifest.repository'

@Injectable()
export class ManifestService {
	constructor(private readonly repository: ManifestRepository) {}

	async getList(factoryCode: string, filter: ManifestListDto) {
		const total = await this.repository.count(factoryCode, filter)
		const rows = await this.repository.page(factoryCode, filter)
		const items = rows.map(({ cursor_id, ...row }) => {
			if (!Number.isInteger(cursor_id)) throw new Error('Manifest row has an invalid cursor')
			return row
		})
		return { items, total, page: filter.page, pageSize: filter.pageSize }
	}
}
