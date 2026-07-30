import { FinishedGoodsModule } from '@modules/finished-goods/finished-goods.module'
import { MiddlewareConsumer, Module } from '@nestjs/common'
import { TenacyMiddleware } from '../tenancy/tenancy.middleware'
import { TenancyModule } from './../tenancy/tenancy.module'
import { ReportController } from './report.controller'
import { InboundReportService } from './services/inbound-report.service'
import { OutboundReportService } from './services/outbound-report.service'
import { PackingWeightReportService } from './services/packing-weight-report.service'

@Module({
	imports: [TenancyModule, FinishedGoodsModule],
	controllers: [ReportController],
	providers: [InboundReportService, OutboundReportService, PackingWeightReportService]
})
export class ReportModule {
	configure(consumer: MiddlewareConsumer) {
		consumer.apply(TenacyMiddleware).forRoutes(ReportController)
	}
}
