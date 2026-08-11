// src/presentation/filters/order-cannot-be-closed.filter.ts

import { I18nTranslations } from '@generated/i18n.generated'
import { InventoryAuditBlockedException } from '@modules/inventory/domain/exceptions'
import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common'
import { I18nContext } from 'nestjs-i18n'

@Catch(InventoryAuditBlockedException)
export class InventoryAuditExceptionFilter implements ExceptionFilter {
	catch(exception: InventoryAuditBlockedException, host: ArgumentsHost) {
		const i18n = I18nContext.current<I18nTranslations>(host)

		const ctx = host.switchToHttp()
		const response = ctx.getResponse()
		const request = ctx.getRequest()

		// Trả về 409 Conflict hoặc 400 Bad Request tùy quy ước
		response.status(HttpStatus.CONFLICT).json({
			statusCode: HttpStatus.CONFLICT,
			message: 'Không thể kết đơn tại thời điểm này.',
			error: exception.message,
			timestamp: new Date().toISOString(),
			cause: exception.reason
		})
	}
}
