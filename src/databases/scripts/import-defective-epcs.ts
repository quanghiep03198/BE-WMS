import { DefectiveCategory, DefectiveGoodsUnit, DefectiveLocation } from '@modules/defective-goods/domain/constants'
import { DefectiveGoodsDocument } from '@modules/defective-goods/infrastructure/persistence/mongodb/schemas/defective-goods.schema'
import { SizeNumber } from '@modules/finished-goods/domain/value-objects/size-number.vo'
import { UserDocument } from '@modules/user/infrastructure/persistence/mongodb/schemas/user.schema'
import ExcelJS from 'exceljs'
import omit from 'lodash/omit'
import { NVarChar } from 'mssql'
import path from 'path'
import { EPCGenerator } from '../../modules/defective-goods/application/helpers/epc-generator'
import { MongoManager } from './libs/mongoose'
import { MssqlManager } from './libs/mssql'
import { Logger } from './utils/logger'

type BGradeInventory = {
	po: string
	mo_no: string
	brand_name: string
	cust_shoes_style: string
	factory_shoes_style: string
	color_sn: string
	defective_category: string
	storage_location: string
	sizes: { size_code: string; quantity: number }[]
}

const KEY_COLUMNS = [
	'po',
	'mo_no',
	'brand_name',
	'cust_shoes_style',
	'factory_shoes_style',
	'color_sn',
	'defective_category',
	'storage_location'
] as const

async function readBGradeInventory(
	filePath = path.join(__dirname, 'b-grade-inventory.xlsx')
): Promise<BGradeInventory[]> {
	const workbook = new ExcelJS.Workbook()
	await workbook.xlsx.readFile(filePath)
	const sheet = workbook.worksheets[0]

	const headers = new Map<number, string>()
	sheet.getRow(1).eachCell((cell, col) => headers.set(col, String(cell.value ?? '').trim()))

	const groups = new Map<string, BGradeInventory>()
	sheet.eachRow((row, rowNumber) => {
		if (rowNumber === 1) return
		const record: Record<string, string> = {}
		const sizes: { size_code: string; quantity: number }[] = []

		headers.forEach((header, col) => {
			const value = row.getCell(col).value
			if (header.includes('#')) {
				const quantity = Number(value)
				if (value !== null && value !== '' && quantity > 0)
					sizes.push({ size_code: header.replace('#', '').trim(), quantity })
			} else if ((KEY_COLUMNS as readonly string[]).includes(header)) {
				record[header] = String(value ?? '').trim()
			}
		})

		const key = KEY_COLUMNS.map((k) => record[k]).join('|')
		const group = groups.get(key) ?? ({ ...record, sizes: [] } as unknown as BGradeInventory)
		for (const size of sizes) {
			const existing = group.sizes.find((s) => s.size_code === size.size_code)
			if (existing) existing.quantity += size.quantity
			else group.sizes.push(size)
		}
		groups.set(key, group)
	})
	return [...groups.values()]
}

