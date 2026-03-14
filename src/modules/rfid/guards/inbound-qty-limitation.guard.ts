import { TENANCY_DATA_SOURCE } from '@/modules/tenancy/constants'
import { BadRequestException, CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { FastifyRequest } from 'fastify'
import { I18nService } from 'nestjs-i18n'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DataSource } from 'typeorm'
import { EpcInbound, EpcModel } from '../schemas/epc.schema'

@Injectable()
export class InboundQtyLimitationGuard implements CanActivate {
	private readonly missingInboundQtyQuery: string = readFileSync(
		resolve(join(__dirname, '../sql/missing-inbound-qty.sql')),
		'utf-8'
	)

	constructor(
		@Inject(TENANCY_DATA_SOURCE) private readonly dataSourceTNC: DataSource,
		@InjectModel(EpcInbound.name) private readonly epcInboundModel: EpcModel,
		private readonly i18nService: I18nService
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest<FastifyRequest>()

		const commandNumber = (request.params as Record<string, string>).commandNumber

		const inboundEpcs = await this.epcInboundModel
			.find({ mo_no: commandNumber, deleted: false, scannable: true }, { _id: 0, epc: 1, size_numcode: 1 })
			.lean(true)

		const missingOrderSizeQty = await this.dataSourceTNC.query<
			Array<{
				size_numcode: string
				missing_qty: number
			}>
		>(this.missingInboundQtyQuery, [commandNumber, JSON.stringify(inboundEpcs)])

		const isOverOrderQty = missingOrderSizeQty.some((size) => size.missing_qty < 0)

		if (isOverOrderQty)
			throw new BadRequestException(this.i18nService.t('inoutbound.notification.over_inbound_limit'))

		return isOverOrderQty
	}
}
