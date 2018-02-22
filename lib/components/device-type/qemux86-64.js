'use strict'

const Bluebird = require('bluebird')
const childProcess = require('child_process')

const childKillEventHandler = (child, event) => {
  process.on(event, (code) => {
    child.kill()
    process.exit(code || 0)
  })
}

exports.provision = async (imagePath) => {
  console.log('Starting qemu machine...')
  return new Bluebird((resolve) => {
    const qemu = childProcess.spawn('qemu-system-x86_64', [
      '-drive', `file=${imagePath},media=disk,cache=none,format=raw`,
      '-net', 'nic,model=virtio',
      '-net', 'user',
      '-m', '512',
      '-nographic',
      '-machine', 'type=pc',
      '-smp', '4'
    ])

    childKillEventHandler(qemu, 'SIGINT')
    childKillEventHandler(qemu, 'SIGTERM')
    childKillEventHandler(qemu, 'exit')
    childKillEventHandler(qemu, 'uncaughtException')
    resolve()
  })
}
