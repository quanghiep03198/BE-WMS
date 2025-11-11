import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { BaseAbstractService } from '../_base/base.abstract.service'
import { TruckloadDeliveryEntity } from './entities/truckload-delivery.entity'

@Injectable()
export class DeliveryService extends BaseAbstractService<TruckloadDeliveryEntity> {
	constructor(@InjectRepository(TruckloadDeliveryEntity, DATA_SOURCE_DATA_LAKE) private readonly deliveryRepository) {
		super(deliveryRepository)
	}
}
