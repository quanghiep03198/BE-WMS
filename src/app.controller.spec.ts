import { Test, TestingModule } from '@nestjs/testing'
import { Response } from 'express'
import { AppController } from './app.controller'

describe('AppController', () => {
	let appController: AppController

	beforeEach(async () => {
		const app: TestingModule = await Test.createTestingModule({
			controllers: [AppController]
		}).compile()

		appController = app.get<AppController>(AppController)
	})

	it('should redirect to the Postman documentation', () => {
		const res = {
			redirect: jest.fn()
		} as unknown as Response

		appController.index(res)

		expect(res.redirect).toHaveBeenCalledWith('https://documenter.getpostman.com/view/24228770/2sAYBYfVys')
	})
})
