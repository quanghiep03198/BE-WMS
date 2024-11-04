import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { PackingEntity } from './entities/packing.entity'
import { PackingController } from './packing.controller'
import { PackingService } from './packing.service'

@Module({
	imports: [TypeOrmModule.forFeature([PackingEntity], DATA_SOURCE_DATA_LAKE)],
	controllers: [PackingController],
	providers: [PackingService]
})
export class PackingModule {}
