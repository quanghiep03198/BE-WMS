import { DATA_SOURCE_DATA_LAKE_CENTRAL } from '@databases/constants'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { PackingEntity } from './entities/packing.entity'
import { PackingController } from './packing.controller'
import { PackingService } from './packing.service'
import { PackingEntitySubscriber } from './subscribers/packing.entity.subscriber'

@Module({
	imports: [TypeOrmModule.forFeature([PackingEntity], DATA_SOURCE_DATA_LAKE_CENTRAL)],
	controllers: [PackingController],
	providers: [PackingService, PackingEntitySubscriber]
})
export class PackingModule {}
