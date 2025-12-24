/**
 * Logging service for MCP Server
 * Provides structured logging using Pino with support for different log levels,
 * timing utilities, and specialized wrappers for tool invocations and D1 queries.
 */

import pino from 'pino';
import { join } from 'path';
import { mkdir } from 'fs/promises';
import { homedir } from 'os';

interface LogContext {
  module?: string;
  operation?: string;
  tool?: string;
  duration?: number;
  success?: boolean;
  sql?: string;
  paramCount?: number;
  resultCount?: number | null;
  [key: string]: unknown;
}

class Logger {
  private logger: pino.Logger;
  private startTime: number;

  constructor() {
    // Logger will be initialized in initPino()
    this.logger = null as any; // Temporary placeholder
    this.startTime = Date.now();
  }

  /**
   * Initialize Pino logger with console and optional file transports
   */
  async initPino(): Promise<void> {
    const level = process.env.LOG_LEVEL || 'info';
    const isDevelopment = process.env.NODE_ENV === 'development';
    const fileLoggingEnabled = process.env.LOG_FILE_ENABLED !== 'false';

    const logFileDir = process.env.LOG_FILE_PATH || join(homedir(), '.mythicindex', 'logs');
    const logFilePath = join(logFileDir, 'mcp-server.log');

    // Create log directory if file logging enabled
    if (fileLoggingEnabled) {
      await mkdir(logFileDir, { recursive: true });
    }

    // Console transport (pretty in dev, JSON in prod)
    const consoleTransport = {
      target: isDevelopment ? 'pino-pretty' : 'pino/file',
      options: isDevelopment ? {
        destination: 2, // stderr
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname',
        singleLine: false,
      } : { destination: 2 },
    };

    // File transport (JSON logs with rotation)
    const fileTransport = fileLoggingEnabled ? {
      target: 'pino-rotating-file-stream',
      options: {
        path: logFileDir,
        filename: 'mcp-server.log',
        size: process.env.LOG_FILE_MAX_SIZE || '10M',
        maxFiles: parseInt(process.env.LOG_FILE_MAX_FILES || '20'),
      },
    } : null;

    // Configure Pino logger with dual transports
    this.logger = pino({
      level,
      transport: {
        targets: [
          consoleTransport,
          ...(fileTransport ? [fileTransport] : []),
        ],
      },
      // Base fields included in every log
      base: {
        service: 'mythicindex-mcp',
      },
      // ISO timestamp format
      timestamp: pino.stdTimeFunctions.isoTime,
      // Note: formatters not supported with transport.targets
      // Each transport handles its own formatting
    });

    if (fileLoggingEnabled) {
      this.logger.info({
        logFile: logFilePath,
        maxSize: process.env.LOG_FILE_MAX_SIZE || '10M',
        maxFiles: parseInt(process.env.LOG_FILE_MAX_FILES || '20'),
      }, 'File logging enabled with rotation');
    }
  }

  /**
   * Log debug-level message (detailed internals, queries, cache operations)
   */
  debug(msg: string, context?: LogContext): void {
    if (!this.logger) {
      console.error('[DEBUG] Logger not initialized:', msg, context);
      return;
    }
    this.logger.debug(context || {}, msg);
  }

  /**
   * Log info-level message (tool invocations, service initialization, startup)
   */
  info(msg: string, context?: LogContext): void {
    if (!this.logger) {
      console.log('[INFO] Logger not initialized:', msg, context);
      return;
    }
    this.logger.info(context || {}, msg);
  }

  /**
   * Log warning message (fallbacks, degraded functionality)
   */
  warn(msg: string, context?: LogContext): void {
    if (!this.logger) {
      console.warn('[WARN] Logger not initialized:', msg, context);
      return;
    }
    this.logger.warn(context || {}, msg);
  }

  /**
   * Log error message with optional Error object
   */
  error(msg: string, error?: Error, context?: LogContext): void {
    if (!this.logger) {
      console.error('[ERROR] Logger not initialized:', msg, error, context);
      return;
    }
    const ctx: LogContext = { ...context };
    if (error) {
      ctx.error = {
        message: error.message,
        stack: error.stack,
        name: error.name,
      };
    }
    this.logger.error(ctx, msg);
  }

