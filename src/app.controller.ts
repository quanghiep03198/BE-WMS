import { Controller, Get, Res } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Response } from 'express'
import { I18nContext, I18nService } from 'nestjs-i18n'

@Controller()
export class AppController {
	constructor(
		private readonly configService: ConfigService,
		private readonly i18nService: I18nService
	) {}

	@Get()
	index(@Res() res: Response) {
		if (this.configService.get('NODE_ENV') === 'development')
			return res.redirect(this.configService.get<string>('POSTMAN_DOCUMENTATION_URL'))
		else
			return res.json({
				message: this.i18nService.t('common.ok', { lang: I18nContext.current()?.lang }),
				statusCode: 200
			})
	}
}
