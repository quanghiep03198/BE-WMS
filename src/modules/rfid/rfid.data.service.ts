import { NotFoundException } from '@nestjs/common'
import { existsSync, JsonOutputOptions, outputJson, readJson, readJsonSync } from 'fs-extra'
import { mkdir } from 'fs/promises'
import { pick, uniqBy } from 'lodash'
import { join, resolve } from 'path'
import { Tenant } from '../tenancy/constants'
import { FALLBACK_VALUE } from './constants'
import { RFIDMatchCustomerEntity } from './entities/rfid-customer-match.entity'
import { DeleteEpcBySizeParams, StoredRFIDReaderData, StoredRFIDReaderItem } from './types'

export class RFIDDataService {
	protected static readonly jsonOutputOptions: JsonOutputOptions = { spaces: 3, EOL: '\n' }

	static readonly DATA_DIR: string = join(process.cwd(), '/data')
	static readonly DEKCER_API_DATA_DIR: string = join(process.cwd(), '/data/@DECKER')
	static readonly PM_DATA_DIR: string = join(process.cwd(), '/data/@FP')

	// * Decker RFID data files
	static readonly VA1_DECKER_DATA_FILE: string = resolve(this.DEKCER_API_DATA_DIR, 'VA1.data.json')
	static readonly VB2_DECKER_DATA_FILE: string = resolve(this.DEKCER_API_DATA_DIR, 'VB2.data.json')
	static readonly CA1_DECKER_DATA_FILE: string = resolve(this.DEKCER_API_DATA_DIR, 'CA1.data.json')

	// * Production Warehouse RFID data files
	static readonly DEV_PM_DATA_FILE: string = resolve(this.PM_DATA_DIR, 'DEV.data.json') // * Only for used in development
	static readonly VA1_PM_DATA_FILE: string = resolve(this.PM_DATA_DIR, 'VA1.data.json')
	static readonly VB2_PM_DATA_FILE: string = resolve(this.PM_DATA_DIR, 'VB2.data.json')
	static readonly CA1_PM_DATA_FILE: string = resolve(this.PM_DATA_DIR, 'CA1.data.json')

	static readonly dataFiles: Record<string, string> = {
		[Tenant.DEV]: this.DEV_PM_DATA_FILE, // * Only for used in development
		[Tenant.VN_LIANYING_PRIMARY]: this.VA1_PM_DATA_FILE,
		[Tenant.VN_LIANSHUN_PRIMARY]: this.VB2_PM_DATA_FILE,
		[Tenant.KM_PRIMARY]: this.CA1_PM_DATA_FILE
	}

	public static async initialize(): Promise<void> {
		if (!existsSync(this.DATA_DIR)) {
			mkdir(this.DATA_DIR, { recursive: true })
		}
		if (!existsSync(this.DEKCER_API_DATA_DIR)) {
			mkdir(this.DEKCER_API_DATA_DIR, { recursive: true })
		}
		if (!existsSync(this.PM_DATA_DIR)) {
			mkdir(this.PM_DATA_DIR, { recursive: true })
		}

		if (!existsSync(this.DEV_PM_DATA_FILE)) outputJson(this.DEV_PM_DATA_FILE, { epcs: [] }, this.jsonOutputOptions)
		if (!existsSync(this.VA1_PM_DATA_FILE)) outputJson(this.VA1_PM_DATA_FILE, { epcs: [] }, this.jsonOutputOptions)
		if (!existsSync(this.VB2_PM_DATA_FILE)) outputJson(this.VB2_PM_DATA_FILE, { epcs: [] }, this.jsonOutputOptions)
		if (!existsSync(this.CA1_PM_DATA_FILE)) outputJson(this.CA1_PM_DATA_FILE, { epcs: [] }, this.jsonOutputOptions)

		if (!existsSync(this.VA1_DECKER_DATA_FILE))
			outputJson(this.VA1_DECKER_DATA_FILE, { epcs: [] }, this.jsonOutputOptions)
		if (!existsSync(this.VB2_DECKER_DATA_FILE))
			outputJson(this.VB2_DECKER_DATA_FILE, { epcs: [] }, this.jsonOutputOptions)
		if (!existsSync(this.CA1_DECKER_DATA_FILE))
			outputJson(this.CA1_DECKER_DATA_FILE, { epcs: [] }, this.jsonOutputOptions)
	}

