import { NODE_ENV } from '@/config/env';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function writeLine(stream: NodeJS.WriteStream, line: string): void {
  stream.write(`${line}\n`);
}

function output(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(meta ?? {}),
  };

  const isProd = NODE_ENV === 'production';

  if (isProd) {
    const line = JSON.stringify(payload);
    if (level === 'error') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      writeLine(process.stdout, line);
    }
    return;
  }

  if (level === 'error') {
    console.error(`[${level.toUpperCase()}] ${message}`, meta ?? {});
  } else if (level === 'warn') {
    console.warn(`[${level.toUpperCase()}] ${message}`, meta ?? {});
  } else {
    writeLine(process.stdout, `[${level.toUpperCase()}] ${message} ${JSON.stringify(meta ?? {})}`);
  }
}

export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: NODE_ENV === 'development' ? error.stack : undefined,
    };
  }

  return {
    message: String(error),
  };
}

export const logger = {
  debug(message: string, meta?: Record<string, unknown>) {
    output('debug', message, meta);
  },
  info(message: string, meta?: Record<string, unknown>) {
    output('info', message, meta);
  },
  warn(message: string, meta?: Record<string, unknown>) {
    output('warn', message, meta);
  },
  error(message: string, meta?: Record<string, unknown>) {
    output('error', message, meta);
  },
};

