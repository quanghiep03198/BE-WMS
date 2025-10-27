import { ExcelColorPalette } from '@/common/constants/excel-color-palette'
import { AutoFitColumnOptions, autoFitColumns } from '@/common/helpers'
import { SuperJson } from '@/common/utils'
import { DATA_SOURCE_DATA_LAKE, RecordStatus } from '@/databases/constants'
import { BadGatewayException, ConflictException, Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Workbook } from 'exceljs'
import { omit } from 'lodash'
import { I18nContext, I18nService } from 'nestjs-i18n'
import { PinoLogger } from 'nestjs-pino'
import { And, Between, DataSource, FindOptionsWhere, In, IsNull, Not, Repository } from 'typeorm'
import { BaseAbstractService } from '../_base/base.abstract.service'
import { TENANCY_DATA_SOURCE } from '../tenancy/constants'
import { DeleteManyDefectiveGoodsDTO } from './dto/defective-goods.dto'
import { UpdateInboundStatusDTO, UpdateOutboundStatusDTO } from './dto/inoutbound.dto'
import { DefectiveGoodsEntity } from './entities/defective-goods.entity'
import { DefectiveGoodsInventory } from './types'

@Injectable()
export class DefectiveGoodsService extends BaseAbstractService<DefectiveGoodsEntity> {
	constructor(
		@InjectRepository(DefectiveGoodsEntity, DATA_SOURCE_DATA_LAKE)
		private readonly defectiveGoodRepository: Repository<DefectiveGoodsEntity>,
		@Inject(TENANCY_DATA_SOURCE) private readonly dataSourceTNC: DataSource,
		private readonly i18nService: I18nService,
		private readonly logger: PinoLogger
	) {
		super(defectiveGoodRepository)
	}

	public async checkActiveEpcsExist(epcs: string | string[]): Promise<boolean> {
		return await this.defectiveGoodRepository.existsBy({
			epc: In(Array.isArray(epcs) ? epcs : [epcs]),
			is_active: RecordStatus.ACTIVE
		})
	}

	public async retrieveSizeQty(epcList: string[]) {
		const data = await this.defectiveGoodRepository.find({
			select: ['factory_shoes_style', 'color_sn', 'size_code', 'epc'],
			where: { epc: In(epcList), is_active: RecordStatus.ACTIVE }
		})

		const groupedData = new Map<string, Map<string, number>>()

		data.forEach((item) => {
			const groupKey = `${item.factory_shoes_style}/${item.color_sn}`
			const sizeKey = item.size_code

			if (!groupedData.has(groupKey)) {
				groupedData.set(groupKey, new Map<string, number>())
			}

			const sizeMap = groupedData.get(groupKey)!
			sizeMap.set(sizeKey, (sizeMap.get(sizeKey) || 0) + 1)
		})

		return Array.from(groupedData.entries()).map(([group, sizes]) => {
			const [factory_shoes_style, color_sn] = group.split('/')
			return {
				factory_shoes_style,
				color_sn,
				sizes: Array.from(sizes.entries()).map(([size_code, qty]) => ({
					size_code,
					qty
				}))
			}
		})
	}

	public async updateInboundStatus(update: UpdateInboundStatusDTO) {
		return await this.defectiveGoodRepository.update(
			{ epc: In(update.epcs), is_active: RecordStatus.ACTIVE },
			omit(update, ['epcs'])
		)
	}

	public async updateOutboundStatus(update: UpdateOutboundStatusDTO) {
		const existsNotInbounded = await this.defectiveGoodRepository.existsBy({
			epc: In(update.epcs),
			is_active: RecordStatus.ACTIVE,
			storage_location: IsNull(),
			inbound_date: IsNull()
		})

		if (existsNotInbounded) throw new ConflictException(this.i18nService.t('inoutbound.notification.not_inbound_yet'))

		return await this.defectiveGoodRepository.update(
			{ epc: In(update.epcs) },
			{ ...omit(update, ['epcs']), is_active: RecordStatus.INACTIVE }
		)
	}

	public async deleteMany(payload: Partial<DeleteManyDefectiveGoodsDTO>) {
		const filterQuery: FindOptionsWhere<DefectiveGoodsEntity> = {
			...omit(payload, ['including_ids', 'excluding_ids', 'created']),
			...(payload.created && {
				created: Between(
					new Date(new Date(payload.created).setHours(0, 0, 0, 0)),
					new Date(new Date(payload.created).setHours(23, 59, 59, 999))
				)
			}),
			...(Array.isArray(payload.excluding_ids) &&
				payload.excluding_ids.length > 0 && { id: Not(In(payload.excluding_ids)) })
		}

		if (payload.including_ids === 'all') {
			return await this.defectiveGoodRepository.delete({ ...filterQuery })
		} else if (Array.isArray(payload.including_ids) && Array.isArray(payload.excluding_ids))
			return await this.defectiveGoodRepository.delete({
				...filterQuery,
				id: And(In(payload.including_ids), Not(In(payload.excluding_ids)))
			})
		else throw new BadGatewayException('Invalid request payload')
	}

