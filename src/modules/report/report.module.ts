import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { FPInventoryEntity } from '../rfid/entities/fp-inventory.entity'
import { RFIDMatchCustomerEntity } from '../rfid/entities/rfid-customer-match.entity'
import { TenacyMiddleware } from '../tenancy/tenancy.middleware'
import { TenancyModule } from './../tenancy/tenancy.module'
import { ReportController } from './report.controller'
import { InboundReportService } from './services/inbound-report.service'
import { InventoryReportService } from './services/inventory-report.service'
import { OutboundReportService } from './services/outbound-report.service'
import { PackingWeightReportService } from './services/packing-weight-report.service'

@Module({
	imports: [
		TenancyModule,
		TypeOrmModule.forFeature([FPInventoryEntity, RFIDMatchCustomerEntity], DATA_SOURCE_DATA_LAKE)
	],
	controllers: [ReportController],
	providers: [InboundReportService, OutboundReportService, InventoryReportService, PackingWeightReportService]
})
export class ReportModule {
	configure(consumer: MiddlewareConsumer) {
		consumer.apply(TenacyMiddleware).forRoutes({ path: '/report*', method: RequestMethod.ALL })
	}
}
