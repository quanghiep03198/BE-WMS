import { existsSync, JsonOutputOptions, mkdirSync, outputJsonSync, readJsonSync } from 'fs-extra'
import { uniqBy } from 'lodash'
import { join, resolve } from 'path'
import { Tenant } from '../tenancy/constants'
import { StoredRFIDReaderItem } from './types'

export class RFIDDataService {
	protected static jsonOptions: JsonOutputOptions = { spaces: 3, EOL: '\n' }

	constructor() {}

	static readonly DATA_DIR: string = resolve(join(__dirname, '../../data'))
	static readonly DEKCER_API_DATA_DIR: string = resolve(join(__dirname, '../../data/__DECKER__'))
	static readonly PM_DATA_DIR: string = resolve(join(__dirname, '../../data/__PM__'))

	// * Decker RFID data files
	static readonly VA1_DECKER_DATA_FILE: string = resolve(
		RFIDDataService.DEKCER_API_DATA_DIR,
		'[VA1]-decker-api.data.json'
	)
	static readonly VB2_DECKER_DATA_FILE: string = resolve(
		RFIDDataService.DEKCER_API_DATA_DIR,
		'[VB2]-decker-api.data.json'
	)
	static readonly CA1_DECKER_DATA_FILE: string = resolve(
		RFIDDataService.DEKCER_API_DATA_DIR,
		'[CA1]-decker-api.data.json'
	)

	// * Production Warehouse RFID data files
	static readonly VA1_PM_DATA_FILE: string = resolve(RFIDDataService.PM_DATA_DIR, '[VA1]-pm-rfid.data.json')
	static readonly VB2_PM_DATA_FILE: string = resolve(RFIDDataService.PM_DATA_DIR, '[VB2]-pm-rfid.data.json')
	static readonly CA1_PM_DATA_FILE: string = resolve(RFIDDataService.PM_DATA_DIR, '[CA1]-pm-rfid.data.json')

	static readonly dataFiles: Record<string, string> = {
		[Tenant.VN_LIANYING_PRIMARY]: RFIDDataService.VA1_PM_DATA_FILE,
		[Tenant.VN_LIANSHUN_PRIMARY]: RFIDDataService.VB2_PM_DATA_FILE,
		[Tenant.KM_PRIMARY]: RFIDDataService.VB2_PM_DATA_FILE
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

		if (!existsSync(this.VA1_PM_DATA_FILE)) outputJsonSync(this.VA1_PM_DATA_FILE, { epcs: [] }, this.jsonOptions)
		if (!existsSync(this.VB2_PM_DATA_FILE)) outputJsonSync(this.VB2_PM_DATA_FILE, { epcs: [] }, this.jsonOptions)
		if (!existsSync(this.CA1_PM_DATA_FILE)) outputJsonSync(this.CA1_PM_DATA_FILE, { epcs: [] }, this.jsonOptions)

		if (!existsSync(this.VA1_DECKER_DATA_FILE))
			outputJsonSync(this.VA1_DECKER_DATA_FILE, { epcs: [] }, this.jsonOptions)
		if (!existsSync(this.VB2_DECKER_DATA_FILE))
			outputJsonSync(this.VB2_DECKER_DATA_FILE, { epcs: [] }, this.jsonOptions)
		if (!existsSync(this.CA1_DECKER_DATA_FILE))
			outputJsonSync(this.CA1_DECKER_DATA_FILE, { epcs: [] }, this.jsonOptions)
	}

	public static getFetchedDeckerEpcs(tenantId: string): Record<'epc' | 'mo_no', string>[] {
		const dataFile = this.dataFiles[tenantId]
		const data = readJsonSync(dataFile)
		if (!Array.isArray(data?.epcs)) return []
		return data.epcs
	}

	public static getInvDataFile(tenantId: string): string {
		return this.dataFiles[tenantId]
	}

	public static getInvScannedEpcs(tenantId: string): StoredRFIDReaderItem[] {
		const dataFile = this.dataFiles[tenantId]
		const data = readJsonSync(dataFile)
		if (!Array.isArray(data?.epcs)) return []
		return data.epcs
	}

	public static insertInvScannedEpcs(tenantId: string, payload: StoredRFIDReaderItem[]) {
		const dataFile = this.getInvDataFile(tenantId)
		const data = this.getInvScannedEpcs(tenantId)
		outputJsonSync(dataFile, { epcs: uniqBy([...payload, ...data], 'epc') }, this.jsonOptions)
	}

	public static findInvScannedEpcsByOrder(tenantId: string, orderCode: string) {
		const dataSource = this.getInvScannedEpcs(tenantId)
		return dataSource.filter((item) => item.mo_no === orderCode)
	}

	public static deleteInvScannedEpcsByOrder(tenantId: string, orderCode: string) {
		const dataFile = this.getInvDataFile(tenantId)
		const data = this.getInvScannedEpcs(tenantId)
		outputJsonSync(dataFile, { epcs: data.filter((item) => item.mo_no !== orderCode) }, this.jsonOptions)
	}

	public static truncateData(tenantId: string) {
		const dataFile = this.getInvDataFile(tenantId)
		outputJsonSync(dataFile, { epcs: [] }, this.jsonOptions)
	}
}
