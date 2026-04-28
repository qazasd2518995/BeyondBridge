#!/usr/bin/env node

require('dotenv').config();

const {
  SESClient,
  GetSendQuotaCommand,
  GetIdentityVerificationAttributesCommand
} = require('@aws-sdk/client-ses');
const {
  sendEmail,
  classifyEmailError
} = require('../src/utils/email');

function parseArgs(argv = []) {
  return argv.reduce((args, item, index) => {
    if (item === '--to') args.to = argv[index + 1];
    if (item === '--identity') args.identity = argv[index + 1];
    return args;
  }, {});
}

function extractEmail(value = '') {
  const match = String(value).match(/<([^>]+)>/);
  return (match ? match[1] : value).trim().toLowerCase();
}

function getDomain(email = '') {
  return String(email).split('@')[1] || '';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const region = process.env.AWS_SES_REGION || process.env.AWS_REGION || 'ap-southeast-2';
  const provider = String(process.env.EMAIL_PROVIDER || (process.env.SMTP_PASS ? 'smtp' : 'ses')).trim().toLowerCase();
  const fromEmail = extractEmail(process.env.EMAIL_FROM || 'noreply@beyondbridge.com');
  const identities = [...new Set([
    args.identity,
    fromEmail,
    getDomain(fromEmail)
  ].filter(Boolean))];

  const result = {
    ok: true,
    provider,
    region,
    fromEmail,
    quota: null,
    identities: {},
    testEmail: null
  };

  if (provider === 'ses') {
    const client = new SESClient({
      region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });

    const [quota, verification] = await Promise.all([
      client.send(new GetSendQuotaCommand({})),
      identities.length > 0
        ? client.send(new GetIdentityVerificationAttributesCommand({ Identities: identities }))
        : Promise.resolve({ VerificationAttributes: {} })
    ]);

    result.quota = quota;
    result.identities = verification.VerificationAttributes || {};
  } else {
    result.smtp = {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT || 465),
      user: process.env.SMTP_USER || null,
      hasPassword: Boolean(process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD)
    };
  }

  if (args.to) {
    try {
      const sendResult = await sendEmail(
        args.to,
        'BeyondBridge SES delivery test',
        '<p>This is a BeyondBridge SES delivery test.</p>',
        'This is a BeyondBridge SES delivery test.'
      );
      result.testEmail = sendResult;
    } catch (error) {
      result.ok = false;
      result.testEmail = {
        success: false,
        deliveryError: classifyEmailError(error)
      };
    }
  }

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(2);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
