import { SuperJson } from '@/common/utils'
import { DATA_SOURCE_ERP } from '@/databases/constants'
import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DataSource } from 'typeorm'
import { ProductVariant } from './types'
import { InjectModel } from '@nestjs/mongoose'
import {ProductSpecification, ProductSpecificationModel} from './schemas/product-specification.schema'

@Injectable()
export class ProductSpecificationService {

constructor(@InjectModel(ProductSpecification.name) private readonly productSpecsModel: ProductSpecificationModel){}

	public async getProductSpecification() {
	return await this.productSpecsModel.find().lean()
	}
}
