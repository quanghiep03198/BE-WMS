import { Inject } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { IInventoryAuditRepository, INVENTORY_AUDIT_REPOSITORY } from '../../ports/inventory-audit.repository.port'
import { GetMonthlyInventoryAuditQuery } from './get-monthly-inventory-audit.query'

@QueryHandler(GetMonthlyInventoryAuditQuery)
export class GetMonthlyInventoryAuditHandler implements IQueryHandler<GetMonthlyInventoryAuditQuery> {
	constructor(
		@Inject(INVENTORY_AUDIT_REPOSITORY) private readonly inventoryAuditRepository: IInventoryAuditRepository
	) {}

	public async execute({ month }: GetMonthlyInventoryAuditQuery) {
		return await this.inventoryAuditRepository.getMonthlyInventoryAudit(month)
	}
}
