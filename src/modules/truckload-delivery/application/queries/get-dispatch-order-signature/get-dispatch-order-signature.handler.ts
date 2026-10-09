import { Inject, NotFoundException } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { ISignatureStorage, SIGNATURE_STORAGE, StoredSignature } from '../../ports/signature-storage.port'
import { GetDispatchOrderSignatureQuery } from './get-dispatch-order-signature.query'

@QueryHandler(GetDispatchOrderSignatureQuery)
export class GetDispatchOrderSignatureHandler implements IQueryHandler<
	GetDispatchOrderSignatureQuery,
	StoredSignature
> {
	constructor(@Inject(SIGNATURE_STORAGE) private readonly storage: ISignatureStorage) {}

	async execute({ signatureId }: GetDispatchOrderSignatureQuery): Promise<StoredSignature> {
		const signature = await this.storage.download(signatureId)
		if (!signature) throw new NotFoundException('Signature not found')
		return signature
	}
}
