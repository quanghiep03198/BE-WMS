import { mongo } from 'mongoose'
import { I18nContext } from 'nestjs-i18n'
import { PinoLogger } from 'nestjs-pino'
import { DefectiveGoodsExceptionFilter } from './defective-goods-exception.filter'

describe('DefectiveGoodsExceptionFilter diagnostics', () => {
	afterEach(() => jest.restoreAllMocks())

	it('logs the MongoDB error message and stack without exposing them in the response', () => {
		const lines: string[] = []
		const logger = new PinoLogger({
			pinoHttp: [{ level: 'error' }, { write: (line: string) => lines.push(line) }]
		})
		const context: I18nContext = Reflect.construct(I18nContext, [
			'en',
			{ translate: () => 'Internal server error' },
			{}
		])
		jest.spyOn(I18nContext, 'current').mockReturnValue(context)
		const reply = jest.fn()
		const filter: DefectiveGoodsExceptionFilter = Reflect.construct(DefectiveGoodsExceptionFilter, [
			{ httpAdapter: { getRequestUrl: () => '/api/defective-goods/inbound', reply } },
			logger
		])
		const error = new mongo.MongoTransactionError('Read preference in a transaction must be primary')
		filter.catch(error, {
			switchToHttp: () => ({ getRequest: () => ({}), getResponse: () => ({}) })
		} as Parameters<typeof filter.catch>[1])

		expect(lines).toHaveLength(1)
		const logged = JSON.parse(lines[0])
		expect(logged.err).toMatchObject({ message: error.message, stack: error.stack })
		expect(reply).toHaveBeenCalledWith(
			{},
			expect.objectContaining({ statusCode: 500, message: 'Internal server error' }),
			500
		)
	})
})
