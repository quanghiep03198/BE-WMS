import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { BaseAbstractService } from '../_base/base.abstract.service'
import { TruckloadDeliveryEntity } from './entities/truckload-delivery.entity'

@Injectable()
export class DeliveryService extends BaseAbstractService<TruckloadDeliveryEntity> {
	constructor(
		@InjectRepository(TruckloadDeliveryEntity, DATA_SOURCE_DATA_LAKE)
		private readonly deliveryRepository: Repository<TruckloadDeliveryEntity>
	) {
		super(deliveryRepository)
	}

	public override async insertMany(payload: Partial<TruckloadDeliveryEntity>[]) {
		const bucket = await this.deliveryRepository
			.createQueryBuilder()
			.select(/* SQL */ `MAX(bucket_id)`, 'lastBucketId')
			.getRawOne<{ lastBucketId: number | null }>()
		const nextBucketId = bucket?.lastBucketId ? bucket?.lastBucketId + 1 : 1
		const entities = payload.map((item) => this.deliveryRepository.create({ ...item, bucket_id: nextBucketId }))
		return await this.deliveryRepository.insert(entities)
	}
}
