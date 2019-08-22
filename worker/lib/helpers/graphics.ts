import { spawn, ChildProcess } from 'child_process';
import { ensureDir, remove } from 'fs-extra';
import { connect } from 'net';
import { basename } from 'path';
import { pack } from 'tar-fs';
import { Readable } from 'stream';
import { createGzip } from 'zlib';

// This class is awrapper around a simple gstreamer pipe to capture a source into individual frames
export default class ScreenCapture {
  private proc?: ChildProcess;
  private exit: {
    reason?: string;
    details: {
      error?: Error;
      stdout: string;
      stderr: string;
      code: number | null;
    };
  };

  constructor(public source: { type: string; options?: any }, public destination: string) {
    this.exit = {
      details: {
        stdout: '',
        stderr: '',
        code: null
      }
    };
  }

  public async startCapture(): Promise<void> {
    await ensureDir(this.destination);

    const gstreamerHandle = () => {
      this.proc = spawn(
        'gst-launch-1.0',
        [
          `${this.parseSource()} ! jpegenc quality=10 ! multifilesink location="${
            this.destination
          }/%06d.jpg"`
        ],
        {
          shell: '/bin/bash'
        }
      );
      this.proc.stdout.on('data', data => {
        this.exit.details.stdout += `${data.toString('utf-8')}\n`;
      });
      this.proc.stderr.on('data', data => {
        this.exit.details.stderr += `${data.toString('utf-8')}\n`;
      });
      this.proc.on('exit', code => {
        this.exit.details.code = code;
        this.proc = undefined;
      });
      this.proc.on('error', error => {
        this.exit.reason = 'Could not start gstreamer pipeline';
        this.exit.details.error = error;
        this.proc = undefined;
      });
    };

    if (this.source.type === 'rfbsrc') {
      if (this.source.options.host == null || this.source.options.port == null) {
        throw new Error('Missing critical configuration of the VNC server');
      }
      // A little retry mechanism
      const waitForSocket = (tries = 0) => {
        if (tries > 20) {
          this.exit.reason = `Timeout: Could not connect to VNC server ${
            this.source.options.host
          }:${this.source.options.port}`;
          return;
        }

        const handleRetry = () => {
          setTimeout(waitForSocket, 3000, tries++);
        };

        const socket = connect(
          this.source.options.port,
          this.source.options.host,
          () => {
            socket.removeListener('error', handleRetry);
            gstreamerHandle();
          }
        );
        socket.once('error', handleRetry);
      };
      waitForSocket();
    } else {
      gstreamerHandle();
    }
  }

  public stopCapture(): Promise<Readable> {
    return new Promise((resolve, reject) => {
      const exitHandler = async () => {
        if (timeout != null) {
          clearTimeout(timeout);
          this.proc = undefined;
        }

        resolve(
          pack(this.destination, {
            map: function(header) {
              header.name = basename(header.name);
              return header;
            }
          }).pipe(createGzip())
        );
      };

      const timeout = setTimeout(() => {
        if (this.proc != null) {
          this.proc.removeListener('exit', exitHandler);
          this.proc = undefined;
        }
        reject(new Error('Could not stop gstreamer pipeline.'));
      }, 30000);

      if (this.proc != null) {
        this.proc.once('exit', exitHandler);
        this.proc.kill('SIGINT');
      } else {
        reject(new Error(JSON.stringify(this.exit)));
      }
    });
  }

  private parseSource(): string {
    switch (this.source.type) {
      case 'rfbsrc':
        return `${this.source.type} host=${this.source.options.host} port=${
          this.source.options.port
        } view-only=true`;
      case 'v4l2src':
        // With our catpture HW there is an error when negotiating the resolution, so we crop the extra manually
        return `${this.source.type} ! decodebin ! videocrop right=90 bottom=60`;
      default:
        return this.source.options.type;
    }
  }
  public async teardown(): Promise<void> {
    if (this.proc != null) {
      this.proc.kill('SIGINT');
      this.proc = undefined;
    }
    await remove(this.destination);
  }
}