	public async getDefectiveGoodsInventory(): Promise<DefectiveGoodsInventory[]> {
		const storageListCommonTableExpression = this.dataSourceTNC
			.createQueryBuilder()
			.select([
				/* SQL */ `STRING_AGG(storage_location, ',') WITHIN GROUP (ORDER BY storage_location ASC) AS storage_location`,
				'brand_name',
				'po',
				'mo_no',
				'factory_shoes_style',
				'color_sn',
				'defective_category'
			])
			.from(
				(qb) =>
					qb
						.subQuery()
						.distinct()
						.select([
							'storage_location',
							'brand_name',
							'po',
							'mo_no',
							'factory_shoes_style',
							'color_sn',
							'defective_category'
						])
						.from(DefectiveGoodsEntity, 'c')
						.where('isactive = :isActive', { isActive: RecordStatus.ACTIVE })
						.andWhere(/* SQL */ `storage_location IS NOT NULL`),
				'c'
			)
			.groupBy('brand_name')
			.addGroupBy('po')
			.addGroupBy('mo_no')
			.addGroupBy('factory_shoes_style')
			.addGroupBy('color_sn')
			.addGroupBy('defective_category')
			.getQuery()

		const queryBuilder = await this.dataSourceTNC
			.getRepository(DefectiveGoodsEntity)
			.createQueryBuilder('a')
			.addCommonTableExpression(storageListCommonTableExpression, 'storage_list_cte')
			.select('a.brand_name', 'brand_name')
			.addSelect('a.po', 'po')
			.addSelect('a.mo_no', 'mo_no')
			.addSelect('a.factory_shoes_style', 'factory_shoes_style')
			.addSelect('a.cust_shoes_style', 'cust_shoes_style')
			.addSelect('a.color_sn', 'color_sn')
			.addSelect('a.defective_category', 'defective_category')
			.addSelect('b.storage_location', 'storage_location')
			.addSelect(
				/* SQL */ `(
					SELECT aa.size_code AS size_numcode, COUNT(DISTINCT aa.epc) AS qty
					FROM DV_DATA_LAKE.dbo.dv_defective_goods aa
					WHERE aa.isactive = '${RecordStatus.ACTIVE}' 
						AND aa.brand_name = a.brand_name
						AND aa.factory_shoes_style = a.factory_shoes_style 
						AND aa.cust_shoes_style = a.cust_shoes_style 
						AND COALESCE(aa.po, 'Unknown') = COALESCE(a.po, 'Unknown') 
						AND COALESCE(aa.mo_no, 'Unknown') = COALESCE(a.mo_no, 'Unknown') 
						AND aa.color_sn = a.color_sn
						AND aa.defective_category = a.defective_category
					GROUP BY aa.size_code
					FOR JSON PATH
				)`,
				'size_data'
			)
			.leftJoin(
				(qb) => qb.subQuery().select('*').from('storage_list_cte', 'b'),
				'b',
				/* SQL */ `
					a.brand_name = b.brand_name 
					AND a.factory_shoes_style = b.factory_shoes_style 
					AND a.color_sn = b.color_sn 
					AND a.mo_no = b.mo_no 
					AND a.po = b.po
					AND a.defective_category = b.defective_category
				`
			)
			.where('a.isactive = :isActive', { isActive: RecordStatus.ACTIVE })
			.andWhere(/* SQL */ `a.storage_location IS NOT NULL AND LTRIM(RTRIM(a.storage_location)) <> ''`)
			.groupBy('a.brand_name')
			.addGroupBy('a.po')
			.addGroupBy('a.mo_no')
			.addGroupBy('a.factory_shoes_style')
			.addGroupBy('a.cust_shoes_style')
			.addGroupBy('a.color_sn')
			.addGroupBy('a.defective_category')
			.addGroupBy('b.storage_location')
			.setParameters({ isActive: RecordStatus.ACTIVE })
		this.logger.debug(queryBuilder.getSql())

		return await queryBuilder
			.getRawMany<{
				brand_name: string
				po: string
				mo_no: string
				factory_shoes_style: string
				cust_shoes_style: string
				storage_location: string
				color_sn: string
				size_data: string
			}>()
			.then((result) =>
				result.map((item) => ({
					...item,
					size_data: SuperJson.parse<Array<{ size_numcode: string; qty }>>(item.size_data, 1)
				}))
			)
	}

