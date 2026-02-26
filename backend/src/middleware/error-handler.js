/**
 * 集中式錯誤處理中間件
 */

/**
 * 包裝 async route handler，自動 catch 錯誤
 * 用法: router.get('/', asyncHandler(async (req, res) => { ... }))
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 自訂 API 錯誤類
 */
class ApiError extends Error {
  constructor(statusCode, errorCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

/**
 * 全域錯誤處理中間件（放在所有路由之後）
 */
function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.errorCode,
      message: err.message
    });
  }

  console.error(`[${req.method} ${req.path}] Error:`, err);

  res.status(500).json({
    success: false,
    error: 'INTERNAL_ERROR',
    message: process.env.NODE_ENV === 'development' ? err.message : '伺服器內部錯誤'
  });
}

module.exports = { asyncHandler, ApiError, errorHandler };
