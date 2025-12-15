#!/usr/bin/env node
const AWS = require('aws-sdk');

const REGION = 'eu-central-1';
AWS.config.update({ region: REGION });

const s3 = new AWS.S3();
const logs = new AWS.CloudWatchLogs();

async function getS3Config(bucket, key) {
    try {
        const result = await s3.getObject({
            Bucket: bucket,
            Key: key
        }).promise();
        
        const content = result.Body.toString('utf-8');
        const config = {};
        
        content.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
                const [key, ...valueParts] = trimmed.split('=');
                const value = valueParts.join('=').replace(/^["']|["']$/g, '');
                config[key.trim()] = value;
            }
        });
        
        return config;
    } catch (error) {
        console.log(`[ERROR] Cannot read ${bucket}/${key}: ${error.message}`);
        return {};
    }
}

async function checkEmailProviderUsage() {
    console.log("[INFO] Checking Which Email Provider Is Actually Used");
    console.log("=".repeat(60));
    
    const devConfig = await getS3Config('upscend-config', 'api/dev.env');
    const prodConfig = await getS3Config('upscend-config', 'api/prod.env');
    
    console.log("\n[DEV CONFIG] Available Email Providers:");
    console.log("-".repeat(40));
    
    // Check SES config in dev
    const devHasSES = devConfig['SES_SMTP_HOST'] && devConfig['SES_SMTP_USER'] && devConfig['SES_SMTP_PASS'];
    const devHasSendGrid = devConfig['SENDGRID_API_KEY'];
    
    console.log(`  SES Available: ${devHasSES ? '✅ YES' : '❌ NO'}`);
    if (devHasSES) {
        console.log(`    Host: ${devConfig['SES_SMTP_HOST']}`);
        console.log(`    User: ${devConfig['SES_SMTP_USER']}`);
        console.log(`    From: ${devConfig['AWS_SES_FROM_EMAIL']}`);
    }
    
    console.log(`  SendGrid Available: ${devHasSendGrid ? '✅ YES' : '❌ NO'}`);
    if (devHasSendGrid) {
        console.log(`    API Key: ${devConfig['SENDGRID_API_KEY'].substring(0, 12)}...`);
        console.log(`    From: ${devConfig['SENDGRID_FROM_EMAIL']}`);
    }
    
    console.log("\n[PROD CONFIG] Available Email Providers:");
    console.log("-".repeat(40));
    
    // Check SES config in prod
    const prodHasSES = prodConfig['SES_SMTP_HOST'] && prodConfig['SES_SMTP_USER'] && prodConfig['SES_SMTP_PASS'];
    const prodHasSendGrid = prodConfig['SENDGRID_API_KEY'];
    
    console.log(`  SES Available: ${prodHasSES ? '✅ YES' : '❌ NO'}`);
    if (prodHasSES) {
        console.log(`    Host: ${prodConfig['SES_SMTP_HOST']}`);
        console.log(`    User: ${prodConfig['SES_SMTP_USER']}`);
        console.log(`    From: ${prodConfig['AWS_SES_FROM_EMAIL']}`);
    }
    
    console.log(`  SendGrid Available: ${prodHasSendGrid ? '✅ YES' : '❌ NO'}`);
    if (prodHasSendGrid) {
        console.log(`    API Key: ${prodConfig['SENDGRID_API_KEY'].substring(0, 12)}...`);
        console.log(`    From: ${prodConfig['SENDGRID_FROM_EMAIL']}`);
    }
    
    // Check recent logs to see which provider is actually being used
    await checkRecentEmailLogs();
    
    return { devHasSES, devHasSendGrid, prodHasSES, prodHasSendGrid };
}

async function checkRecentEmailLogs() {
    console.log("\n[RECENT LOGS] Checking which provider was actually used:");
    console.log("-".repeat(40));
    
    const endTime = Date.now();
    const startTime = endTime - (2 * 60 * 60 * 1000); // Last 2 hours
    
    const logGroups = [
        '/ecs/upscend-dev-api-td',
        '/ecs/upscend-prod-api-td',
        '/ecs/upscend-dev-api-auth-td',
        '/ecs/upscend-prod-api-auth-td'
    ];
    
    for (const logGroupName of logGroups) {
        try {
            const streams = await logs.describeLogStreams({
                logGroupName: logGroupName,
                orderBy: 'LastEventTime',
                descending: true,
                limit: 3
            }).promise();
            
            console.log(`\n  Checking ${logGroupName}:`);
            
            for (const stream of streams.logStreams) {
                try {
                    const events = await logs.getLogEvents({
                        logGroupName: logGroupName,
                        logStreamName: stream.logStreamName,
                        startTime: startTime,
                        endTime: endTime
                    }).promise();
                    
                    const emailEvents = events.events.filter(event => {
                        const msg = event.message.toLowerCase();
                        return msg.includes('sendgrid') || 
                               msg.includes('ses') || 
                               msg.includes('smtp') ||
                               msg.includes('email') ||
                               msg.includes('forgot_password_email');
                    });
                    
                    emailEvents.forEach(event => {
                        const time = new Date(event.timestamp).toISOString();
                        const msg = event.message;
                        
                        let provider = 'Unknown';
                        if (msg.toLowerCase().includes('sendgrid')) provider = '📧 SendGrid';
                        else if (msg.toLowerCase().includes('ses') || msg.includes('amazonaws')) provider = '📨 SES';
                        else if (msg.includes('FORGOT_PASSWORD_EMAIL')) provider = '📩 Email Sent';
                        
                        console.log(`    [${time.substring(11, 19)}] ${provider}: ${msg.substring(0, 80)}...`);
                    });
                    
                } catch (streamError) {
                    // Skip inaccessible streams
                }
            }
            
        } catch (error) {
            console.log(`    [SKIP] Cannot access ${logGroupName}`);
        }
    }
}

async function main() {
    const result = await checkEmailProviderUsage();
    
    console.log("\n[ANALYSIS] Email Provider Usage:");
    console.log("=".repeat(60));
    
    console.log(`\nDev Environment:`);
    console.log(`  • SES configured: ${result.devHasSES ? 'YES' : 'NO'}`);
    console.log(`  • SendGrid configured: ${result.devHasSendGrid ? 'YES' : 'NO'}`);
    
    console.log(`\nProd Environment:`);
    console.log(`  • SES configured: ${result.prodHasSES ? 'YES' : 'NO'}`);
    console.log(`  • SendGrid configured: ${result.prodHasSendGrid ? 'YES' : 'NO'}`);
    
    console.log(`\n[EXPLANATION] Why SendGrid works better:`);
    console.log(`  • SendGrid has established IP reputation with major email providers`);
    console.log(`  • SendGrid handles IP warming and reputation management automatically`);
    console.log(`  • SES requires manual reputation building through consistent sending`);
    console.log(`  • Yahoo/Gmail trust SendGrid's established infrastructure more`);
    console.log(`  • Your SES domain (lofty.kodefuse.com) may have lower trust than SendGrid IPs`);
}

if (require.main === module) {
    main().catch(console.error);
}