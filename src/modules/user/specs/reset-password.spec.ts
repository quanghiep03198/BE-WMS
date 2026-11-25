import { TransformInterceptor } from '@common/interceptors/transform.interceptor'
import { DATA_SOURCE_SYSCLOUD } from '@databases/constants'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { CallHandler, ExecutionContext } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { JwtService } from '@nestjs/jwt'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { compareSync, hashSync } from 'bcrypt'
import { model, Types } from 'mongoose'
import { getLoggerToken, PinoLogger } from 'nestjs-pino'
import { USER_REPOSITORY } from '../application/ports/user.repository.port'
import { UserRole } from '../domain/constants'
import { UPDATED_USER_EVENT, UpdatedUserEvent } from '../domain/events/updated-user.event'
import { UpdatedUserListener } from '../infrastructure/listeners/updated-user.listener'
import { UserRepository } from '../infrastructure/persistence/mongodb/repositories/user.repository'
import { User, UserModel, UserSchema } from '../infrastructure/persistence/mongodb/schemas/user.schema'
import { UserEntity } from '../infrastructure/persistence/mssql/entities/user.entity'
import { UserController } from '../presentation/controllers/user.controller'

describe('Admin password reset', () => {
	const userModel = model<User, UserModel>('ResetPasswordTestUser', UserSchema.clone())
	const repository = new UserRepository(userModel)
	const id = new Types.ObjectId()
	const jwt = new JwtService({ secret: 'reset-password-tests-only-signing-key' })
	const emitter = new EventEmitter2()
	const sqlUpdate = jest.fn().mockResolvedValue({ affected: 1 })
	const events: UpdatedUserEvent[] = []
	const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() }
	let app: NestFastifyApplication
	let listener: UpdatedUserListener
	let mongoWrite: jest.SpyInstance
	let mongoRead: jest.SpyInstance
	let previousSaltRound: string | undefined

	const adminCookie = () => `access-token=${jwt.sign({ username: 'admin', roles: [UserRole.ADMIN] })}`
	const endpoint = () => `/user/reset-password/${id}`

	beforeAll(async () => {
		previousSaltRound = process.env.SALT_ROUND
		process.env.SALT_ROUND = '4'
		userModel.schema.set('bufferCommands', false)
		const module = await Test.createTestingModule({
			controllers: [UserController],
			providers: [
				{ provide: USER_REPOSITORY, useValue: repository },
				{ provide: EventEmitter2, useValue: emitter },
				{ provide: JwtService, useValue: jwt },
				{ provide: CACHE_MANAGER, useValue: { get: async () => true } },
				{ provide: getLoggerToken(UserController.name), useValue: logger },
				{ provide: PinoLogger, useValue: logger },
				{ provide: getRepositoryToken(UserEntity, DATA_SOURCE_SYSCLOUD), useValue: { update: sqlUpdate } },
				UpdatedUserListener
			]
		})
			.overrideInterceptor(TransformInterceptor)
			.useValue({ intercept: (_context: ExecutionContext, next: CallHandler) => next.handle() })
			.compile()
		listener = module.get(UpdatedUserListener)
		emitter.on(UPDATED_USER_EVENT, (event: UpdatedUserEvent) => events.push(event))
		app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
		// Supply the single test cookie without loading the cookie plugin's dynamic ESM import in Jest.
		app.getHttpAdapter()
			.getInstance()
			.addHook('onRequest', (request, _reply, done) => {
				request.cookies = { 'access-token': request.headers.cookie?.replace(/^access-token=/, '') }
				done()
			})
		await app.init()
		await app.getHttpAdapter().getInstance().ready()
	})

	beforeEach(() => {
		events.length = 0
		sqlUpdate.mockClear()
		mongoRead = jest.spyOn(userModel.collection, 'findOne').mockResolvedValue({
			_id: id,
			username: 'reset-target',
			password: hashSync('old-password', 4),
			display_name: 'Reset Target',
			roles: [],
			deleted: false
		})
		mongoWrite = jest.spyOn(userModel.collection, 'updateOne').mockResolvedValue({
			acknowledged: true,
			matchedCount: 1,
			modifiedCount: 1,
			upsertedCount: 0,
			upsertedId: null
		})
	})

	afterEach(() => {
		jest.restoreAllMocks()
	})

	afterAll(async () => {
		await app?.close()
		emitter.removeAllListeners()
		if (previousSaltRound === undefined) delete process.env.SALT_ROUND
		else process.env.SALT_ROUND = previousSaltRound
	})

	it('returns six alphanumeric characters, saves bcrypt, and sends plaintext to the MSSQL listener', async () => {
		const response = await app.inject({
			method: 'PATCH',
			url: endpoint(),
			headers: { cookie: adminCookie() }
		})

		expect(response.statusCode).toBe(200)
		const body = response.json<{ password: string }>()
		expect(Object.keys(body)).toEqual(['password'])
		expect(body.password).toMatch(/^[A-Za-z0-9]{6}$/)
		expect(mongoWrite).toHaveBeenCalledTimes(1)
		const storedPassword = mongoWrite.mock.calls[0][1].$set.password
		expect(storedPassword).not.toBe(body.password)
		expect(compareSync(body.password, storedPassword)).toBe(true)
		expect(events).toEqual([new UpdatedUserEvent('reset-target', { password: body.password })])
		await listener.handle(events[0])
		expect(sqlUpdate).toHaveBeenCalledWith({ username: 'reset-target' }, { password: body.password })
	})

	it('rejects unauthenticated callers without changing the user', async () => {
		const response = await app.inject({ method: 'PATCH', url: endpoint() })
		expect(response.statusCode).toBe(401)
		expect(mongoRead).not.toHaveBeenCalled()
		expect(events).toEqual([])
	})

	it('rejects authenticated non-admins without changing the user', async () => {
		const response = await app.inject({
			method: 'PATCH',
			url: endpoint(),
			headers: { cookie: `access-token=${jwt.sign({ username: 'staff', roles: [UserRole.IE_STAFF] })}` }
		})
		expect(response.statusCode).toBe(403)
		expect(mongoRead).not.toHaveBeenCalled()
		expect(events).toEqual([])
	})

	it('rejects malformed user IDs before querying MongoDB', async () => {
		const response = await app.inject({
			method: 'PATCH',
			url: '/user/reset-password/not-an-object-id',
			headers: { cookie: adminCookie() }
		})
		expect(response.statusCode).toBe(422)
		expect(mongoRead).not.toHaveBeenCalled()
		expect(events).toEqual([])
	})

	it('returns 404 for a missing user without emitting a password update', async () => {
		mongoRead.mockResolvedValueOnce(null)
		const response = await app.inject({
			method: 'PATCH',
			url: endpoint(),
			headers: { cookie: adminCookie() }
		})
		expect(response.statusCode).toBe(404)
		expect(mongoRead).toHaveBeenCalledTimes(1)
		expect(mongoWrite).not.toHaveBeenCalled()
		expect(events).toEqual([])
	})

	it('does not emit an event or return a password when MongoDB persistence fails', async () => {
		mongoWrite.mockRejectedValueOnce(new Error('MongoDB write failed'))
		const response = await app.inject({
			method: 'PATCH',
			url: endpoint(),
			headers: { cookie: adminCookie() }
		})
		expect(response.statusCode).toBe(500)
		expect(mongoWrite).toHaveBeenCalledTimes(1)
		expect(response.json()).not.toHaveProperty('password')
		expect(events).toEqual([])
	})

	it('preserves change-password hashing through the shared repository method', async () => {
		const updated = await repository.updatePassword(id, 'replacement-password')
		expect(updated.authenticate('replacement-password')).toBe(true)
		expect(updated.authenticate('old-password')).toBe(false)
		expect(mongoWrite).toHaveBeenCalledTimes(1)
	})
})
