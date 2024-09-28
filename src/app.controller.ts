import { Controller, Get, HttpStatus } from '@nestjs/common'
import { UseBaseAPI } from './common/decorators/base-api.decorator'

@Controller()
export class AppController {
	@Get()
	@UseBaseAPI(HttpStatus.OK, { i18nKey: 'common.ok' })
	welcome() {
		return 'Hello World'
	}
}
