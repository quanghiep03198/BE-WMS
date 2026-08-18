import { ModuleMetadata, Type } from '@nestjs/common'

export type CdcOperation = 'insert' | 'update' | 'delete'

export interface CdcModuleOptions {
	configs: CdcTableConfig[]
	imports?: any[] // module chứa dependency của handler (CqrsModule, CameraModule...)
	mongooseConnectionName?: string
}

export interface CdcTableConfig {
	table: string
	captureInstance: string
	redisCheckpointKey: string
	pollIntervalMs: number
	handler: ICdcHandler
	lockTtlMs?: number
}

export interface CdcProvisionConfig {
	dataSourceToken: string
	schema: string
	sourceName: string
	roleName?: string | null
	capturedColumns: string[]
	supportsNetChanges: boolean
}

export interface ICdcHandler<TRow = any> {
	handle(context: CdcChangeContext<TRow>): Promise<void>
}
export interface CdcModuleOptionsFactory {
	createCdcOptions(): Promise<CdcProvisionConfig[]> | CdcProvisionConfig[]
}

export interface CdcModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
	useFactory?: (...args: any[]) => Promise<CdcProvisionConfig[]> | CdcProvisionConfig[]
	useClass?: Type<CdcModuleOptionsFactory>
	useExisting?: Type<CdcModuleOptionsFactory>
	inject?: any[]
}

export interface CdcChangeRecord<TRow = any> {
	operation: CdcOperation
	row: TRow
	lsn: Buffer
}

export interface CdcChangeContext<TRow = any> {
	table: string
	changes: CdcChangeGroup<TRow>[]
}

export interface CdcChangeGroup<TRow = any> {
	operation: CdcOperation
	data: TRow[]
	lsn: string // hex string, ví dụ: '00016add0002e97e0013'
}

export interface CdcChangeHandler<TRow = any> {
	handle(context: CdcChangeContext<TRow>): Promise<void>
}
