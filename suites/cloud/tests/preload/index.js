'use strict';
const Docker = require('dockerode');
const { pathExists, ensureFile } = require('fs-extra');
const { exec, spawn } = require('mz/child_process');
const { basename, dirname, join } = require('path');
const Bluebird = require('bluebird');


module.exports = {
	title: 'Image preload test',
    run: async function(test) {
        const socketPath = (await pathExists('/var/run/balena.sock'))
			? '/var/run/balena.sock'
			: '/var/run/docker.sock';

		// We are making use of the docker daemon on the host, so we need to figure out where our image is on the host
		const docker = new Docker({ socketPath });
		const Container = docker.getContainer(
			// Get containerId from inside our container
			(
				await exec(
					'cat /proc/self/cgroup | head -1 | sed -n "s/.*\\([0-9a-z]\\{64\\}\\).*/\\1/p" | tr -d "\n"',
				)
			)[0],
		);
		const Inspect = await Container.inspect();
		const Mount = Inspect.Mounts.find(mount => {
			return mount.Name != null
				? mount.Name.slice(
						mount.Name.length - Inspect.Config.Labels.share.length,
				  ) === Inspect.Config.Labels.share
				: false;
		});

		if (Mount == null || dirname(this.context.get().os.image.path) !== Mount.Destination) {
			throw new Error(
				'OS image not found in the expected volume, cannot preload.',
			);
		}

		// We have to deal with the fact that our image exist on the fs the preloader runs in a different
		// path than where our docker daemon runs. Until we fix the issue on the preloader
		await ensureFile(join(Mount.Source, basename(this.context.get().os.image.path)));


        // get the latest commit from the app
        let commit = await this.context.get().cloud.balena.models.application.get(
            this.context.get().balena.application
            )
            .get('commit')

        // preload the image
		test.comment('Preloading image');
        await this.context.get().cli.preload(this.context.get().os.image.path, {
			app: this.context.get().balena.application,
			commit: commit,
			pin: true,
		});
        /*await exec(`balena preload ${join(Mount.Source, basename(this.context.get().os.image.path))}
            --docker ${socketPath} 
            --app ${this.context.get().balena.application} 
            --commit ${commit}
            --pin-device-to-release
            `
        )*/

        /*await new Promise((resolve, reject) => {
			const output = [];
			const child = spawn(
				'balena',
				[
					`preload ${join(
						Mount.Source,
						basename(this.context.get().os.image.path),
					)} --docker ${socketPath} --app ${this.context.get().balena.application} --commit ${
						commit
					} --pin-device-to-release `,
				],
				{
					stdio: 'pipe',
					shell: true,
				},
			);

			for (const io of ['stdout', 'stderr']) {
				child[io].on('data', data => {
					output.push(data.toString());
				});
			}

			function handleSignal(signal) {
				child.kill(signal);
			}

			process.on('SIGINT', handleSignal);
			process.on('SIGTERM', handleSignal);
			child.on('exit', code => {
				process.off('SIGINT', handleSignal);
				process.off('SIGTERM', handleSignal);
				if (code === 0) {
					resolve();
				} else {
					reject(output.join('\n'));
				}
			});
			child.on('error', err => {
				process.off('SIGINT', handleSignal);
				process.off('SIGTERM', handleSignal);
				reject(err);
			});
		});*/

        // power off DUT
        await this.context.get().worker.off();

        // push new release to app
        test.comment(`Pushing release to app...`)
		await exec(`balena push ${this.context.get().balena.application} --source ${__dirname}/../../app`)

        //check new commit of app 
        let newCommit = await this.context.get().cloud.balena.models.application.get(
            this.context.get().balena.application
            )
            .get('commit')

        test.comment(`New application commit is ${newCommit}`);
        
        await this.context.get().worker.flash(this.context.get().os.image.path)
        await this.context.get().worker.on()
        
        // power on DUT, should see it pinned to the old release
        await this.context.get().utils.waitUntil(() => {
			return this.context
				.get()
				.cloud.balena.models.device.isOnline(this.context.get().balena.uuid);
		}, false);

        let deviceCommit = null
        
        await this.context.get().utils.waitUntil(async () => {
            test.comment("Checking device commit...")
            deviceCommit = await this.context.get().cloud.balena.models.device.get(
                this.context.get().balena.uuid
                )
                .get('is_on__commit')
            return deviceCommit === commit
        },false);
    

        test.is(deviceCommit, commit, `Preload commit hash should be ${commit}`);
        // check that there is nothing being downloaded??

        // unpin device from release after so next tests aren't interfered with
        await this.context.get().cloud.balena.models.device.trackApplicationRelease(
            this.context.get().balena.uuid
        )
    }
}    
