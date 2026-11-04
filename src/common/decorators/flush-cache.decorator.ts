import { FLUSH_CACHE_PATTERNS, FlushCacheInterceptor } from '@common/interceptors'
import { applyDecorators, SetMetadata, UseInterceptors } from '@nestjs/common'

/**
 * Add this decorator to a controller or handler to flush cache patterns specified.
 * @example @FlushCache('something:*')
 */
export const FlushCache = (...patterns: string[]) =>
	applyDecorators(SetMetadata(FLUSH_CACHE_PATTERNS, patterns), UseInterceptors(FlushCacheInterceptor))
