import { TransactionHost } from '@nestjs-cls/transactional'
import { In, Not } from 'typeorm'
import { FinishedGoodsAuditRepository } from '../finished-goods-audit.repository'

describe('FinishedGoodsAuditRepository', () => {
	afterEach(() => jest.restoreAllMocks())

	it('does not overwrite the original MO when an exchange is replayed', async () => {
		jest.spyOn(TransactionHost, 'getInstance').mockReturnValue({
			withTransaction: (_propagation: unknown, _options: unknown, fn: () => unknown) => fn()
		} as never)
		const update = jest.fn().mockResolvedValue({ affected: 1 })
		const repository = new FinishedGoodsAuditRepository({ tx: { getRepository: () => ({ update }) } } as never)

		await repository.exchangeManufacturingOrder(['E1'], 'MO2')

		expect(update).toHaveBeenCalledWith(
			{ epc: In(['E1']), mo_no: Not('MO2') },
			expect.objectContaining({ mo_no: 'MO2' })
		)
	})
})
