import { spawn } from 'child_process';

export type RunSpawnResult = { stdout: string; stderr: string };

// No shell: argv only. `settled` avoids resolving twice if timeout and process exit race.
/** Enforces timeout and max combined stdout+stderr length. */
export function runSpawn(
  file: string,
  args: readonly string[],
  options: {
    env: NodeJS.ProcessEnv;
    timeoutMs: number;
    maxBufferBytes: number;
  }
): Promise<RunSpawnResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    let settled = false;

    const child = spawn(file, [...args], {
      env: options.env,
      shell: false,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
      rejectPromise(new Error(`Process timed out after ${options.timeoutMs}ms`));
    }, options.timeoutMs);

    const checkBuffer = () => {
      if (stdout.length + stderr.length <= options.maxBufferBytes) return;
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
      rejectPromise(new Error('maxBuffer exceeded'));
    };

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      checkBuffer();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      checkBuffer();
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rejectPromise(err instanceof Error ? err : new Error(String(err)));
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolvePromise({ stdout, stderr });
        return;
      }
      const err = new Error(`Process exited with code ${code}`);
      Object.assign(err, { stdout, stderr, code });
      rejectPromise(err);
    });
  });
}
