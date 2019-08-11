import { spawn, ChildProcess } from 'child_process';
import { ensureDir, remove } from 'fs-extra';
import { fs } from 'mz';
import { connect } from 'net';
import { basename } from 'path';
import * as tar from 'tar';
import { Readable } from 'stream';

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
          `${this.parseSource()} ! videoconvert ! pngenc compression-level=9 ! multifilesink location="${
            this.destination
          }/%06d.png"`
        ],
        {
          shell: true
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
      });
      this.proc.on('error', error => {
        this.exit.reason = 'Could not start gstreamer pipeline';
        this.exit.details.error = error;
        if (this.proc != null) {
          this.proc.kill();
          this.proc = undefined;
        }
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

  public async stopCapture(): Promise<Readable> {
    if (this.proc != null) {
      this.proc.kill('SIGINT');
      this.proc = undefined;
    } else {
      throw this.exit;
    }

    return tar.create(
      {
        gzip: true,
        cwd: this.destination
      },
      (await fs.readdir(this.destination)).map(file => {
        return basename(file);
      })
    );
  }

  private parseSource(): string {
    if (this.source.type === 'rfbsrc') {
      return `${this.source.type} host=${this.source.options.host} port=${
        this.source.options.port
      } view-only=true`;
    }
    return this.source.type;
  }
  public async teardown(): Promise<void> {
    if (this.proc != null) {
      this.proc.kill('SIGINT');
      this.proc = undefined;
    }
    await remove(this.destination);
  }
}
