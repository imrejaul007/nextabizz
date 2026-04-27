// Shared logger for NextaBiZ services

const isDev = process.env.NODE_ENV !== 'production';

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => {
    if (isDev) console.log(`[NextaBiZ] ${message}`, meta ?? '');
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    console.warn(`[NextaBiZ] ${message}`, meta ?? '');
  },
  error: (message: string, meta?: Record<string, unknown>) => {
    console.error(`[NextaBiZ] ${message}`, meta ?? '');
  },
};
