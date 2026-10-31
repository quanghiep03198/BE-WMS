import { IDefectiveGoodsCacheRepository } from '@modules/defective-goods/application/ports/defective-goods-cache.port'
import { IDefectiveGoodsProps } from '@modules/defective-goods/domain/models/defective-goods.model'
import { Injectable } from '@nestjs/common'
import { InjectRedisClient } from '@redis/decorators'
import crypto from 'crypto'
import { Redis } from 'ioredis'

@Injectable()
export class DefectiveGoodsCacheRepository implements IDefectiveGoodsCacheRepository {
	constructor(@InjectRedisClient() private readonly redis: Redis) {}

	async setCount(filter: Partial<IDefectiveGoodsProps>, count: number) {
		const key = this.generateCacheKey(filter)
		await this.redis.set(`cached:total:defective_goods:${key}`, count, 'EX', 60)

		return count
	}

	async getCount(filter: Partial<IDefectiveGoodsProps>) {
		const key = this.generateCacheKey(filter)
		const count = await this.redis.get(`cached:total:defective_goods:${key}`)
		return count ? Number.parseInt(count, 10) : 0
	}

	async flushCount() {
		// const pattern = `cached:total:defective_goods:*`
		// let cursor = 0

		// do {
		// 	// Gọi lệnh SCAN của Redis v4
		// 	const reply = await this.redis.scan(cursor, {
		// 		MATCH: pattern,
		// 		COUNT: 100
		// 	})

		// 	cursor = reply.cursor
		// 	const keys = reply.keys

		// 	if (keys.length > 0) {
		// 		// Xóa async các key tìm được ở vòng quét này
		// 		await this.redis.unlink(keys)
		// 	}
		// } while (cursor !== 0) // Vòng lặp dừng lại khi cursor quay về 0

		return
	}

	private generateCacheKey(filter: Partial<IDefectiveGoodsProps>): string {
		// 1. Sắp xếp các key của Object để đảm bảo tính đồng nhất
		const sortedFilter = Object.keys(filter)
			.sort()
			.reduce((acc, key) => {
				acc[key] = filter[key]
				return acc
			}, {})

		// 2. Chuyển thành chuỗi
		const filterString = JSON.stringify(sortedFilter)

		// 3. Tạo mã MD5 hash làm Key cho Redis
		const hash = crypto.createHash('md5').update(filterString).digest('hex')

		return hash
	}
}
