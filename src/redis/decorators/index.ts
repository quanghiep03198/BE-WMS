import { Inject } from '@nestjs/common'
import { REDIS_CLIENT, REDIS_PUBLISHER, REDIS_SUBSCRIBER } from '../constants'

export const InjectRedisClient = (): ParameterDecorator => Inject(REDIS_CLIENT)
export const InjectPublisher = (): ParameterDecorator => Inject(REDIS_PUBLISHER)
export const InjectSubscriber = (): ParameterDecorator => Inject(REDIS_SUBSCRIBER)
