import 'mocha';
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import { ImportMock } from 'ts-mock-imports';
import * as drivelist from 'drivelist';
import * as helpers from '../lib/helpers';

chai.use(chaiAsPromised);

const { expect } = chai;

describe('getDrive', () => {
	beforeEach(function() {
		this.stub = ImportMock.mockFunction(drivelist, 'list', [
			{
				device: '/dev/sda',
				displayName: '/dev/sda',
				size: 1,
				isSystem: true,
				isRemovable: false,
			},
			{
				device: '/dev/sdb',
				displayName: '/dev/sdb',
				size: 2,
				isSystem: false,
				isRemovable: false,
			},
		]);
	});

	it('should return selected drive', async () => {
		const search = '/dev/sdb';

		expect(helpers.getDrive(search))
			.to.eventually.have.property('device')
			.to.be.equal(search);
	});

	it('should not select system drive', async () => {
		const search = '/dev/sda';

		expect(helpers.getDrive(search)).to.be.rejectedWith(
			`Cannot find ${search}`,
		);
	});

	afterEach(function() {
		this.stub.restore();
	});
});