	public static getFetchedDeckerEpcs(tenantId: string): Record<'epc' | 'mo_no', string>[] {
		const dataFile = this.dataFiles[tenantId]
		const data = readJsonSync(dataFile)
		if (!Array.isArray(data?.epcs)) return []
		return data.epcs
	}

	public static getEpcDataFile(tenantId: string): string {
		const dataFile = this.dataFiles[tenantId]
		if (!dataFile) throw new NotFoundException('Data source not found')
		return dataFile
	}

	public static async getScannedEpcs(tenantId: string): Promise<StoredRFIDReaderItem[]> {
		const dataFile = this.dataFiles[tenantId]
		const data: StoredRFIDReaderData = await readJson(dataFile)
		if (!Array.isArray(data?.epcs)) return []
		return data.epcs.sort((a, b) => new Date(b.record_time).getTime() - new Date(a.record_time).getTime())
	}

	public static async getScannedEpcsByOrder(tenantId: string, orderCode: string): Promise<StoredRFIDReaderItem[]> {
		const dataSource = await this.getScannedEpcs(tenantId)
		return dataSource.filter((item) => item.mo_no === orderCode)
	}

	public static async insertScannedEpcs(tenantId: string, payload: StoredRFIDReaderItem[]) {
		const dataFile = this.getEpcDataFile(tenantId)
		const data = await this.getScannedEpcs(tenantId)
		outputJson(dataFile, { epcs: uniqBy([...payload, ...data], 'epc') }, this.jsonOutputOptions)
	}

	public static async updateUnknownScannedEpcs(tenantId: string, payload: Partial<RFIDMatchCustomerEntity>[]) {
		const dataFile = this.getEpcDataFile(tenantId)
		const data = await this.getScannedEpcs(tenantId)
		const update = payload.filter((item) => data.some((__item) => __item.epc === item.epc))
		outputJson(
			dataFile,
			{
				epcs: data.map((item) => {
					if (payload.some((__item) => __item.epc === item.epc) && item.mo_no === FALLBACK_VALUE)
						return {
							...item,
							...pick(
								update.find((__item) => __item.epc === item.epc),
								['mo_no', 'mat_code', 'size_numcode']
							)
						}
					return item
				})
			},
			this.jsonOutputOptions
		)
	}

	public static async updateScannedEpcs(tenantId: string, epcs: Array<string>, update: any) {
		const dataFile = this.getEpcDataFile(tenantId)
		const data = await this.getScannedEpcs(tenantId)
		outputJson(
			dataFile,
			{
				epcs: data.map((item) => {
					if (epcs.some((epc) => epc === item.epc)) return { ...item, ...update }
					return item
				})
			},
			this.jsonOutputOptions
		)
	}

	public static async deleteScannedEpcsByOrder(tenantId: string, orderCode: string) {
		const dataFile = this.getEpcDataFile(tenantId)
		const data = await this.getScannedEpcs(tenantId)
		outputJson(dataFile, { epcs: data.filter((item) => item.mo_no !== orderCode) }, this.jsonOutputOptions)
	}

	public static async deleteScannedEpcsBySize(tenantId: string, filters: DeleteEpcBySizeParams) {
		const dataFile = this.getEpcDataFile(tenantId)
		const data = await this.getScannedEpcs(tenantId)
		const filteredData = data.filter(
			(item) => item.mo_no !== filters['mo_no.eq'] || item.size_numcode !== filters['size_num_code.eq']
		)
		const remainingData = data.filter(
			(item) => item.mo_no === filters['mo_no.eq'] && item.size_numcode === filters['size_num_code.eq']
		)
		const updatedData = remainingData.slice(filters['quantity.eq'])

		outputJson(
			dataFile,
			{
				epcs: [...filteredData, ...updatedData]
			},
			this.jsonOutputOptions
		)
	}

	public static async truncateData(tenantId: string) {
		const dataFile = this.getEpcDataFile(tenantId)
		outputJson(dataFile, { epcs: [] }, this.jsonOutputOptions)
	}
}
