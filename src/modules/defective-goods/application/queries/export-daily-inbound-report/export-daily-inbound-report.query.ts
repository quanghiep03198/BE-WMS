import { Query } from '@nestjs/cqrs'
import { Buffer } from 'exceljs'

export class ExportDailyInboundReportQuery extends Query<Buffer> {
	constructor(public readonly date: Date) {
		super()
	}
}
