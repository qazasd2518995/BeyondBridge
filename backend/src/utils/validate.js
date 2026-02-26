/**
 * 輕量級 Input Validation 工具
 * 提供常用的驗證函數，避免在每個 handler 重複寫驗證邏輯
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 驗證必填欄位
 * @param {Object} body - req.body
 * @param {string[]} fields - 必填欄位名稱
 * @returns {{valid: boolean, missing: string[]}}
 */
function required(body, fields) {
  const missing = fields.filter(f => body[f] === undefined || body[f] === null || body[f] === '');
  return { valid: missing.length === 0, missing };
}

/**
 * 驗證 Email 格式
 * @param {string} email
 * @returns {boolean}
 */
function isEmail(email) {
  return typeof email === 'string' && EMAIL_REGEX.test(email);
}

/**
 * 驗證字串長度
 * @param {string} str
 * @param {number} min
 * @param {number} max
 * @returns {boolean}
 */
function isLength(str, min = 0, max = Infinity) {
  if (typeof str !== 'string') return false;
  return str.length >= min && str.length <= max;
}

/**
 * 驗證為正整數
 * @param {*} val
 * @returns {boolean}
 */
function isPositiveInt(val) {
  const num = Number(val);
  return Number.isInteger(num) && num > 0;
}

/**
 * 驗證 ISO 日期格式
 * @param {string} str
 * @returns {boolean}
 */
function isISODate(str) {
  if (typeof str !== 'string') return false;
  const d = new Date(str);
  return !isNaN(d.getTime());
}

/**
 * 驗證值在允許的列表中
 * @param {*} val
 * @param {Array} allowed
 * @returns {boolean}
 */
function isOneOf(val, allowed) {
  return allowed.includes(val);
}

/**
 * Sanitize 字串 - 移除 HTML tags
 * @param {string} str
 * @returns {string}
 */
function sanitizeHtml(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/<[^>]*>/g, '');
}

/**
 * Express 中間件：驗證 req.body 必填欄位
 * @param {string[]} fields
 */
function requireFields(...fields) {
  return (req, res, next) => {
    const { valid, missing } = required(req.body, fields);
    if (!valid) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: `缺少必填欄位: ${missing.join(', ')}`
      });
    }
    next();
  };
}

/**
 * Express 中間件：驗證 req.query 參數為合法值
 * @param {Object} rules - { paramName: [allowedValues] }
 */
function validateQuery(rules) {
  return (req, res, next) => {
    for (const [param, allowed] of Object.entries(rules)) {
      if (req.query[param] && !allowed.includes(req.query[param])) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: `Invalid value for ${param}. Allowed: ${allowed.join(', ')}`
        });
      }
    }
    next();
  };
}

module.exports = {
  required,
  isEmail,
  isLength,
  isPositiveInt,
  isISODate,
  isOneOf,
  sanitizeHtml,
  requireFields,
  validateQuery
};
