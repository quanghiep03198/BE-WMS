import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { InjectQueue } from '@nestjs/bullmq'
import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common'
import { REQUEST } from '@nestjs/core'
import { InjectModel } from '@nestjs/mongoose'
import { InjectDataSource } from '@nestjs/typeorm'
import { Queue } from 'bullmq'
import { readFileSync } from 'fs'
import { chunk, pick } from 'lodash'
import { FilterQuery } from 'mongoose'
import { join, resolve } from 'path'
import { DataSource } from 'typeorm'
import { POST_DATA_OUTBOUND_QUEUE } from '../constants'
import { DeleteScannedEpcDTO, PostReaderDataDTO, UpsertStockOutDTO } from '../dto/rfid.dto'
import { EpcDocument, EpcModel, EpcOutbound } from '../schemas/epc.schema'
import { RFIDSearchParams } from '../types'

@Injectable()
export class RFIDOutboundService {
	private readonly upsertStockoutQuery: string = readFileSync(
		resolve(join(__dirname, '../sql/upsert-stock-out.sql')),
		'utf-8'
	)

	constructor(
		@Inject(REQUEST) private readonly request: Request,
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly dataSourceDL: DataSource,
		@InjectQueue(POST_DATA_OUTBOUND_QUEUE) private readonly postDataQueue: Queue<PostReaderDataDTO>,
		@InjectModel(EpcOutbound.name) private readonly epcOutboundModel: EpcModel
	) {}

	public async addOutboundRFIDDataJob(payload: PostReaderDataDTO) {
		return await this.postDataQueue.add('RFID_OUTBOUND', payload)
	}

	public async fetchLatestOutboundData(args: RFIDSearchParams) {
		const [epcs, orders] = await Promise.all([this.getIncomingOutboundEpcs(args), this.getOutboundOrderDetails()])
		return { epcs, orders }
	}

	public async getIncomingOutboundEpcs(args: RFIDSearchParams) {
		const factoryCode = this.request.headers['x-user-company']
		const filterQuery: FilterQuery<EpcDocument> = {
			scannable: true,
			station_no: { $regex: new RegExp(`CUS_${factoryCode}_WH103`) }
		}

		return await this.epcOutboundModel.paginate(filterQuery, {
			sort: { record_time: -1, mo_no: 1, epc: 1 },
			select: ['epc', 'mo_no'],
			lean: true,
			page: args._page,
			limit: args._limit,
			options: { readPreference: 'nearest' },
			customLabels: { docs: 'data' }
		})
	}

	public async getOutboundOrderDetails() {
		const factoryCode = this.request.headers['x-user-company']
		return await await this.epcOutboundModel.aggregate(
			[
				// * Stage 1: Match documents that are not deleted
				{
					$match: {
						deleted: false,
						scannable: true,
						station_no: { $regex: new RegExp(`CUS_${factoryCode}_WH103`) }
					}
				},
				// * Stage 2: Group by mo_no, mat_ecolor, and shoes_style_code_factory, and aggregate sizes
				{
					$group: {
						_id: {
							mo_no: '$mo_no',
							mat_ecolor: '$mat_ecolor',
							shoes_style_code_factory: '$shoes_style_code_factory',
							size_numcode: '$size_numcode'
						},
						count: { $sum: 1 }
					}
				},
				// * Stage 3: Reshape the data to group sizes into an array
				{
					$group: {
						_id: {
							mo_no: '$_id.mo_no',
							mat_ecolor: '$_id.mat_ecolor',
							shoes_style_code_factory: '$_id.shoes_style_code_factory'
						},
						sizes: {
							$push: {
								size_numcode: '$_id.size_numcode',
								count: '$count'
							}
						}
					}
				},
				// * Stage 4: Reshape the final output
				{
					$project: {
						_id: 0,
						mo_no: '$_id.mo_no',
						mat_ecolor: '$_id.mat_ecolor',
						shoes_style_code_factory: '$_id.shoes_style_code_factory',
						sizes: 1
					}
				},
				// * Stage 5: Sort the results
				{ $sort: { mo_no: 1, mat_ecolor: 1, shoes_style_code_factory: 1 } }
			],
			{ readPreference: 'nearest' }
		)
	}

	async upsertStockOut(payload: UpsertStockOutDTO) {
		const baseFilterQuery: FilterQuery<EpcDocument> = {
			deleted: false,
			scannable: true
		}
		/**
		 * In case of multiple command numbers, we need to filter by mo_no and size_numcode
		 * Otherwise, with single command number, we need to filter by mo_no, size_numcode and limit quantity
		 */
		const extraFilterQuery: FilterQuery<EpcDocument> = Array.isArray(payload.mo_no)
			? { mo_no: { $in: payload.mo_no } }
			: { mo_no: payload.mo_no, size_numcode: payload.size_numcode }
		const epcToUpsert = await this.epcOutboundModel
			.find({ ...baseFilterQuery, ...extraFilterQuery })
			.limit(payload.qty)
			.lean(true)
		const session = await this.epcOutboundModel.startSession()
		const queryRunner = this.dataSourceDL.createQueryRunner()
		await Promise.all([session.startTransaction(), queryRunner.startTransaction()])
		try {
			const data = epcToUpsert.map((value) => {
				return {
					...value,
					po: payload.po
				}
			})
			for (const item of chunk(data, 100)) {
				const values = item
					.map((value) => {
						return `('${value.epc}', '${value.po}', '${value.mo_no}', '${value.size_numcode}', '${value.station_no}', '${value.factory_code_produce}')`
					})
					.join(',')

				await this.dataSourceDL.query(this.upsertStockoutQuery.replace(':values', values))
			}
			await this.epcOutboundModel
				.updateMany(
					{ ...baseFilterQuery, epc: { $in: epcToUpsert.map((item) => item.epc) } },
					{ $set: { deleted: true, po: payload.po } }
				)
				.exec()

			await Promise.all([queryRunner.commitTransaction(), session.commitTransaction()])
		} catch (error) {
			await Promise.all([queryRunner.rollbackTransaction(), session.abortTransaction()])
			throw new InternalServerErrorException(error)
		}
	}

	public async deleteScannedOutboundEpcs(filters: DeleteScannedEpcDTO) {
		const filterQuery: FilterQuery<EpcOutbound> = !filters['size_numcode.eq'] ? pick(filters, 'mo_no.eq') : filters
		if (filterQuery['size_numcode.eq'] && filterQuery['quantity.eq']) {
			const epcsToDelete = await this.epcOutboundModel
				.find({
					mo_no: filters['mo_no.eq'],
					size_numcode: filters['size_numcode.eq']
				})
				.limit(filters['quantity.eq'])
				.lean(true)

			return await this.epcOutboundModel
				.updateMany(
					{ epc: { $in: epcsToDelete.map((item) => item.epc) } },
					{ deleted: true, scannable: !filters['f'] },
					{ new: true }
				)
				.exec()
		}
		return await this.epcOutboundModel
			.updateMany({ mo_no: filters['mo_no.eq'] }, { deleted: true, scannable: !filters['f'] })
			.exec()
	}
}
