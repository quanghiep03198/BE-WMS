import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common'

@Injectable()
export class TransformUppercasePipe implements PipeTransform<string, string> {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	transform(value: string, _metadata: ArgumentMetadata): string {
		if (!value) {
			throw new BadRequestException('Validation failed')
		}
		const val = value.toUpperCase()
		return val
	}
}