  /**
   * Create child logger with bindings for specific module/operation
   */
  child(bindings: LogContext): Logger {
    const childLogger = new Logger();
    childLogger.logger = this.logger.child(bindings);
    return childLogger;
  }

  /**
   * Start a timer and return a function that returns elapsed milliseconds
   */
  startTimer(): () => number {
    const start = Date.now();
    return () => Date.now() - start;
  }
}

// Singleton instance
let loggerInstance: Logger | null = null;

/**
 * Initialize the logger (call once at startup)
 */
export async function initLogger(): Promise<Logger> {
  if (!loggerInstance) {
    loggerInstance = new Logger();
    await loggerInstance.initPino();
  }
  return loggerInstance;
}

/**
 * Get the logger instance
 * WARNING: Must call initLogger() first
 */
export function getLogger(): Logger {
  if (!loggerInstance) {
    throw new Error('Logger not initialized. Call initLogger() first.');
  }
  return loggerInstance;
}

/**
 * Wrap a tool invocation with logging
 * Logs tool name, sanitized parameters, execution time, and success/failure
 */
export async function logToolInvocation<T>(
  toolName: string,
  params: unknown,
  fn: () => Promise<T>
): Promise<T> {
  const logger = getLogger();
  const timer = logger.startTimer();

  logger.info('Tool invoked', {
    module: 'tool',
    tool: toolName,
    params: sanitizeParams(params),
  });

  try {
    const result = await fn();
    const duration = timer();

    logger.info('Tool completed', {
      module: 'tool',
      tool: toolName,
      duration,
      success: true,
    });

    return result;
  } catch (error) {
    const duration = timer();

    logger.error('Tool failed', error as Error, {
      module: 'tool',
      tool: toolName,
      duration,
      success: false,
    });

    throw error;
  }
}

/**
 * Wrap a D1 query with logging (debug level)
 * Logs SQL statement, parameters, execution time, and result count
 */
export async function logD1Query<T>(
  sql: string,
  params: unknown[],
  fn: () => Promise<T>
): Promise<T> {
  const logger = getLogger();
  const timer = logger.startTimer();

  logger.debug('D1 query starting', {
    module: 'd1',
    operation: 'query',
    sql: truncate(sql, 500),
    paramCount: params.length,
  });

  try {
    const result = await fn();
    const duration = timer();
    const resultCount = Array.isArray(result) ? result.length : null;

    logger.debug('D1 query completed', {
      module: 'd1',
      operation: 'query',
      duration,
      resultCount,
    });

    return result;
  } catch (error) {
    const duration = timer();

    logger.error('D1 query failed', error as Error, {
      module: 'd1',
      operation: 'query',
      sql: truncate(sql, 500),
      duration,
    });

    throw error;
  }
}

/**
 * Sanitize sensitive data from parameters
 * Redacts fields containing: apiKey, token, password, secret
 */
function sanitizeParams(params: unknown): unknown {
  if (typeof params !== 'object' || params === null) {
    return params;
  }

  if (Array.isArray(params)) {
    return params.map(sanitizeParams);
  }

  const sanitized: Record<string, unknown> = {};
  const sensitiveKeys = ['apikey', 'token', 'password', 'secret', 'key'];

  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
      sanitized[key] = '***REDACTED***';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeParams(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Truncate long strings (e.g., SQL queries, prompts)
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength) + '...';
}

/**
 * Log a service operation with timing
 * Generic wrapper for any service operation (Remote API, image generation, etc.)
 */
export async function logServiceOperation<T>(
  module: string,
  operation: string,
  fn: () => Promise<T>,
  additionalContext?: LogContext
): Promise<T> {
  const logger = getLogger();
  const timer = logger.startTimer();

  logger.debug(`${operation} starting`, {
    module,
    operation,
    ...additionalContext,
  });

  try {
    const result = await fn();
    const duration = timer();

    logger.debug(`${operation} completed`, {
      module,
      operation,
      duration,
      ...additionalContext,
    });

    return result;
  } catch (error) {
    const duration = timer();

    logger.error(`${operation} failed`, error as Error, {
      module,
      operation,
      duration,
      ...additionalContext,
    });

    throw error;
  }
}