async function execute() {
	const logger = new Logger()
	const mssqlManager = new MssqlManager('10.30.0.18')
	const mongoManager = new MongoManager()

	try {
		await mssqlManager.connect()
		await mongoManager.connect()

		const epcGenerator = new EPCGenerator()
		const inventories = await readBGradeInventory()

		for (const inventory of inventories) {
			if (inventory.sizes.length === 0 || inventory.sizes.every((s) => s.quantity === 0)) continue

			const epcMatches = inventory.sizes.flatMap((size) =>
				epcGenerator.generateBatch(size.quantity).map((epc) => ({
					epc,
					isactive: 'Y',
					size_code: new SizeNumber(size.size_code).normalize('padleft'),
					user_code_created: 'y023923',
					user_name_created: 'y023923',
					ri_cancel: 0,
					ri_type: 'manually',
					defective_location: 'A',
					unit:
						inventory.defective_category === DefectiveCategory.B_GRADE ||
						inventory.defective_category === DefectiveCategory.RESEARCH_DEVELOPMENT
							? DefectiveGoodsUnit.PRS
							: DefectiveGoodsUnit.PCS,
					inbound_date: new Date(),
					defective_description:
						'H4sIAAAAAAAAA+2YQW/TMBSA/8ojEmhITdJuO5U0EpyYGCcmLlM1uY7bmDqJFTtdy43TxIEDJw4IQdkBTQJpEpOQ2gOHoP2P/BNe0pS167RNgnJKKyWx3/PLs9/nZzuOvwVUEKVaRjcKtdmJhAeaDbXZjWLWi6Mk9Ay3YcFulE3GHEQ2fcdB+ulYg8+z6VHo2P6W6yRibkZwpc0wChlIs26ARzQx9UiylqGJ6u+i1HAdwefqgVmH/XskkA8OZLu5UBKkw0S7KQWhzKToG0P3KF5YfKUK1yxQlxTQomDE42HPjJkgQ+YtSIjgvdAMuOcJBl3BhjAz0SGKCY7+L7/FN7tcz+t4KBO9X3SL+oz2O9Gw3W7ikAXmvHyTKk1UM849q99aM+p2FdM3NSiiR6jmA3a9YhCbm9drFOG/GLSrle4o/pKZ22WoCwHzECciFFuJ/w4OcR7/fExdpzAIM+ncIkqVJKHr2OWt1PX4wHXkH2xGZsNw9+Js8mUEw/PTbPqeQiebvoIgm/zQ+Fp7kE2OuWNLNFG0tQWvwKvA+yfgPYrCHvRZBDb42fRj/liRVpG2BtKeEQ5B+ilB0kREkLq8ULFWsbYG1naLzd2vt/ly+iFHjYxgA3d8R9SvQSfBGorZ7nUNvPPT2eP9isSKxHWsr9nkJETO0m+hD7iR+6lxc4dV0PfTM+RQkKTk9JhWCFYIri0Z5sOOGI6RuTIT4uE3Cmq4DJ9EtTmONP0cVqmw4nCdizImQdgI0u+yRC/Mpie6Biq/5YfeaQVgBeA6AHzip2PaBMuyLgNmJ9jkVh8QNy14mp6BzibHuHHkoHmxphdfE6/8gOhxRVfNLCB9SQYItbHiuvVff7PhWZ55lZt/7+btMduy4HH6FbeMyBleA44XPKa8ITPGuryXxGxxtsxqsKs86IGKacvwtZaqadskxL+yBqF9KOeZ0U4knsE9Zcs4Onj4vF5vNLYPNq0XsmcAEbpl7ASkh9PxkHvabxmNev1uLsAMiDOvyJkGUCI1j7BijymNUiUZ1THBOmxgFD6WKkuxKVNu8RwkmnlL/c5tOfZFU7coYM9WYpiP6m9okIyA9BcAAA==',
					...omit(inventory, ['sizes'])
				}))
			)

			const user = await mongoManager.getRepository<UserDocument>('users').findOne({ username: 'y023923' })

			const mongoPayload = epcMatches.map((match) => ({
				epc: match.epc,
				po: match.po,
				mo_no: match.mo_no,
				brand_name: match.brand_name,
				cust_shoes_style: match.cust_shoes_style,
				factory_shoes_style: match.factory_shoes_style,
				color_sn: match.color_sn,
				size_numcode: match.size_code,
				defective_category: match.defective_category as DefectiveCategory,
				defective_location: match.defective_location as DefectiveLocation,
				defective_description: match.defective_description,
				inbound_date: match.inbound_date,
				storage_location: match.storage_location,
				unit: match.unit,
				deleted: match.isactive === 'N',
				created_by: user._id,
				updated_by: user._id,
				updated_at: new Date()
			}))

			await mongoManager
				.getRepository<DefectiveGoodsDocument>('defective_goods')
				.insertMany(mongoPayload as unknown as DefectiveGoodsDocument[])
		}
		const defectiveEpcs = await mongoManager.getRepository<DefectiveGoodsDocument>('defective_goods').find()
		await mssqlManager.query(
			/* SQL */ `INSERT INTO DV_DATA_LAKE.dbo.dv_defective_goods (
                  epc,
                  po,
                  mo_no,
                  size_code,
                  user_code_created,
                  user_name_created,
                  brand_name,
                  cust_shoes_style,
                  factory_shoes_style,
                  color_sn,
                  defective_category,
                  defective_location,
                  inbound_date,
                  storage_location,
                  unit,
                  ri_type,
                  ri_cancel,
                  isactive,
                  defective_description,
						sync_id
               )
               (SELECT JSON_VALUE(value, '$.epc') epc,
                     JSON_VALUE(value, '$.po') po,
                     JSON_VALUE(value, '$.mo_no') mo_no,
                     JSON_VALUE(value, '$.size_code') size_code,
                     JSON_VALUE(value, '$.user_code_created') user_code_created,
                     JSON_VALUE(value, '$.user_name_created') user_name_created,
                     JSON_VALUE(value, '$.brand_name') brand_name,
                     JSON_VALUE(value, '$.cust_shoes_style') cust_shoes_style,
                     JSON_VALUE(value, '$.factory_shoes_style') factory_shoes_style,
                     JSON_VALUE(value, '$.color_sn') color_sn,
                     JSON_VALUE(value, '$.defective_category') defective_category,
                     JSON_VALUE(value, '$.defective_location') defective_location,
                     JSON_VALUE(value, '$.inbound_date') inbound_date,
                     JSON_VALUE(value, '$.storage_location') storage_location,
                     JSON_VALUE(value, '$.unit') unit,
                     JSON_VALUE(value, '$.combination_strategy') ri_type,
                     0 AS ri_cancel,
                     'Y' AS isactive,
                     JSON_VALUE(value, '$.defective_description') defective_description,
							JSON_VALUE(value, '$._id ') as sync_id
               FROM   OPENJSON (@jsonValue));
            `,
			{ jsonValue: { type: NVarChar(), value: JSON.stringify(defectiveEpcs) } }
		)

		logger.info(`Read ${inventories.length} groups`)
		process.exitCode = 0
	} catch (error) {
		process.exitCode = 1
		logger.error(error as Error)
	} finally {
		await mssqlManager.disconnect()
		process.exit(process.exitCode ?? 0)
	}
}

execute()
