import { type PaginationDTO } from '../dto/pagination.dto'

export interface IBaseRepository<
	TEntity,
	TId,
	TFilter = Partial<TEntity>,
	TPaginationOptions = PaginationDTO,
	TCreateManyResult = TEntity[],
	TUpdateResult = unknown,
	TDeleteOneResult = unknown,
	TDeleteManyResult = TDeleteOneResult,
	TSoftDeleteResult = TDeleteManyResult,
	TRestoreResult = TUpdateResult
> {
	createOne(payload: Partial<Omit<TEntity, '_id' | 'id'>>): Promise<TEntity>
	insertMany(payload: Partial<Omit<TEntity, '_id' | 'id'>>[]): Promise<TCreateManyResult>
	findAll(): Promise<TEntity[]>
	findOne(filter: TFilter): Promise<TEntity | null>
	findOneById(id: TId): Promise<TEntity | null>
	updateOneById(id: TId, payload: Partial<TEntity>): Promise<TUpdateResult>
	deleteOneById(id: TId): Promise<TDeleteOneResult>
	deleteManyByIds(ids: TId[]): Promise<TDeleteManyResult>
	softDeleteOneById(id: TId): Promise<TSoftDeleteResult>
	softDeleteManyByIds(ids: TId[]): Promise<TSoftDeleteResult>
	restoreOneById(id: TId): Promise<TRestoreResult>
	restoreManyByIds(ids: TId[]): Promise<TRestoreResult>
	paginate(filter: TFilter, options: TPaginationOptions): Promise<Pagination<TEntity>>
}
