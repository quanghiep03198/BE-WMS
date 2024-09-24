import { RFIDCustomerEntity } from '@/modules/rfid/entities/rfid-customer.entity'
import { omit } from 'lodash'
import crypto from 'node:crypto'
import { setSeederFactory } from 'typeorm-extension'

export const rfidCustomerFactory = setSeederFactory(RFIDCustomerEntity, (faker) => {
	const rfidCustomer = new RFIDCustomerEntity({})
	rfidCustomer.epc = '3034' + crypto.randomBytes(16).toString('hex').toUpperCase()
	rfidCustomer.mo_no = '13A05B' + faker.number.int({ min: 101, max: 110 }).toString()

	const defaultValues = omit(rfidCustomer, ['epc', 'mo_no', 'created', 'updated'])
	for (const prop in defaultValues) {
		defaultValues[prop] = `SAMPLE_${prop.toUpperCase()}_VALUE`
	}
	return { ...defaultValues, ...rfidCustomer }
})