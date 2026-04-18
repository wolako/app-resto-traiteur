const winston = require('winston');
const path = require('path');

const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

winston.addColors(logColors);

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += `\n${JSON.stringify(meta, null, 2)}`;
    }
    return msg;
  })
);

const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const transports = [
  new winston.transports.Console({
    level: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
    format: consoleFormat,
  }),
  new winston.transports.File({
    filename: path.join(process.cwd(), 'logs', 'error.log'),
    level: 'error',
    format: fileFormat,
    maxsize: 5242880,
    maxFiles: 5,
  }),
  new winston.transports.File({
    filename: path.join(process.cwd(), 'logs', 'combined.log'),
    format: fileFormat,
    maxsize: 5242880,
    maxFiles: 5,
  }),
];

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels: logLevels,
  transports,
  exitOnError: false,
});

const fs = require('fs');
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// ✅ Routes de polling silencieuses en console (loggées quand même dans les fichiers)
const SILENT_ROUTES = [
  '/api/settings/maintenance/status',
  '/api/notifications/unread-count',
  '/maintenance/status',
  '/unread-count',
];

const isSilentRoute = (url) =>
  SILENT_ROUTES.some(route => url === route || url.startsWith(route + '?'));

const httpLogger = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const { method, url, ip } = req;
    const { statusCode } = res;
    const userAgent = req.get('User-Agent');

    const meta = {
      statusCode,
      duration: `${duration}ms`,
      ip,
      userAgent,
      userId: req.user?.id,
    };

    // ✅ Routes de polling : loggées dans les fichiers mais pas en console
    if (isSilentRoute(url)) {
      // Uniquement si erreur (4xx/5xx) → on affiche quand même en console
      if (statusCode >= 400) {
        logger.http(`${method} ${url}`, meta);
      }
      // Sinon : écriture fichier seulement via le transport File
      // (on n'appelle pas logger.http pour éviter la console)
      return;
    }

    logger.http(`${method} ${url}`, meta);
  });

  next();
};

module.exports = {
  logger,
  httpLogger,
};

module.exports.error = logger.error.bind(logger);
module.exports.warn  = logger.warn.bind(logger);
module.exports.info  = logger.info.bind(logger);
module.exports.http  = logger.http.bind(logger);
module.exports.debug = logger.debug.bind(logger);