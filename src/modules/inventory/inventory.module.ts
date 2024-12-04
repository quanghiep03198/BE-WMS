import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { FPInventoryEntity } from '../rfid/entities/fp-inventory.entity'
import { TenacyMiddleware } from '../tenancy/tenancy.middleware'
import { TenancyModule } from '../tenancy/tenancy.module'
import { InventoryController } from './inventory.controller'
import { InventoryService } from './inventory.service'

@Module({
	imports: [TenancyModule, TypeOrmModule.forFeature([FPInventoryEntity], DATA_SOURCE_DATA_LAKE)],
	controllers: [InventoryController],
	providers: [InventoryService]
})
export class InventoryModule implements NestModule {
	configure(consumer: MiddlewareConsumer) {
		consumer.apply(TenacyMiddleware).forRoutes('/inventory/*')
	}
}
