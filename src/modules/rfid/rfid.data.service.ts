import { existsSync, JsonOutputOptions, mkdirSync, outputJsonSync, readJsonSync } from 'fs-extra'
import { pick, uniqBy } from 'lodash'
import { join, resolve } from 'path'
import { Tenant } from '../tenancy/constants'
import { FALLBACK_VALUE } from './constants'
import { RFIDMatchCustomerEntity } from './entities/rfid-customer-match.entity'
import { StoredRFIDReaderItem } from './types'

export class RFIDDataService {
	protected static jsonOutputOptions: JsonOutputOptions = { spaces: 3, EOL: '\n' }

	constructor() {}

	static readonly DATA_DIR: string = resolve(join(__dirname, '../../data'))
	static readonly DEKCER_API_DATA_DIR: string = resolve(join(__dirname, '../../data/__DECKER__'))
	static readonly PM_DATA_DIR: string = resolve(join(__dirname, '../../data/__PM__'))

	// * Decker RFID data files
	static readonly VA1_DECKER_DATA_FILE: string = resolve(this.DEKCER_API_DATA_DIR, '[VA1]-decker-api.data.json')
	static readonly VB2_DECKER_DATA_FILE: string = resolve(this.DEKCER_API_DATA_DIR, '[VB2]-decker-api.data.json')
	static readonly CA1_DECKER_DATA_FILE: string = resolve(this.DEKCER_API_DATA_DIR, '[CA1]-decker-api.data.json')

	// * Production Warehouse RFID data files
	static readonly VA1_PM_DATA_FILE: string = resolve(this.PM_DATA_DIR, '[VA1]-pm-rfid.data.json')
	static readonly VB2_PM_DATA_FILE: string = resolve(this.PM_DATA_DIR, '[VB2]-pm-rfid.data.json')
	static readonly CA1_PM_DATA_FILE: string = resolve(this.PM_DATA_DIR, '[CA1]-pm-rfid.data.json')

	static readonly dataFiles: Record<string, string> = {
		[Tenant.DEV]: this.VA1_PM_DATA_FILE, // * Just for testing, should be removed in production
		[Tenant.VN_LIANYING_PRIMARY]: this.VA1_PM_DATA_FILE,
		[Tenant.VN_LIANSHUN_PRIMARY]: this.VB2_PM_DATA_FILE,
		[Tenant.KM_PRIMARY]: this.VB2_PM_DATA_FILE
	}

	public static initialize(): void {
		if (!existsSync(this.DATA_DIR)) {
			mkdirSync(this.DATA_DIR, { recursive: true })
		}
		if (!existsSync(this.DEKCER_API_DATA_DIR)) {
			mkdirSync(this.DEKCER_API_DATA_DIR, { recursive: true })
		}
		if (!existsSync(this.PM_DATA_DIR)) {
			mkdirSync(this.PM_DATA_DIR, { recursive: true })
		}

		if (!existsSync(this.VA1_PM_DATA_FILE))
			outputJsonSync(this.VA1_PM_DATA_FILE, { epcs: [] }, this.jsonOutputOptions)
		if (!existsSync(this.VB2_PM_DATA_FILE))
			outputJsonSync(this.VB2_PM_DATA_FILE, { epcs: [] }, this.jsonOutputOptions)
		if (!existsSync(this.CA1_PM_DATA_FILE))
			outputJsonSync(this.CA1_PM_DATA_FILE, { epcs: [] }, this.jsonOutputOptions)

		if (!existsSync(this.VA1_DECKER_DATA_FILE))
			outputJsonSync(this.VA1_DECKER_DATA_FILE, { epcs: [] }, this.jsonOutputOptions)
		if (!existsSync(this.VB2_DECKER_DATA_FILE))
			outputJsonSync(this.VB2_DECKER_DATA_FILE, { epcs: [] }, this.jsonOutputOptions)
		if (!existsSync(this.CA1_DECKER_DATA_FILE))
			outputJsonSync(this.CA1_DECKER_DATA_FILE, { epcs: [] }, this.jsonOutputOptions)
	}

	public static getFetchedDeckerEpcs(tenantId: string): Record<'epc' | 'mo_no', string>[] {
		const dataFile = this.dataFiles[tenantId]
		const data = readJsonSync(dataFile)
		if (!Array.isArray(data?.epcs)) return []
		return data.epcs
	}

	public static getEpcDataFile(tenantId: string): string {
		return this.dataFiles[tenantId]
	}

	public static getScannedEpcs(tenantId: string): StoredRFIDReaderItem[] {
		const dataFile = this.dataFiles[tenantId]
		const data = readJsonSync(dataFile)
		if (!Array.isArray(data?.epcs)) return []
		return data.epcs
	}

	public static getScannedEpcsByOrder(tenantId: string, orderCode: string) {
		const dataSource = this.getScannedEpcs(tenantId)
		return dataSource.filter((item) => item.mo_no === orderCode)
	}

	public static insertScannedEpcs(tenantId: string, payload: StoredRFIDReaderItem[]) {
		const dataFile = this.getEpcDataFile(tenantId)
		const data = this.getScannedEpcs(tenantId)
		outputJsonSync(dataFile, { epcs: uniqBy([...payload, ...data], 'epc') }, this.jsonOutputOptions)
	}

	public static updateUnknownScannedEpcs(tenantId: string, payload: Partial<RFIDMatchCustomerEntity>[]) {
		const dataFile = this.getEpcDataFile(tenantId)
		const data = this.getScannedEpcs(tenantId)
		const update = payload.filter((item) => data.some((__item) => __item.epc === item.epc))
		outputJsonSync(
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

	public static updateScannedEpcs(tenantId: string, epcs: Array<string>, update: any) {
		const dataFile = this.getEpcDataFile(tenantId)
		const data = this.getScannedEpcs(tenantId)
		outputJsonSync(
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

	public static deleteScannedEpcsByOrder(tenantId: string, orderCode: string) {
		const dataFile = this.getEpcDataFile(tenantId)
		const data = this.getScannedEpcs(tenantId)
		outputJsonSync(dataFile, { epcs: data.filter((item) => item.mo_no !== orderCode) }, this.jsonOutputOptions)
	}

	public static truncateData(tenantId: string) {
		const dataFile = this.getEpcDataFile(tenantId)
		outputJsonSync(dataFile, { epcs: [] }, this.jsonOutputOptions)
	}
}
