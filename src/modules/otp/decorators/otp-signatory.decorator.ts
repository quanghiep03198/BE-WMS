import { createParamDecorator, ExecutionContext } from '@nestjs/common'

export const OtpSignatory = createParamDecorator((ctx: ExecutionContext) => {
	const request = ctx.switchToHttp().getRequest()
	const employeeCode = request.signatory
	if (!employeeCode) {
		return null
	}
	return employeeCode
})
