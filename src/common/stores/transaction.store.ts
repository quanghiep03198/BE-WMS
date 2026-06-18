import { AsyncLocalStorage } from 'async_hooks'
import { EntityManager } from 'typeorm'

export class TransactionStorage {
	private static storage = new AsyncLocalStorage<EntityManager>()

	// Run a function within the context of a transaction, storing the EntityManager in AsyncLocalStorage
	static run<T>(manager: EntityManager, fn: () => Promise<T>): Promise<T> {
		return this.storage.run(manager, fn)
	}

	// Get EntityManager of current transaction
	static getManager(): EntityManager | undefined {
		return this.storage.getStore()
	}
}
