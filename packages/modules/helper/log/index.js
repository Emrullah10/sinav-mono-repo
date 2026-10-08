let LOG_SEPARATOR = ' - ';
let levels = {
  info: 'info',
  warn: 'warn',
  error: 'error',
  fatal: 'fatal',
  debug: 'debug',
};
let logModeMap = {
  trace: [levels.info, levels.warn, levels.error, levels.fatal, levels.debug],
  verbose: [levels.info, levels.error, levels.fatal],
  quite: [levels.error, levels.fatal],
  severer: [levels.info, levels.warn, levels.error, levels.fatal],
};
let logModes = {};
Object.keys(logModeMap).forEach((mode) => {
  logModes[mode] = mode;
});

function safeJsonStringify(obj) {
  let result = 'Error occured at log module safeJsonStringify...';
  try {
    result = JSON.stringify(obj);
  } catch (error) {
    console.log(error);
  }
  return result;
}
function checkLoglevel(level) {
  if (!logModeMap[global.logMode]) return true;
  return logModeMap[global.logMode].includes(level);
}
function logStringify(logs) {
  if (Array.isArray(logs)) {
    return logs
      .map((item) => {
        if (item instanceof Error) return item.message;
        if (typeof item === 'object') return safeJsonStringify(item);
        return item;
      })
      .join(LOG_SEPARATOR);
  }
  if (typeof logs === 'object') return safeJsonStringify(logs);
  return logs;
}

function addDateAndModeToLog(level, message) {
  return (
    new Date().toISOString() + ' ' + level.toUpperCase() + ' -> ' + message
  );
}
const errorCore = function (errorLevel, rest) {
  let errorLog = rest.find((item) => {
    return item instanceof Error;
  });
  if (errorLog) {
    errorLog.message = addDateAndModeToLog(
      errorLevel,
      logStringify(errorLog.message),
    );
    return console.error(errorLog);
  }

  console.error(addDateAndModeToLog(errorLevel, logStringify(rest)));
};
const info = function (...rest) {
  if (checkLoglevel(levels.info))
    console.log(addDateAndModeToLog(levels.info, logStringify(rest)));
};
const warn = function (...rest) {
  if (checkLoglevel(levels.warn))
    console.log(addDateAndModeToLog(levels.warn, logStringify(rest)));
};
const error = function (...rest) {
  if (checkLoglevel(levels.error)) {
    errorCore(levels.error, rest);
  }
};
const fatal = function (...rest) {
  if (checkLoglevel(levels.fatal)) {
    errorCore(levels.fatal, rest);
  }
};

const debug = function (...rest) {
  if (checkLoglevel(levels.debug))
    console.log(addDateAndModeToLog(levels.debug, logStringify(rest)));
};
export default { info, warn, error, fatal, debug, logModes };
