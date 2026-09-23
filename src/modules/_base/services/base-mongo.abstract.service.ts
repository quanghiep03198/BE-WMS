import { Injectable } from '@nestjs/common'
import type { Document } from 'mongoose'
import { BaseMongooseModel, BaseMongoRepository } from '../repositories/base-mongo.abstract.repository'

@Injectable()
export abstract class BaseMongoService<TDocument extends Document> extends BaseMongoRepository<TDocument> {
	constructor(model: BaseMongooseModel<TDocument>) {
		super(model)
	}
}
