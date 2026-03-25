/**
 * BeyondBridge i18n Engine
 * 前端國際化模組
 */

const I18n = {
  locale: 'zh-TW',
  fallbackLocale: 'zh-TW',
  messages: {},
  loaded: false,

  /**
   * 初始化 i18n
   */
  async init() {
    // 偵測語言：localStorage > 瀏覽器語言 > 預設 zh-TW
    const saved = localStorage.getItem('locale');
    if (saved && (saved === 'zh-TW' || saved === 'en')) {
      this.locale = saved;
    } else {
      const browserLang = navigator.language || navigator.userLanguage || '';
      this.locale = browserLang.startsWith('en') ? 'en' : 'zh-TW';
    }

    // 載入翻譯檔
    await this.loadMessages('zh-TW');
    if (this.locale !== 'zh-TW') {
      await this.loadMessages(this.locale);
    }

    this.loaded = true;
    this.translateStaticElements();
  },

  /**
   * 載入翻譯檔
   */
  async loadMessages(locale) {
    try {
      const resp = await fetch(`/i18n/${locale}.json?v=1`);
      if (resp.ok) {
        this.messages[locale] = await resp.json();
      }
    } catch (e) {
      console.warn(`[i18n] Failed to load ${locale}:`, e);
    }
  },

  /**
   * 取得當前語言
   */
  getLocale() {
    return this.locale;
  },

  /**
   * 切換語言
   */
  async setLocale(locale) {
    if (locale === this.locale) return;
    this.locale = locale;
    localStorage.setItem('locale', locale);

    // 如果尚未載入該語言，先載入
    if (!this.messages[locale]) {
      await this.loadMessages(locale);
    }

    this.translateStaticElements();
    window.dispatchEvent(new CustomEvent('localeChanged', { detail: { locale } }));
  },

  /**
   * 翻譯 key
   * @param {string} key - 翻譯鍵，如 'nav.dashboard'
   * @param {object} params - 替換參數，如 { name: 'John' }
   * @returns {string}
   */
  t(key, params) {
    // 優先從當前語言取值
    let msg = this.messages[this.locale]?.[key];
    // fallback 到預設語言
    if (msg === undefined) {
      msg = this.messages[this.fallbackLocale]?.[key];
    }
    // 找不到就回傳 key
    if (msg === undefined) return key;

    // 替換參數 {name} → value
    if (params) {
      Object.keys(params).forEach(k => {
        msg = msg.replace(new RegExp(`\\{${k}\\}`, 'g'), params[k]);
      });
    }
    return msg;
  },

  /**
   * 自動翻譯帶 data-i18n 屬性的靜態 HTML 元素
   */
  translateStaticElements() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key) {
        el.textContent = this.t(key);
      }
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) {
        el.placeholder = this.t(key);
      }
    });
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      const key = el.getAttribute('data-i18n-html');
      if (key) {
        el.innerHTML = this.t(key);
      }
    });
  }
};

/**
 * 全域快捷函數
 */
function t(key, params) {
  return I18n.t(key, params);
}
