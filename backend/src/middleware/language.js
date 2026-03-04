/**
 * Language Detection Middleware
 * Detects locale from X-Language header, attaches req.locale and req.t()
 */

const { t } = require('../i18n');

const SUPPORTED_LOCALES = ['zh-TW', 'en'];
const DEFAULT_LOCALE = 'zh-TW';

function languageMiddleware(req, res, next) {
  const header = req.headers['x-language'] || '';
  req.locale = SUPPORTED_LOCALES.includes(header) ? header : DEFAULT_LOCALE;
  req.t = (key, params) => t(key, req.locale, params);
  next();
}

module.exports = languageMiddleware;
