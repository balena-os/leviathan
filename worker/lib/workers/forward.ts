import * as Bluebird from 'bluebird';
import * as net from 'net';
import * as mdns from 'multicast-dns';
import { networkInterfaces } from 'os';

class PortForward {
	private servers: net.Server[] = [];

	public destroy() {
		this.servers.forEach(server => {
			if (server != null) {
				server.close();
			}
		});
	}

	private static resolveLocalTarget(target: string): PromiseLike<string> {
		return new Bluebird((resolve, reject) => {
			if (/\.local$/.test(target)) {
				const sockets: any[] = [];

				const nics = networkInterfaces();
				for (const i in nics) {
					for (const j in nics[i]) {
						if (nics[i][j].family === 'IPv4') {
							sockets.push(mdns({ interface: nics[i][j].address }));
						}
					}
				}

				if (sockets.length === 0) {
					throw new Error('Did not find any network interfaces on this device');
				}

				function destroy(socks: any[]) {
					socks.forEach(sock => {
						sock.destroy();
					});
				}

				const timeout = setTimeout(() => {
					destroy(sockets);
					reject(new Error(`Could not resolve ${target}`));
				}, 4000);

				sockets.forEach(socket => {
					socket.on('error', () => {
						clearTimeout(timeout);
						destroy(sockets);
						reject();
					});
					socket.on('response', function(response: any) {
						const answer = response.answers.find(
							(x: any) => x.name === target && x.type === 'A',
						);

						if (answer != null) {
							clearTimeout(timeout);
							destroy(sockets);
							resolve(answer.data);
						}
					});

					socket.query([{ type: 'A', name: target }]);
				});
			} else {
				resolve(target);
			}
		});
	}

	async forward(from: string, to: string) {
		const addrRegex = /^((?<addr>[a-zA-Z\-\.0-9]+):)?(?<port>\d+)$/;

		let parsed = {
			from: addrRegex.exec(from),
			to: addrRegex.exec(to),
		};

		if (parsed.to == null || parsed.to.groups == null) {
			throw new Error('Invalid tunnel startpoint');
		}

		const host = await PortForward.resolveLocalTarget(parsed.to.groups.addr);
		const port = parseInt(parsed.to.groups.port);

		this.servers.push(
			await new Bluebird((resolve, reject) => {
				const server = net.createServer(function(fromS) {
					const toS = net.createConnection({
						host,
						port,
					});

					toS.on('error', console.log);
					fromS.on('error', console.log);
					fromS.pipe(
						toS,
						{ end: false },
					);
					toS.pipe(
						fromS,
						{ end: false },
					);
				});
				server.on('error', reject);
				server.on('listening', () => {
					resolve(server);
				});

				if (parsed.from == null || parsed.from.groups == null) {
					reject(new Error('Invalid tunnel endpoint'));
				} else {
					server.listen(parseInt(parsed.from.groups.port));
				}
			}),
		);
	}
}

export default PortForward;
