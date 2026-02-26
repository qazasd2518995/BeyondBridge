/**
 * 簡易記憶體快取工具
 * TTL-based cache for reducing redundant DB scans
 */

class MemoryCache {
  constructor() {
    this.store = new Map();
  }

  /**
   * 取得快取項目
   * @param {string} key
   * @returns {*} cached value or undefined
   */
  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /**
   * 設定快取項目
   * @param {string} key
   * @param {*} value
   * @param {number} ttlMs - time to live in milliseconds
   */
  set(key, value, ttlMs = 60000) {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs
    });
  }

  /**
   * 刪除快取項目
   * @param {string} key
   */
  del(key) {
    this.store.delete(key);
  }

  /**
   * 依照前綴刪除快取
   * @param {string} prefix
   */
  delByPrefix(prefix) {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  /**
   * 清除所有快取
   */
  clear() {
    this.store.clear();
  }
}

// 導出單例
module.exports = new MemoryCache();
