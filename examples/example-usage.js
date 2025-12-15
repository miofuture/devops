#!/usr/bin/env node
// Example: How to use local secrets in your scripts

// Load local secrets (not pushed to GitHub)
const secrets = require('./local-secrets.js');

// Use in AWS SDK
const AWS = require('aws-sdk');
AWS.config.update({
    accessKeyId: secrets.AWS_ACCESS_KEY_ID,
    secretAccessKey: secrets.AWS_SECRET_ACCESS_KEY,
    region: 'eu-central-1'
});

// Use in SMTP configuration
const smtpConfig = {
    host: secrets.SES_SMTP_HOST,
    port: secrets.SES_SMTP_PORT,
    auth: {
        user: secrets.SES_SMTP_USER,
        pass: secrets.SES_SMTP_PASS
    }
};

console.log('Using local secrets for AWS and SMTP');
console.log('Secrets loaded but never pushed to GitHub');