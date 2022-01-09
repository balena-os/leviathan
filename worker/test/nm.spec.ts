import 'mocha';
import * as _ from 'lodash';
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import NetworkManager from '../lib/nm';
import * as dbus from 'dbus-as-promised';
import { createSandbox } from 'sinon';

chai.use(chaiAsPromised);

const { expect } = chai;

describe('NetworkManager', () => {
	const box = createSandbox();
	let network: NetworkManager;

	beforeEach(() => {
		box.stub(dbus, 'getBus').returns({
			disconnect: () => {
				//
			},
		});

		network = new NetworkManager({
			apWifiIface: 'wlan99',
			apWiredIface: 'eth99',
		});
	});

	it('generateId should generate a 8 character long id', () => {
		// Accesing private memeber for tesing
		const id = NetworkManager['generateId']();

		// check that each charter is in the right range
		expect(id).to.match(/^[\x00-\x7F]*$/);
		expect(id).to.have.length(8);
	});

	it('addWiredConnection should configure connection corectly with internet acessc', async () => {
		const removeStub = box.stub(network, 'removeWiredConnection');
		// Spying on private methods
		const activateStub = box.stub(network as any, 'activateConnection');
		const addStub = box.stub(network as any, 'addConnection');
		const deviceStub = box.stub(network as any, 'getDevice');

		await network.addWiredConnection({ nat: true });

		expect(removeStub.callCount).to.be.equal(0);

		[addStub, activateStub, deviceStub].forEach((stub) => {
			expect(stub.callCount).to.be.equal(1);
		});

		expect(addStub.args[0][0].ipv4.method).to.be.equal('shared');
	});

	it('addWiredConnection should configure connection corectly without internet acessc', async () => {
		const removeStub = box.stub(network, 'removeWiredConnection');
		// Spying on private methods
		const activateStub = box.stub(network as any, 'activateConnection');
		const addStub = box.stub(network as any, 'addConnection');
		const deviceStub = box.stub(network as any, 'getDevice');

		await network.addWiredConnection({ nat: false });

		expect(removeStub.callCount).to.be.equal(0);

		[addStub, activateStub, deviceStub].forEach((stub) => {
			expect(stub.callCount).to.be.equal(1);
		});

		expect(addStub.args[0][0].ipv4.method).to.be.equal('link-local');
	});

	it('addWiredConnection should remove old connection and add new one', async () => {
		network['wiredReference'] = { conn: 'fake', activeConn: 'fake' };

		// Spying on private methods
		const spies = [
			box.stub(network, 'removeWiredConnection'),
			box.stub(network as any, 'activateConnection'),
			box.stub(network as any, 'addConnection'),
			box.stub(network as any, 'getDevice'),
		];

		await network.addWiredConnection({ nat: false });

		spies.forEach((spy) => {
			expect(spy.callCount).to.be.equal(1);
		});
	});

	it('addWiredConnection should throw if wired ap is not configured', async () => {
		network['options'] = undefined;

		// Spying on private methods
		const spies = [
			box.stub(network, 'removeWiredConnection'),
			box.stub(network as any, 'activateConnection'),
			box.stub(network as any, 'addConnection'),
			box.stub(network as any, 'getDevice'),
		];

		expect(network.addWiredConnection({ nat: true })).to.rejectedWith(
			Error,
			'Wired AP unconfigured',
		);
		spies.forEach((spy) => {
			expect(spy.callCount).to.be.equal(0);
		});
	});

	it('addWirelessConnection should configure connection corectly without internet acessc', async () => {
		const removeStub = box.stub(network, 'removeWirelessConnection');
		// Spying on private methods
		const activateStub = box.stub(network as any, 'activateConnection');
		const addStub = box.stub(network as any, 'addConnection');
		const deviceStub = box.stub(network as any, 'getDevice');

		await network.addWirelessConnection({
			ssid: 'tesing',
			psk: 'secret',
			nat: false,
		});

		expect(removeStub.callCount).to.be.equal(0);

		[addStub, activateStub, deviceStub].forEach((stub) => {
			expect(stub.callCount).to.be.equal(1);
		});

		expect(addStub.args[0][0].ipv4.method).to.be.equal('link-local');
	});

	it('addWirelessConnection should configure connection corectly with internet acessc', async () => {
		const removeStub = box.stub(network, 'removeWirelessConnection');
		// Spying on private methods
		const activateStub = box.stub(network as any, 'activateConnection');
		const addStub = box.stub(network as any, 'addConnection');
		const deviceStub = box.stub(network as any, 'getDevice');

		await network.addWirelessConnection({
			ssid: 'tesing',
			psk: 'secret',
			nat: true,
		});

		expect(removeStub.callCount).to.be.equal(0);

		[addStub, activateStub, deviceStub].forEach((stub) => {
			expect(stub.callCount).to.be.equal(1);
		});

		expect(addStub.args[0][0].ipv4.method).to.be.equal('shared');
	});

	it('addWirelessConnection should throw if wireless ap is not configured', async () => {
		network['options'] = undefined;

		// Spying on private methods
		const spies = [
			box.stub(network, 'removeWiredConnection'),
			box.stub(network as any, 'activateConnection'),
			box.stub(network as any, 'addConnection'),
			box.stub(network as any, 'getDevice'),
		];

		expect(
			network.addWirelessConnection({
				ssid: 'testing',
				psk: 'secret',
				nat: true,
			}),
		).to.rejectedWith(Error, 'Wireless AP unconfigured');

		spies.forEach((spy) => {
			expect(spy.callCount).to.be.equal(0);
		});
	});

	it('addWirelessConnection should remove old connection and add new one', async () => {
		network['wirelessReference'] = { conn: 'fake', activeConn: 'fake' };

		// Spying on private methods
		const spies = [
			box.stub(network, 'removeWirelessConnection'),
			box.stub(network as any, 'activateConnection'),
			box.stub(network as any, 'addConnection'),
			box.stub(network as any, 'getDevice'),
		];

		await network.addWirelessConnection({
			ssid: 'testing',
			psk: 'secret',
			nat: false,
		});

		spies.forEach((spy) => {
			expect(spy.callCount).to.be.equal(1);
		});
	});

	it('removeWiredConnection should deactivate and remove connection', async () => {
		network['wiredReference'] = { conn: 'fake', activeConn: 'fake' };

		// Spying on private methods
		const spies = [
			box.stub(network as any, 'removeConnection'),
			box.stub(network as any, 'deactivateConnection'),
		];

		await network.removeWiredConnection();

		spies.forEach((spy) => {
			expect(spy.callCount).to.be.equal(1);
		});
		expect(network['wiredReference']).to.be.undefined;
	});

	it('removeWirelessConnection should deactivate and remove connection', async () => {
		network['wirelessReference'] = { conn: 'fake', activeConn: 'fake' };

		// Spying on private methods
		const spies = [
			box.stub(network as any, 'removeConnection'),
			box.stub(network as any, 'deactivateConnection'),
		];

		await network.removeWirelessConnection();

		spies.forEach((spy) => {
			expect(spy.callCount).to.be.equal(1);
		});
		expect(network['wirelessReference']).to.be.undefined;
	});

	afterEach(async () => {
		box.restore();
		box.stub(network as any, 'removeWirelessConnection');
		box.stub(network as any, 'removeWiredConnection');

		await network.disconnect();

		box.restore();
	});
});
