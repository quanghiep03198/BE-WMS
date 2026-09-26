import { FinishedGoodsModule } from '@modules/finished-goods/finished-goods.module'
import { OrderModule } from '@modules/order/order.module'
import { Module } from '@nestjs/common'
import { ReportController } from './report.controller'
import { InboundReportService } from './services/inbound-report.service'
import { OutboundReportService } from './services/outbound-report.service'
import { PackingWeightReportService } from './services/packing-weight-report.service'

@Module({
	imports: [FinishedGoodsModule, OrderModule],
	controllers: [ReportController],
	providers: [InboundReportService, OutboundReportService, PackingWeightReportService]
})
export class ReportModule {}
