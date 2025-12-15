#!/usr/bin/env node
const nodemailer = require('nodemailer');

// SMTP Configuration
const SMTP_CONFIG = {
    host: 'email-smtp.eu-central-1.amazonaws.com',
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
        user: 'AKIA5RP5FWVY4UGVDYUM',
        pass: 'BM+zIynBs56WJVFCgglj0HfYIM3zOEh99Zzd2UwwBDx5'
    }
};

async function testSMTPCredentials() {
    console.log('[INFO] Testing SMTP credentials...');
    console.log(`Host: ${SMTP_CONFIG.host}`);
    console.log(`Port: ${SMTP_CONFIG.port}`);
    console.log(`User: ${SMTP_CONFIG.auth.user}`);
    
    try {
        // Create transporter
        const transporter = nodemailer.createTransport(SMTP_CONFIG);
        
        // Verify connection
        console.log('\n[INFO] Verifying SMTP connection...');
        await transporter.verify();
        console.log('[SUCCESS] SMTP connection verified!');
        
        // Send test email
        console.log('\n[INFO] Sending test email to miofuture@yahoo.com...');
        
        const mailOptions = {
            from: 'support@upscend.com',
            to: 'miofuture@yahoo.com',
            subject: 'Test Email - SMTP Credentials Verification',
            text: `
This is a test email to verify SMTP credentials.

Timestamp: ${new Date().toISOString()}
From: Node.js SMTP Test Script
Purpose: Verify SES SMTP configuration

If you receive this email, the SMTP credentials are working correctly.
            `,
            html: `
<h2>SMTP Test Email</h2>
<p>This is a test email to verify SMTP credentials.</p>
<ul>
    <li><strong>Timestamp:</strong> ${new Date().toISOString()}</li>
    <li><strong>From:</strong> Node.js SMTP Test Script</li>
    <li><strong>Purpose:</strong> Verify SES SMTP configuration</li>
</ul>
<p>If you receive this email, the SMTP credentials are working correctly.</p>
            `
        };
        
        const result = await transporter.sendMail(mailOptions);
        
        console.log('[SUCCESS] Test email sent successfully!');
        console.log(`Message ID: ${result.messageId}`);
        console.log(`Response: ${result.response}`);
        
        return true;
        
    } catch (error) {
        console.log('[ERROR] SMTP test failed:');
        console.log(`Error: ${error.message}`);
        
        if (error.code) {
            console.log(`Code: ${error.code}`);
        }
        
        if (error.responseCode) {
            console.log(`Response Code: ${error.responseCode}`);
        }
        
        return false;
    }
}

async function main() {
    console.log('='.repeat(60));
    console.log('AWS SES SMTP Credentials Test');
    console.log('='.repeat(60));
    
    const success = await testSMTPCredentials();
    
    if (success) {
        console.log('\n✅ SMTP credentials are working!');
        console.log('You can use these credentials in your ECS application.');
        console.log('\nNext steps:');
        console.log('1. Add these environment variables to your ECS task definition');
        console.log('2. Update your application to use SMTP instead of SES API');
        console.log('3. Redeploy your ECS service');
    } else {
        console.log('\n❌ SMTP credentials failed!');
        console.log('Please check:');
        console.log('1. Credentials are correct');
        console.log('2. SES is configured in eu-central-1');
        console.log('3. SMTP access is enabled');
    }
}

if (require.main === module) {
    main().catch(console.error);
}