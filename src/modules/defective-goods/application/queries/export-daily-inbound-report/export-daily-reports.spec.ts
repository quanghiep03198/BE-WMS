import { DefectiveGoodsOutboundPurpose, DefectiveGoodsSource } from '@modules/defective-goods/domain/constants'
import { Workbook } from 'exceljs'
import { Types } from 'mongoose'
import { I18nContext } from 'nestjs-i18n'
import { ExportDailyOutboundReportHandler } from '../export-daily-outbound-report/export-daily-outbound-report.handler'
import { ExportDailyOutboundReportQuery } from '../export-daily-outbound-report/export-daily-outbound-report.query'
import { ExportDailyInboundReportHandler } from './export-daily-inbound-report.handler'
import { ExportDailyInboundReportQuery } from './export-daily-inbound-report.query'

describe('daily defective goods report exports', () => {
	const date = new Date(2026, 0, 5)
	const common = {
		brand_name: 'BRAND',
		mo_no: 'MO',
		cust_shoes_style: 'CUSTOMER',
		factory_shoes_style: 'FACTORY',
		color_sn: 'BLACK',
		defective_category: 'B',
		shoe_source: DefectiveGoodsSource.FINAL_INSPECTION,
		sewing_line: { _id: new Types.ObjectId(), name: { vi: 'May 1', en: 'Sewing 1' } },
		assembly_line: { _id: new Types.ObjectId(), name: { vi: 'Thanh hinh 1', en: 'Assembly 1' } },
		size_ledger: [{ size_numcode: '40', qty: 2 }],
		total_qty: 2
	}
	const inbound = { ...common, po: 'INBOUND-PO', storage_location: 'A1' }
	const outbound = { ...common, po: 'OUTBOUND-PO', outbound_purpose: DefectiveGoodsOutboundPurpose.LAB }
	const repository = {
		getDailyInboundReport: async () => [inbound],
		getDailyOutboundReport: async () => [outbound]
	}
	const i18n = {
		t: (key: string, options?: { args?: { date?: string } }) =>
			options?.args?.date ?? (key === 'factory.TEST' ? 'Factory' : key)
	}
	const config = { get: () => 'TEST' }

	beforeEach(() => {
		const context: I18nContext = Reflect.construct(I18nContext, ['vi', i18n, {}])
		jest.spyOn(I18nContext, 'current').mockReturnValue(context)
	})

	afterEach(() => jest.restoreAllMocks())

	it('exports localized department names and the inbound quantity', async () => {
		const handler: ExportDailyInboundReportHandler = Reflect.construct(ExportDailyInboundReportHandler, [
			repository,
			config,
			i18n
		])
		const workbook = new Workbook()
		await workbook.xlsx.load(await handler.execute(new ExportDailyInboundReportQuery(date)))
		const sheet = workbook.worksheets[0]
		expect(sheet.getCell('B3').value).toBe('INBOUND-PO')
		expect(sheet.getCell('G3').value).toBe('May 1')
		expect(sheet.getCell('H3').value).toBe('Thanh hinh 1')
		expect(sheet.getCell('K3').value).toBe(2)
	})

	it('exports outbound data, localized departments, purpose and quantity', async () => {
		const handler: ExportDailyOutboundReportHandler = Reflect.construct(ExportDailyOutboundReportHandler, [
			repository,
			i18n,
			config
		])
		const workbook = new Workbook()
		await workbook.xlsx.load(await handler.execute(new ExportDailyOutboundReportQuery(date)))
		const sheet = workbook.worksheets[0]
		expect(sheet.getCell('B3').value).toBe('OUTBOUND-PO')
		expect(sheet.getCell('G3').value).toBe('May 1')
		expect(sheet.getCell('H3').value).toBe('Thanh hinh 1')
		expect(sheet.getCell('J3').value).toBe('inoutbound.outbound_purpose.LAB')
		expect(sheet.getCell('K3').value).toBe(2)
	})

	it.each(['inbound', 'outbound'] as const)('uses the UTC report date in the %s title', async (type) => {
		const date = new Date('2026-01-05T00:00:00.000Z')
		const workbook = new Workbook()
		if (type === 'inbound') {
			const handler: ExportDailyInboundReportHandler = Reflect.construct(ExportDailyInboundReportHandler, [
				repository,
				config,
				i18n
			])
			await workbook.xlsx.load(await handler.execute(new ExportDailyInboundReportQuery(date)))
		} else {
			const handler: ExportDailyOutboundReportHandler = Reflect.construct(ExportDailyOutboundReportHandler, [
				repository,
				i18n,
				config
			])
			await workbook.xlsx.load(await handler.execute(new ExportDailyOutboundReportQuery(date)))
		}
		expect(workbook.worksheets[0].getCell('A1').value).toBe('2026-01-05')
		expect(workbook.worksheets[0].name).toBe('Factory - 2026-01-05')
	})
})
