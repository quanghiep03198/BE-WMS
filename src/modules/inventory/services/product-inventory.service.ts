import { TENANCY_DATA_SOURCE } from '@/modules/tenancy/constants'
import { Inject, Injectable } from '@nestjs/common'
import { uniqBy } from 'lodash'
import { DataSource, FindOptionsWhere } from 'typeorm'
import { ProductInventoryReportQueryDTO } from '../dto/inventory-report.dto'
import { InboundInventoryEntity } from '../entities/inbound-inventory.entity'
import { OutboundExpectationEntity } from '../entities/outbound-inventory.entity'
import { ProductSizeInventoryEntity } from '../entities/product-size-inventory.entity'

@Injectable()
export class ProductionInventoryService {
	constructor(@Inject(TENANCY_DATA_SOURCE) private readonly dataSourceTNC: DataSource) {}

	public async getProductInventory(queries: ProductInventoryReportQueryDTO): Promise<{
		sizes: ProductSizeInventoryEntity[]
		inbound: InboundInventoryEntity[]
		outbound: OutboundExpectationEntity[]
	}> {
		const filterQuery: FindOptionsWhere<ProductSizeInventoryEntity> = {
			shoes_style: queries['shoes_style.eq'],
			color: queries['color_sn.eq']
		}

		const [productSizeInventory, inboundInventory, outboundInventory] = await Promise.all([
			this.dataSourceTNC.getRepository(ProductSizeInventoryEntity).findBy(filterQuery),
			this.dataSourceTNC.getRepository(InboundInventoryEntity).findBy(filterQuery),
			this.dataSourceTNC.getRepository(OutboundExpectationEntity).findBy(filterQuery)
		])

		return {
			sizes: productSizeInventory,
			inbound: inboundInventory,
			outbound: outboundInventory
		}
	}

	public async getProductionInventoryFeatures() {
		const result = await this.dataSourceTNC
			.getRepository(ProductSizeInventoryEntity)
			.createQueryBuilder('a')
			.select('a.shoes_style', 'shoes_style')
			.addSelect('a.color', 'color')
			.getRawMany<Pick<ProductSizeInventoryEntity, 'shoes_style' | 'color'>>()

		return {
			shoes_style: uniqBy(result, (item) => item.shoes_style)
				.map((item) => item.shoes_style)
				.filter((item) => item !== 'ALL')
				.sort(),
			color: uniqBy(result, (item) => item.color)
				.map((item) => item.color)
				.filter((item) => item !== 'ALL')
				.sort()
		}
	}
}
