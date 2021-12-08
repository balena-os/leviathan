import 'mocha';
import * as _ from 'lodash';
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as TestBot from '../lib/workers/testbot';
import * as NetworkManager from '../lib/nm';
import setup from '../lib/index';
import { ImportMock, MockManager } from 'ts-mock-imports';

import chaiHttp = require('chai-http');

chai.use(chaiHttp);
chai.use(chaiAsPromised);

const { expect } = chai;

describe('API', async () => {
	let mockWorker: {
		testbot: MockManager<TestBot.default>;
		network: MockManager<NetworkManager.default>;
	};
	let app: Express.Application;

	beforeEach(async () => {
		mockWorker = {
			testbot: ImportMock.mockClass<TestBot.default>(TestBot, 'default'),
			network: ImportMock.mockClass<NetworkManager.default>(
				NetworkManager,
				'default',
			),
		};
		app = await setup({
			testbot: { devicePath: '/fake' },
			network: {
				apWifiIface: 'wlan0',
				apWiredIface: 'eth0',
			},
		});
	});

	const errTest = new Error('TEST ERROR');

	it('call /dut/on should turn testbot ON', async () => {
		const spy = mockWorker.testbot.mock('powerOn');

		const res = await chai.request(app).post('/dut/on');

		expect(res.text).to.be.equal('OK');
		expect(res).to.have.status(200);
		expect(spy.callCount).to.be.equal(1);
	});

	it('call /dut/on should handle errors correctly', async () => {
		const spy = mockWorker.testbot.mock('powerOn').rejects(errTest);

		const res = await chai.request(app).post('/dut/on');

		expect(res.text).to.be.equal(errTest.message);
		expect(res).to.have.status(500);
		expect(spy.callCount).to.be.equal(1);
	});

	it('call /dut/off should turn testbot off', async () => {
		const spy = mockWorker.testbot.mock('powerOff');

		const res = await chai.request(app).post('/dut/off');

		expect(res.text).to.be.equal('OK');
		expect(res).to.have.status(200);
		expect(spy.callCount).to.be.equal(1);
	});

	it('call /dut/off should handle errors correctly', async () => {
		const spy = mockWorker.testbot.mock('powerOff').rejects(errTest);

		const res = await chai.request(app).post('/dut/off');

		expect(res.text).to.be.equal(errTest.message);
		expect(res).to.have.status(500);
		expect(spy.callCount).to.be.equal(1);
	});

	it('call /dut/flash should turn testbot flash', async () => {
		const spy = mockWorker.testbot.mock('flash');

		const res = await chai.request(app).post('/dut/flash');

		expect(res).to.have.status(202);
		expect(spy.callCount).to.be.equal(1);
	});

	it('call /dut/network should correctly create wired and wireless connections', async () => {
		const spies = [
			mockWorker.network.mock('addWiredConnection'),
			mockWorker.network.mock('addWirelessConnection'),
		];

		const res = await chai
			.request(app)
			.post('/dut/network')
			.send({
				wired: { nat: true },
				wireless: { ssid: 'test', psk: 'secret' },
			});

		expect(res).to.have.status(200);
		spies.forEach((spy) => {
			expect(spy.callCount).to.be.equal(1);
		});
	});

	it('call /dut/network should correctly remove wired and wireless connections', async () => {
		const spies = [
			mockWorker.network.mock('removeWiredConnection'),
			mockWorker.network.mock('removeWirelessConnection'),
		];

		const res = await chai.request(app).post('/dut/network').send({});

		expect(res).to.have.status(200);
		spies.forEach((spy) => {
			expect(spy.callCount).to.be.equal(1);
		});
	});

	it('call /dut/network should throw error if wireless configuration is incomplete', async () => {
		const spies = [
			mockWorker.network.mock('addWiredConnection'),
			mockWorker.network.mock('addWirelessConnection'),
			mockWorker.network.mock('removeWiredConnection'),
			mockWorker.network.mock('removeWirelessConnection'),
		];

		const res = await chai
			.request(app)
			.post('/dut/network')
			.send({ wired: { nat: true }, wireless: { ssid: 'test' } });

		expect(res.text).to.be.equal('Wireless configuration incomplete');
		expect(res).to.have.status(500);
		spies.forEach((spy) => {
			expect(spy.callCount).to.be.equal(0);
		});
	});

	afterEach(() => {
		mockWorker.testbot.restore();
		mockWorker.network.restore();
	});
});
