import { FLUSH_CACHE_PATTERNS, FlushCacheInterceptor } from '@common/interceptors'
import { applyDecorators, SetMetadata, UseInterceptors } from '@nestjs/common'

/**
 * Flush the specified cache patterns before an HTTP handler runs.
 * @example @FlushCache('something:*')
 */
export const FlushCache = (...patterns: string[]) =>
	applyDecorators(SetMetadata(FLUSH_CACHE_PATTERNS, patterns), UseInterceptors(FlushCacheInterceptor))
