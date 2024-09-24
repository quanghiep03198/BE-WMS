import { Controller, Get, HttpStatus } from '@nestjs/common'
import { UseBaseAPI } from './common/decorators/base-api.decorator'

@Controller()
export class AppController {
	@Get('welcome')
	@UseBaseAPI(HttpStatus.OK, 'Ok')
	welcome() {
		return 'Hello World!'
	}
}
