import { TENANCY_DATA_SOURCE } from '@/modules/tenancy/constants'
import { Inject, Injectable } from '@nestjs/common'
import { DataSource, FindOptionsWhere } from 'typeorm'
import { ProductInventoryReportQueryDTO } from '../dto/inventory-report.dto'
import { InboundInventoryEntity } from '../entities/inbound-inventory.entity'
import { OutboundInventoryEntity } from '../entities/outbound-inventory.entity'
import { ProductSizeInventoryEntity } from '../entities/product-size-inventory.entity'

@Injectable()
export class ProductionInventoryService {
	constructor(@Inject(TENANCY_DATA_SOURCE) private readonly dataSourceTNC: DataSource) {}

	public async getProductInventory(queries: ProductInventoryReportQueryDTO) {
		const filterQuery: FindOptionsWhere<ProductSizeInventoryEntity> = {
			shoes_style: queries['shoes_style.eq'],
			color: queries['color_sn.eq']
		}

		const [productSizeInventory, inboundInventory, outboundInventory] = await Promise.all([
			this.dataSourceTNC.getRepository(ProductSizeInventoryEntity).findBy(filterQuery),
			this.dataSourceTNC.getRepository(InboundInventoryEntity).findBy(filterQuery),
			this.dataSourceTNC.getRepository(OutboundInventoryEntity).findBy(filterQuery)
		])

		return {
			size: productSizeInventory,
			inbound: inboundInventory,
			outbound: outboundInventory
		}
	}

	public async getProductionInventoryFeatures() {
		return await this.dataSourceTNC
			.getRepository(ProductSizeInventoryEntity)
			.createQueryBuilder('a')
			.distinct()
			.select('a.shoes_style', 'shoes_style')
			.addSelect('a.color', 'color')
			.getRawMany<Pick<ProductSizeInventoryEntity, 'shoes_style' | 'color'>>()
	}
}
