import { Controller } from '@nestjs/common'
import { Api, HttpMethod } from './common/decorators/api.decorator'

@Controller()
export class AppController {
	@Api({ method: HttpMethod.GET })
	welcome() {
		return 'Hello World'
	}
}
