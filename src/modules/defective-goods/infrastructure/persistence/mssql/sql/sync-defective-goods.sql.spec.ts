import syncDefectiveGoodsSql from './sync-defective-goods.sql'

describe('sync defective goods SQL', () => {
	it('updates the CDC origin marker on matched rows', () => {
		expect(syncDefectiveGoodsSql).toMatch(/WHEN MATCHED THEN\s+UPDATE SET\s+target\.sync_id = source\.sync_id,/)
	})
})
