import { Injectable } from '@nestjs/common'
import { format } from 'date-fns'
import { Workbook } from 'exceljs'
import { readFileSync } from 'fs'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { join } from 'path'
import { EXCLUDED_EPC_PATTERN, EXCLUDED_ORDERS, FALLBACK_VALUE } from '../rfid/constants'
import { FPInventoryEntity } from '../rfid/entities/fp-inventory.entity'
import { RFIDMatchCustomerEntity } from '../rfid/entities/rfid-customer-match.entity'
import { TenancyService } from '../tenancy/tenancy.service'

@Injectable()
export class ReportService {
	constructor(
		private readonly tenancyService: TenancyService,
		private readonly i18nService: I18nService
	) {}

	async getInboundReportByDate(date: string) {
		const queryRunner = this.tenancyService.dataSource.createQueryRunner()
		await queryRunner.connect()
		const query = readFileSync(join(__dirname, './sql/inbound-report.sql'), 'utf-8').toString()
		return await queryRunner.manager.query(query, [date])
	}

	async getDailyInboundReport() {
		return await this.tenancyService.dataSource
			.getRepository(FPInventoryEntity)
			.createQueryBuilder('inv')
			.select(/* SQL */ `DISTINCT COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue) AS mo_no`)
			.addSelect(/* SQL */ `COUNT(DISTINCT inv.EPC_Code) AS count`)
			.addSelect(/* SQL */ `CASE WHEN COUNT(inv.mo_no_actual) > 0 THEN 1 ELSE 0 END AS is_exchanged`)
			.leftJoin(
				RFIDMatchCustomerEntity,
				'match',
				/* SQL */ `inv.EPC_Code = match.EPC_Code 
				AND COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue) = COALESCE(match.mo_no_actual, match.mo_no, :fallbackValue)`
			)
			.where(/* SQL */ `inv.rfid_status IS NOT NULL`)
			.andWhere(/* SQL */ `inv.record_time >= CAST(GETDATE() AS DATE)`)
			.andWhere(/* SQL */ `inv.EPC_Code NOT LIKE :excludedEpcPattern`)
			.andWhere(/* SQL */ `match.ri_cancel = 0`)
			.andWhere(/* SQL */ `COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue) NOT IN (:...excludedOrders)`)
			.groupBy(/* SQL */ `COALESCE(inv.mo_no_actual, inv.mo_no, :fallbackValue)`)
			.setParameters({
				fallbackValue: FALLBACK_VALUE,
				excludedOrders: EXCLUDED_ORDERS,
				excludedEpcPattern: EXCLUDED_EPC_PATTERN
			})
			.getRawMany()
			.then((data) => data.map((item) => ({ ...item, is_exchanged: Boolean(item.is_exchanged) })))
	}

	async exportReportToExcel(date: string) {
		const data = await this.getInboundReportByDate(date)
		const workbook = new Workbook()
		const worksheet = workbook.addWorksheet(`Report ${format(new Date(), 'yyyy-MM-dd')}`)

		const currentLanguage = I18nContext.current()?.lang

		worksheet.columns = [
			{
				header: this.i18nService.t('erp.fields.mo_no', { lang: currentLanguage }),
				key: 'mo_no'
			},
			{
				header: this.i18nService.t('erp.fields.mat_code', { lang: currentLanguage }),
				key: 'mat_code'
			},
			{
				header: this.i18nService.t('erp.fields.shoestyle_codefactory', { lang: currentLanguage }),
				key: 'shoes_style_code_factory'
			},
			{
				header: this.i18nService.t('erp.fields.shaping_dept_name', { lang: currentLanguage }),
				key: 'shaping_dept_name'
			},
			{
				header: this.i18nService.t('erp.fields.order_qty', { lang: currentLanguage }),
				key: 'order_qty'
			},
			{
				header: this.i18nService.t('erp.fields.inbound_qty', { lang: currentLanguage }),
				key: 'inbound_qty'
			},
			{
				header: this.i18nService.t('erp.fields.inbound_date', { lang: currentLanguage }),
				key: 'inbound_date'
			}
		]
		data.forEach((record) => {
			worksheet.addRow(record)
		})
		worksheet.columns.forEach((sheetColumn) => {
			sheetColumn.font = {
				size: 12
			}
			sheetColumn.width = 30
		})
		worksheet.getRow(1).font = {
			bold: true,
			size: 13
		}
		worksheet.getRow(1).height = 20

		// * Add title
		worksheet.insertRow(1, null)
		worksheet.getRow(1).height = 28
		worksheet.mergeCells('A1:G1')
		worksheet.getCell('A1').value = `Inbound Report - ${format(new Date(), 'yyyy/MM/dd')}`
		worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'left' }
		worksheet.getCell('A1').fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: 'e5e5e5' }
		}
		worksheet.getCell('A1').font = {
			bold: true,
			size: 16
		}
		worksheet.eachRow({ includeEmpty: false }, (row) => {
			row.eachCell({ includeEmpty: true }, (cell) => {
				cell.border = {
					top: { style: 'thin' },
					left: { style: 'thin' },
					bottom: { style: 'thin' },
					right: { style: 'thin' }
				}
			})
		})
		return await workbook.xlsx.writeBuffer()
	}
}
