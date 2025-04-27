import { DATA_SOURCE_DATA_LAKE } from '@/databases/constants'
import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { InjectDataSource } from '@nestjs/typeorm'
import { Queue } from 'bullmq'
import { readFileSync } from 'fs'
import { chunk } from 'lodash'
import { FilterQuery, PipelineStage, UpdateWriteOpResult } from 'mongoose'
import { join, resolve } from 'path'
import { DataSource } from 'typeorm'
import { POST_DATA_OUTBOUND_QUEUE } from '../constants'
import { FindEpcBySizeDTO, PostReaderDataDTO, UpsertStockOutDTO } from '../dto/rfid.dto'
import { EpcDocument, EpcModel, EpcOutbound } from '../schemas/epc.schema'
import { RFIDSearchParams } from '../types'

@Injectable()
export class RFIDOutboundService {
	private readonly upsertStockoutQuery: string = readFileSync(
		resolve(join(__dirname, '../sql/upsert-outbound.sql')),
		'utf-8'
	)

	constructor(
		@InjectDataSource(DATA_SOURCE_DATA_LAKE) private readonly dataSourceDL: DataSource,
		@InjectQueue(POST_DATA_OUTBOUND_QUEUE) private readonly postDataQueue: Queue<PostReaderDataDTO>,
		@InjectModel(EpcOutbound.name) private readonly epcOutboundModel: EpcModel
	) {}

	public async postOutboundRFIDData(payload: PostReaderDataDTO) {
		return await this.postDataQueue.add('RFID_OUTBOUND', payload)
	}

	public async fetchLatestOutboundData(args: RFIDSearchParams) {
		const [epcs, orders] = await Promise.all([this.getIncomingOutboundEpcs(args), this.getOutboundOrderDetails()])
		return { epcs, orders }
	}

	public async getIncomingOutboundEpcs(args: RFIDSearchParams) {
		const filterQuery: FilterQuery<EpcDocument> = { scannable: true }

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

	public async findDeletableEpcs(queries: FindEpcBySizeDTO) {
		const VALID_EPC_LENGTH = 24
		return await this.epcOutboundModel
			.find({
				mo_no: queries['mo_no.eq'],
				size_numcode: queries['size_numcode.eq'],
				scannable: true,
				$expr: { $eq: [{ $strLenCP: '$epc' }, VALID_EPC_LENGTH] }
			})
			.select('epc')
			.lean()
	}

	public async getOutboundOrderDetails() {
		return await this.epcOutboundModel.aggregate(
			[
				// * Stage 1: Match documents that are not deleted
				{
					$match: {
						deleted: false,
						scannable: true
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
		 * ? In case of multiple command numbers, filter by mo_no and size_numcode
		 * ? Otherwise, with single command number, filter by mo_no, size_numcode and limit quantity
		 */
		const epcToUpsert = await (async () => {
			if (!Array.isArray(payload.sizes)) {
				return await this.epcOutboundModel.find({ ...baseFilterQuery, mo_no: payload.mo_no }).lean(true)
			}

			const facetPipeline = payload.sizes.reduce<PipelineStage.Facet['$facet']>((acc, curr) => {
				return {
					...acc,
					[curr.size_numcode]: [
						{ $match: { ...baseFilterQuery, mo_no: payload.mo_no, size_numcode: curr.size_numcode } },
						{
							$project: {
								_id: 0,
								epc: 1,
								mo_no: 1,
								size_numcode: 1,
								station_no: 1,
								factory_code_produce: 1
							}
						},
						{ $limit: curr.qty }
					]
				}
			}, {})
			const aggregatedEpcData = await this.epcOutboundModel.aggregate([{ $facet: facetPipeline }])
			const extractedValues = Object.values<Array<Partial<EpcDocument>>>(aggregatedEpcData[0])
			return extractedValues.every((facetGroup) => Array.isArray(facetGroup)) ? extractedValues.flat() : []
		})()

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

				await this.dataSourceDL.query(this.upsertStockoutQuery.replace(/:values/g, values))
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

	public async deleteScannedOrder(commandNumber: string, rescannable: boolean): Promise<UpdateWriteOpResult> {
		return await this.epcOutboundModel
			.updateMany({ mo_no: commandNumber }, { deleted: true, scannable: rescannable }, { new: true })
			.exec()
	}

	public async deleteBulkEpcs(epcs: string[], rescannable: boolean): Promise<UpdateWriteOpResult> {
		return await this.epcOutboundModel
			.updateMany({ epc: { $in: epcs } }, { deleted: true, scannable: rescannable }, { new: true })
			.exec()
	}
}
