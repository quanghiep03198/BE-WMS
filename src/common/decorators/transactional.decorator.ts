import { TransactionRegistry } from '../stores/transaction.registry'
import { TransactionStorage } from '../stores/transaction.store'

export function Transactional(connectionName: string): MethodDecorator {
	return function (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
		const originalMethod = descriptor.value

		descriptor.value = async function (...args: any[]) {
			const dataSource = TransactionRegistry.getDataSource(connectionName)

			const queryRunner = dataSource.createQueryRunner()
			await queryRunner.connect()
			await queryRunner.startTransaction()

			try {
				const result = await TransactionStorage.run(queryRunner.manager, async () => {
					return await originalMethod.apply(this, args)
				})
				await queryRunner.commitTransaction()
				return result
			} catch (error) {
				await queryRunner.rollbackTransaction()
				throw error
			} finally {
				await queryRunner.release()
			}
		}
		return descriptor
	}
}