	public async exportDefectiveGoodsInventory(factoryCode: string) {
		const currentLanguage = I18nContext.current()?.lang
		const workbook = new Workbook()
		const worksheet = workbook.addWorksheet(this.i18nService.t(`factory.${factoryCode}`, { lang: currentLanguage }))
		worksheet.columns = [
			{
				header: this.i18nService.t('erp.fields.brand_name', { lang: currentLanguage }),
				key: 'brand_name'
			},
			{
				header: this.i18nService.t('erp.fields.po', { lang: currentLanguage }),
				key: 'po'
			},
			{
				header: this.i18nService.t('erp.fields.mo_no', { lang: currentLanguage }),
				key: 'mo_no'
			},
			{
				header: this.i18nService.t('erp.fields.cust_shoes_style', { lang: currentLanguage }),
				key: 'cust_shoes_style'
			},
			{
				header: this.i18nService.t('erp.fields.shoestyle_codefactory', { lang: currentLanguage }),
				key: 'factory_shoes_style'
			},
			{
				header: this.i18nService.t('erp.fields.color_sn', { lang: currentLanguage }),
				key: 'color_sn'
			},
			{
				header: this.i18nService.t('erp.fields.category', { lang: currentLanguage }),
				key: 'defective_category'
			},
			{
				header: this.i18nService.t('warehouse.fields.storage_name', { lang: currentLanguage }),
				key: 'storage_location'
			}
		].map((item) => ({ ...item, alignment: { vertical: 'middle', horizontal: 'center' } }))
		const data = await this.getDefectiveGoodsInventory()

		for (const record of data) {
			const row = worksheet.addRow({
				...record,
				factory_code: this.i18nService.t(`factory.${factoryCode}`, { lang: currentLanguage })
			})
			row.height = 20
			row.alignment = { vertical: 'middle', horizontal: 'center' }
			for (let i = 1; i <= worksheet.columns.length; i++) {
				row.getCell(i).fill = {
					type: 'pattern',
					pattern: 'solid',
					fgColor: { argb: ExcelColorPalette.BG_LIGHT_BLUE }
				}
			}
			for (const subRecord of record.size_data) {
				const row = worksheet.addRow([])
				row.alignment = { vertical: 'middle', horizontal: 'center' }
				row.getCell(2).value = subRecord.size_numcode + '#'
				row.getCell(2).fill = {
					type: 'pattern',
					pattern: 'solid',
					fgColor: { argb: ExcelColorPalette.BG_LIGHT_YELLOW }
				}
				row.getCell(3).value = subRecord.qty
				row.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f2dcdb' } }
			}
		}

		// * Auto fit columns
		autoFitColumns.call(worksheet, {
			minWidth: 20,
			excludeColumns: []
		} satisfies AutoFitColumnOptions)

		// * Add title
		worksheet.insertRow(1, null)
		worksheet.getRow(1).font = { bold: true, size: 14 }
		worksheet.getRow(1).height = 30
		worksheet.getRow(2).font = { bold: true }
		worksheet.getRow(2).height = 30
		worksheet.mergeCells('A1:H1')
		worksheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' }
		worksheet.getCell('A1').fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: ExcelColorPalette.BG_LIGHT_NEUTRAL }
		}
		worksheet.getCell('A1').font = { bold: true, size: 16 }
		worksheet.getCell('A1').value = this.i18nService.t('defective-goods.defective_goods_inventory_report', {
			lang: currentLanguage
		})

		// * Freeze header row
		worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }]

		// * Cell styles
		worksheet.eachRow({ includeEmpty: false }, (row) => {
			row.alignment = { vertical: 'middle', horizontal: 'center' }
			row.eachCell({ includeEmpty: true }, (cell) => {
				cell.font = { ...cell.font, name: 'Calibri', family: 1 }
				cell.border = {
					top: { style: 'thin', color: { argb: ExcelColorPalette.BORDER } },
					left: { style: 'thin', color: { argb: ExcelColorPalette.BORDER } },
					bottom: { style: 'thin', color: { argb: ExcelColorPalette.BORDER } },
					right: { style: 'thin', color: { argb: ExcelColorPalette.BORDER } }
				}
			})
		})
		return await workbook.xlsx.writeBuffer()
	}
}
