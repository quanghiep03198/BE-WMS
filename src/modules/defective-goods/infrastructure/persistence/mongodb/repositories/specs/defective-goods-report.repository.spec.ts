import { DefectiveGoodsReportRepository } from '../defective-goods-report.repository'

describe('DefectiveGoodsReportRepository', () => {
	it.each(['inbound', 'outbound'] as const)('reads today’s %s report from saved reports', async (type) => {
		const date = new Date()
		const saved = [
			{
				date: date.toISOString().slice(0, 10),
				type,
				sewing_line: null,
				assembly_line: null,
				size_ledger: [{ size_numcode: '40', qty: 2 }]
			}
		]
		const dailyModel = {
			find: (filter: { date: string; type: string }) => ({
				lean: async () => saved.filter((item) => item.date === filter.date && item.type === filter.type)
			})
		}
		const goodsModel = {
			aggregateWithDeleted: () => {
				throw new Error('Reports must not be calculated from goods while reading')
			}
		}
		const repository: DefectiveGoodsReportRepository = Reflect.construct(DefectiveGoodsReportRepository, [
			goodsModel,
			dailyModel
		])

		const result =
			type === 'inbound'
				? await repository.getDailyInboundReport(date)
				: await repository.getDailyOutboundReport(date)

		expect(result).toEqual(saved)
	})
})
