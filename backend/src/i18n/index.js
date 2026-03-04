/**
 * Backend i18n Module
 */

const zhTW = require('./zh-TW.json');
const en = require('./en.json');

const messages = {
  'zh-TW': zhTW,
  'en': en
};

/**
 * Translate a key for a given locale
 * @param {string} key
 * @param {string} locale - 'zh-TW' or 'en'
 * @param {object} params - replacement params
 * @returns {string}
 */
function t(key, locale = 'zh-TW', params) {
  let msg = messages[locale]?.[key] || messages['zh-TW']?.[key] || key;

  if (params) {
    Object.keys(params).forEach(k => {
      msg = msg.replace(new RegExp(`\\{${k}\\}`, 'g'), params[k]);
    });
  }
  return msg;
}

module.exports = { t };
