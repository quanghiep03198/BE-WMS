// infrastructure/persistence/transaction/transaction.registry.ts
import { DataSource } from 'typeorm'

export class TransactionRegistry {
	private static dataSources = new Map<string, DataSource>()

	static register(name: string, dataSource: DataSource) {
		this.dataSources.set(name, dataSource)
	}

	static getDataSource(name: string): DataSource {
		const ds = this.dataSources.get(name)
		if (!ds) {
			throw new Error(`DataSource với tên "${name}" chưa được đăng ký trong TransactionRegistry!`)
		}
		return ds
	}
}
