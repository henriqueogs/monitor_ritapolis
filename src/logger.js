const fs = require('fs');
const path = require('path');
const winston = require('winston');
const config = require('./config');

fs.mkdirSync(config.logDir, { recursive: true });

const logFile = path.join(config.logDir, 'app.log');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: logFile }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const suffix = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return `${timestamp} ${level}: ${message}${suffix}`;
        })
      )
    })
  ]
});

module.exports = logger;
