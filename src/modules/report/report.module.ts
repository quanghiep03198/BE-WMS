import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { MiddlewareConsumer, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { FPInventoryEntity } from '../rfid/entities/fp-inventory.entity'
import { RFIDMatchCustomerEntity } from '../rfid/entities/rfid-customer-match.entity'
import { TenacyMiddleware } from '../tenancy/tenancy.middleware'
import { TenancyModule } from './../tenancy/tenancy.module'
import { ReportController } from './report.controller'
import { ReportService } from './report.service'

@Module({
	imports: [
		TenancyModule,
		TypeOrmModule.forFeature([FPInventoryEntity, RFIDMatchCustomerEntity], DATA_SOURCE_DATA_LAKE)
	],
	controllers: [ReportController],
	providers: [ReportService]
})
export class ReportModule {
	configure(consumer: MiddlewareConsumer) {
		consumer.apply(TenacyMiddleware).forRoutes('/report/daily-inbound-report')
	}
}
