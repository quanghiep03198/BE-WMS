import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common'

@Injectable()
export class TransformUppercasePipe implements PipeTransform<string, string> {
	transform(value: string, _metadata: ArgumentMetadata): string {
		if (!value) {
			throw new BadRequestException('Validation failed')
		}
		const val = value.toUpperCase()
		return val
	}
}
