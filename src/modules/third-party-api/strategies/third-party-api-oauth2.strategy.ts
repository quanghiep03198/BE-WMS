import { env } from '@/common/utils'
import { Injectable } from '@nestjs/common'
import { OAuth2Credentials } from '../interfaces/third-party-api.interface'

export interface OAuth2Strategy {
	getCredentials(): Record<'client_id' | 'client_secret', string>
}

@Injectable()
export class GL1OAuth2Strategy implements OAuth2Strategy {
	public getCredentials(): OAuth2Credentials {
		return {
			client_id: env('GL1_CLIENT_ID'),
			client_secret: env('GL1_CLIENT_SECRET')
		}
	}
}

@Injectable()
export class GL3OAuth2Strategy implements OAuth2Strategy {
	public getCredentials(): OAuth2Credentials {
		return {
			client_id: env('GL3_CLIENT_ID'),
			client_secret: env('GL3_CLIENT_SECRET')
		}
	}
}

@Injectable()
export class GL4OAuth2Strategy implements OAuth2Strategy {
	public getCredentials(): OAuth2Credentials {
		return {
			client_id: env('GL4_CLIENT_ID'),
			client_secret: env('GL4_CLIENT_SECRET')
		}
	}
}
