import { IDepartment } from '@modules/department/department.repository.interface'
import { IStorageLocation } from '@modules/warehouse/domain/interfaces/storage-location.interface'
import { EXCLUDED_EPC_PREFIX, FALLBACK_VALUE, INTERNAL_EPC_PREFIX } from '../constants'
import { SizeNumber } from './size-number.vo'

export class ElectronicProductCode {
	private _inboundTransactionId: string

	constructor(
		private readonly sku: string,
		private readonly attributes?: {
			scannable?: boolean
			mo_no: string
			factory_shoes_style: string
			color_sn: string
			size_numcode: SizeNumber
			factory_code_produce: string
			assembly_line?: IDepartment
			storage_location?: IStorageLocation
			implementor?: string
			po?: string
			outbound_type?: 'recall' | 'shipping'
		}
		// private readonly scannable?: boolean,
		// private readonly manufacturingOrder?: string,
		// private readonly shoeStyle?: string,
		// private readonly color?: string,
		// private readonly size?: string,
		// private readonly factoryProduce?: string
	) {}

	public static createFactory(
		data: Array<{
			sku: string
			attributes: {
				mo_no: string
				factory_shoes_style: string
				color_sn: string
				size_numcode: string
				factory_code_produce: string
				implementor?: string
				po: string | undefined
			} | null
		}>
	): ElectronicProductCode[] {
		return data
			.map((item) => {
				const attributes = item.attributes ?? null
				return new ElectronicProductCode(item.sku.trim(), {
					...attributes,
					...(attributes?.size_numcode && { size_numcode: new SizeNumber(attributes.size_numcode) })
				})
			})
			.filter((item) => item.getIsWritable())
	}

	get inboundTransactionId() {
		return this._inboundTransactionId
	}

	set inboundTransactionId(value: string) {
		this._inboundTransactionId = value
	}

	public getStockKeepingUnit() {
		return this.sku
	}

	public getManufacturingOrder() {
		return this.attributes?.mo_no ?? FALLBACK_VALUE
	}

	public getFactoryProduce() {
		return this.attributes?.factory_code_produce ?? FALLBACK_VALUE
	}

	public getShoeStyle() {
		return this.attributes.factory_shoes_style ?? FALLBACK_VALUE
	}

	public getColor() {
		return this.attributes?.color_sn ?? FALLBACK_VALUE
	}

	public getPurchaseOrder() {
		return this.attributes?.po ?? FALLBACK_VALUE
	}

	public getAssemblyLine(prop: 'id' | 'code' | 'name', format: 'original' | 'sanitized' = 'original') {
		const value = this.attributes?.assembly_line

		const { _id: id, code, name } = value

		const assemblyName: Readonly<Record<'original' | 'sanitized', string>> = {
			original: name.cn,
			sanitized: name.cn.replace(/[^A-Za-z0-9]/g, '')
		}

		const assemblyLine = { id, code, name: assemblyName[format] }
		return assemblyLine[prop]
	}

	public getStorageLocation(prop: 'id' | 'name') {
		const value = this.attributes?.storage_location
		if (!value) return FALLBACK_VALUE
		const { _id: id, name } = value
		const storageLocation = { id, name }
		return storageLocation[prop]
	}

	public getSize(options?: Partial<{ normalize: boolean }>) {
		if (!this.attributes?.size_numcode) return FALLBACK_VALUE
		return this.attributes.size_numcode.getValue(options)
	}

	public getIsWritable() {
		return !this.sku.startsWith(EXCLUDED_EPC_PREFIX)
	}

	public getIsInternal() {
		return this.sku.startsWith(INTERNAL_EPC_PREFIX)
	}

	public getOutboundType() {
		return this.attributes?.outbound_type
	}

	public getImplementor() {
		return this.attributes?.implementor ?? 'sa'
	}
}
