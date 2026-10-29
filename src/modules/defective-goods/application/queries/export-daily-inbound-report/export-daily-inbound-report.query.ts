export class ExportDailyInboundReportQuery {
	constructor(
		public readonly date: string,
		public readonly factoryCode: string
	) {}
}
