import mssql from 'mssql'
import { MssqlManager } from '../libs/mssql'

describe('migration database configuration', () => {
	it('uses migration-local SQL credentials, port, timeout and certificate settings', async () => {
		const connect = jest.spyOn(mssql, 'connect').mockImplementation(() => {
			throw new Error('connection boundary')
		})
		try {
			const manager = new MssqlManager('file-host', {
				DB_USERNAME: 'file-user',
				DB_PASSWORD: 'file-password',
				DB_PORT: '1435',
				DB_CONNECTION_TIMEOUT: '45000',
				DB_TRUST_SERVER_CERTIFICATE: 'false'
			})
			await expect(manager.connect()).rejects.toThrow('connection boundary')
			const config = connect.mock.calls[0][0]
			expect(
				typeof config !== 'string' &&
					config.server === 'file-host' &&
					config.user === 'file-user' &&
					config.password === 'file-password' &&
					config.port === 1435 &&
					config.connectionTimeout === 45000 &&
					config.options?.trustServerCertificate === false
			).toBe(true)
		} finally {
			connect.mockRestore()
		}
	})
})
