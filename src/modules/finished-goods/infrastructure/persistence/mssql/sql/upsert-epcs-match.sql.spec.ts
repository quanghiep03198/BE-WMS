import upsertEpcsMatchSql from './upsert-epcs-match.sql'

describe('upsert EPC match SQL', () => {
	it('preserves the original MO when the same update is replayed', () => {
		expect(upsertEpcsMatchSql).toMatch(
			/target\.mo_no_actual\s*=\s*CASE\s+WHEN\s+target\.mo_no\s*=\s*source\.mo_no\s+THEN\s+target\.mo_no_actual\s+ELSE\s+target\.mo_no\s+END/i
		)
	})
})
