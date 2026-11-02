import { FLUSH_CACHE_PATTERNS, FlushCacheInterceptor } from '@common/interceptors'
import { applyDecorators, SetMetadata, UseInterceptors } from '@nestjs/common'

/**
 * Gắn lên controller hoặc handler.
 * @example @FlushCache('cached:total:defective_goods:*')
 */
export const FlushCache = (...patterns: string[]) =>
	applyDecorators(SetMetadata(FLUSH_CACHE_PATTERNS, patterns), UseInterceptors(FlushCacheInterceptor))
