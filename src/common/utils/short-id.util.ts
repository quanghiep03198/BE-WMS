import { customAlphabet } from 'nanoid'

export const generateShortId = customAlphabet('0123456789', 6)

console.log(generateShortId())
