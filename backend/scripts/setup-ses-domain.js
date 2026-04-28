#!/usr/bin/env node

require('dotenv').config();

const {
  SESClient,
  VerifyDomainIdentityCommand,
  VerifyDomainDkimCommand,
  GetIdentityVerificationAttributesCommand
} = require('@aws-sdk/client-ses');

function getEmailDomain(value = '') {
  const match = String(value).match(/@([^>\s]+)>?$/);
  return match ? match[1].toLowerCase() : '';
}

async function main() {
  const domain = String(process.argv[2] || getEmailDomain(process.env.EMAIL_FROM || '') || '').trim().toLowerCase();
  const region = process.env.AWS_SES_REGION || process.env.AWS_REGION || 'ap-southeast-2';

  if (!domain || !domain.includes('.')) {
    console.error('Usage: node scripts/setup-ses-domain.js beyondbridge.com');
    process.exit(1);
  }

  const client = new SESClient({
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  });

  const identity = await client.send(new VerifyDomainIdentityCommand({ Domain: domain }));
  const dkim = await client.send(new VerifyDomainDkimCommand({ Domain: domain }));
  const attrs = await client.send(new GetIdentityVerificationAttributesCommand({
    Identities: [domain]
  }));

  const records = [
    {
      type: 'TXT',
      name: `_amazonses.${domain}`,
      value: identity.VerificationToken
    },
    ...(dkim.DkimTokens || []).map(token => ({
      type: 'CNAME',
      name: `${token}._domainkey.${domain}`,
      value: `${token}.dkim.amazonses.com`
    }))
  ];

  console.log(JSON.stringify({
    ok: true,
    region,
    domain,
    verificationStatus: attrs.VerificationAttributes?.[domain]?.VerificationStatus || 'Pending',
    dnsRecordsToAdd: records,
    nextSteps: [
      'Add every dnsRecordsToAdd entry to your DNS provider for the domain.',
      'Wait until SES marks the identity as Success in the same region.',
      'Request SES production access in the same region so you can send to unverified student emails.',
      `Set Render EMAIL_FROM to noreply@${domain} or another address under this verified domain.`,
      `Set Render AWS_SES_REGION to ${region}.`
    ]
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
