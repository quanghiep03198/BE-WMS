// Unit tests for: welcome

import { AppController } from './app.controller'

describe('AppController.welcome() welcome method', () => {
	let appController: AppController

	beforeEach(() => {
		appController = new AppController()
	})

	describe('Happy Path', () => {
		it('should return "Hello World" when called', () => {
			// Arrange & Act
			const result = appController.welcome()

			// Assert
			expect(result).toBe('Hello World')
		})
	})

	describe('Edge Cases', () => {
		// Since the method is simple and does not take any parameters or have any complex logic,
		// there are no edge cases to test. However, this section is included for completeness
		// and future-proofing if the method's complexity increases.
	})
})
