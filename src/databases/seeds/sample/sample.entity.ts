import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

@Entity({ name: 'sample', database: 'master', schema: 'dbo', synchronize: false })
export class SampleEntity {
	@PrimaryGeneratedColumn()
	id: number

	@Column()
	firstName: string

	@Column()
	lastName: string

	@Column()
	email: string
}
