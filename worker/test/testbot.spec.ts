import 'mocha';
import * as _ from 'lodash';
import * as Bluebird from 'bluebird';
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import { withFile } from 'tmp-promise';
import * as TestBotMocked from './mock/testbot.json';
import * as TestBot from '../lib/workers/testbot';
import * as helpers from '../lib/helpers';
import { ImportMock } from 'ts-mock-imports';
import { ARDUINO, TransportStub, comparePinStates } from './testbot';
import { Pins } from 'firmata';
import { sourceDestination } from 'etcher-sdk';
import { join } from 'path';
import { fs } from 'mz';

chai.use(chaiAsPromised);

const { expect } = chai;

describe('Testbot', () => {
	let transport: TransportStub;
	let testBot: TestBot.default;
	let initialPinState: Pins[];
	let readyPinState: Pins[];

	beforeEach(async () => {
		transport = new TransportStub();
		testBot = new TestBot.default(
			{ devicePath: transport },
			{
				diskDev: '/dev/null',
			},
		);

		// Accessing private property
		// Firmata requires a version report before accepting any HW configuration
		testBot['board'].emit('reportversion');

		// Send testbot pin configuration to firmata
		transport.emit(
			'data',
			[ARDUINO.START_SYSEX, ARDUINO.CAPABILITY_RESPONSE]
				.concat(TestBotMocked.pins)
				.concat(ARDUINO.END_SYSEX),
		);

		initialPinState = _.cloneDeep(testBot['board'].pins);

		const action = testBot.ready();
		await Bluebird.delay(20);
		// Fake board init
		testBot['board'].emit('ready');
		await action;

		readyPinState = _.cloneDeep(testBot['board'].pins);
	});

	it('should show the correct READY pin state', () => {
		expect(
			comparePinStates(testBot['board'].pins, initialPinState),
		).be.deep.equal([
			{
				index: 13,
				pin: { supportedModes: [0, 1, 4, 11], mode: 1, value: 0, report: 1 },
			},
			{
				index: 28,
				pin: { supportedModes: [0, 1, 4, 11], mode: 1, value: 0, report: 1 },
			},
			{
				index: 29,
				pin: {
					supportedModes: [0, 1, 3, 4, 11],
					mode: 1,
					value: 0,
					report: 1,
				},
			},
		]);
	});

	it('should show the correct ON pin state', async () => {
		await testBot.powerOn();

		expect(
			comparePinStates(testBot['board'].pins, readyPinState),
		).to.have.length(0);
	});

	it('should show the correct OFF pin state', async () => {
		await testBot.powerOff();

		expect(
			comparePinStates(testBot['board'].pins, readyPinState),
		).be.deep.equal([
			{
				index: 13,
				pin: { supportedModes: [0, 1, 4, 11], mode: 1, value: 1, report: 1 },
			},
			{
				index: 28,
				pin: { supportedModes: [0, 1, 4, 11], mode: 1, value: 1, report: 1 },
			},
		]);
	});

	it('should show correct FLASH pin state', async () => {
		await withFile(async file => {
			ImportMock.mockFunction(
				helpers,
				'getDrive',
				new sourceDestination.File(
					file.path,
					sourceDestination.File.OpenFlags.ReadWrite,
				),
			);

			await testBot.flash(fs.createReadStream(join(__dirname, 'image.zip')));
		});

		expect(
			comparePinStates(testBot['board'].pins, readyPinState),
		).be.deep.equal([
			{
				index: 13,
				pin: { supportedModes: [0, 1, 4, 11], mode: 1, value: 1, report: 1 },
			},
			{
				index: 28,
				pin: { supportedModes: [0, 1, 4, 11], mode: 1, value: 1, report: 1 },
			},
		]);
	});

	it('should hook global SIGINT handler when turned ON and un-hook when turned OFF', async () => {
		await testBot.powerOn();

		expect(process.listeners('SIGINT')).to.contain(testBot['signalHandler']);

		await testBot.powerOff();

		expect(process.listeners('SIGINT')).to.not.contain(
			testBot['signalHandler'],
		);
	});

	it('should hook global SIGTERM handler when turned ON and un-hook when turned OFF', async () => {
		await testBot.powerOn();

		expect(process.listeners('SIGTERM')).to.contain(testBot['signalHandler']);

		await testBot.powerOff();

		expect(process.listeners('SIGTERM')).to.not.contain(
			testBot['signalHandler'],
		);
	});

	after(async () => {
		await testBot.disconnect();
	});
});
