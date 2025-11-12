import z from 'zod'

export const deleteOneByIdDTO = z.number().int().nonnegative()
export const deleteManyByIdsDTO = z.array(deleteOneByIdDTO)

export const restoreOneByIdDTO = deleteOneByIdDTO
export const restoreManyByIdsDTO = deleteManyByIdsDTO

export type DeleteOneByIdDTO = z.infer<typeof deleteOneByIdDTO>
export type DeleteManyByIdsDTO = z.infer<typeof deleteManyByIdsDTO>
export type RestoreOneByIdDTO = z.infer<typeof restoreOneByIdDTO>
export type RestoreManyByIdsDTO = z.infer<typeof restoreManyByIdsDTO>
