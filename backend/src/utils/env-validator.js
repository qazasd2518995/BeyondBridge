/**
 * 環境變數驗證
 * 啟動時確認所有必要的環境變數已設定
 */

function validateEnv() {
  const required = [
    'JWT_SECRET',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY'
  ];

  const optional = {
    DYNAMODB_TABLE: 'beyondbridge',
    AWS_REGION: 'ap-southeast-2',
    AWS_SES_REGION: process.env.AWS_REGION || 'ap-southeast-2',
    EMAIL_PROVIDER: process.env.SMTP_PASS ? 'smtp' : 'ses',
    EMAIL_FROM: process.env.SMTP_USER || 'beyondbridge1020@gmail.com',
    EMAIL_FROM_NAME: 'BeyondBridge',
    SMTP_HOST: 'smtp.gmail.com',
    SMTP_PORT: '465',
    PORT: '3000',
    NODE_ENV: 'development'
  };

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error('╔════════════════════════════════════════╗');
    console.error('║  FATAL: Missing environment variables  ║');
    console.error('╚════════════════════════════════════════╝');
    missing.forEach(key => {
      console.error(`  ✗ ${key} is required but not set`);
    });
    console.error('\nPlease set these in your .env file or environment.');
    process.exit(1);
  }

  // Log optional defaults being used
  const usingDefaults = Object.entries(optional)
    .filter(([key]) => !process.env[key])
    .map(([key, val]) => `${key}=${val}`);

  if (usingDefaults.length > 0) {
    console.log('Using defaults:', usingDefaults.join(', '));
  }
}

module.exports = validateEnv;
