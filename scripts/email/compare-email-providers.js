#!/usr/bin/env node
const AWS = require('aws-sdk');

const REGION = 'eu-central-1';
AWS.config.update({ region: REGION });

const s3 = new AWS.S3();

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

async function analyzeEmailProviders() {
    console.log("[INFO] Analyzing Email Provider Configuration");
    console.log("=".repeat(60));
    
    // Get dev and prod configurations
    const devConfig = await getS3Config('upscend-config', 'api/dev.env');
    const prodConfig = await getS3Config('upscend-config', 'api/prod.env');
    
    console.log("\n[DEV ENVIRONMENT] Email Configuration:");
    console.log("-".repeat(40));
    
    const devEmailVars = Object.keys(devConfig).filter(key => 
        key.toLowerCase().includes('mail') || 
        key.toLowerCase().includes('smtp') || 
        key.toLowerCase().includes('email') ||
        key.toLowerCase().includes('sendgrid') ||
        key.toLowerCase().includes('ses')
    );
    
    devEmailVars.forEach(key => {
        const value = devConfig[key];
        if (key.toLowerCase().includes('pass') || key.toLowerCase().includes('key') || key.toLowerCase().includes('secret')) {
            console.log(`  ${key}: ${value.substring(0, 8)}...`);
        } else {
            console.log(`  ${key}: ${value}`);
        }
    });
    
    console.log("\n[PROD ENVIRONMENT] Email Configuration:");
    console.log("-".repeat(40));
    
    const prodEmailVars = Object.keys(prodConfig).filter(key => 
        key.toLowerCase().includes('mail') || 
        key.toLowerCase().includes('smtp') || 
        key.toLowerCase().includes('email') ||
        key.toLowerCase().includes('sendgrid') ||
        key.toLowerCase().includes('ses')
    );
    
    prodEmailVars.forEach(key => {
        const value = prodConfig[key];
        if (key.toLowerCase().includes('pass') || key.toLowerCase().includes('key') || key.toLowerCase().includes('secret')) {
            console.log(`  ${key}: ${value.substring(0, 8)}...`);
        } else {
            console.log(`  ${key}: ${value}`);
        }
    });
    
    // Analyze differences
    console.log("\n[ANALYSIS] Email Provider Comparison:");
    console.log("-".repeat(40));
    
    const devProvider = detectEmailProvider(devConfig);
    const prodProvider = detectEmailProvider(prodConfig);
    
    console.log(`  Dev Environment: ${devProvider.name}`);
    console.log(`  Prod Environment: ${prodProvider.name}`);
    
    if (devProvider.name !== prodProvider.name) {
        console.log(`\n[DIFFERENCE DETECTED] Different email providers:`);
        console.log(`  Dev uses: ${devProvider.name} (${devProvider.details})`);
        console.log(`  Prod uses: ${prodProvider.name} (${prodProvider.details})`);
        
        console.log(`\n[REPUTATION EXPLANATION]:`);
        if (devProvider.name === 'SES' && prodProvider.name === 'SendGrid') {
            console.log(`  • SendGrid (prod) has established reputation and IP warming`);
            console.log(`  • SES (dev) is new/low-volume, needs reputation building`);
            console.log(`  • Yahoo/Gmail trust SendGrid's established IPs more than new SES`);
            console.log(`  • SendGrid handles reputation management automatically`);
            console.log(`  • SES requires manual reputation building with consistent sending`);
        }
    } else {
        console.log(`\n[SAME PROVIDER] Both environments use ${devProvider.name}`);
    }
    
    return { devProvider, prodProvider, devConfig, prodConfig };
}

function detectEmailProvider(config) {
    const keys = Object.keys(config).map(k => k.toLowerCase());
    
    // Check for SendGrid
    if (keys.some(k => k.includes('sendgrid'))) {
        const apiKey = config['SENDGRID_API_KEY'] || config['SENDGRID_KEY'];
        return {
            name: 'SendGrid',
            details: apiKey ? 'API Key configured' : 'Configuration found'
        };
    }
    
    // Check for SES
    if (keys.some(k => k.includes('ses')) || 
        (config['MAIL_HOST'] && config['MAIL_HOST'].includes('amazonaws'))) {
        return {
            name: 'SES',
            details: `Host: ${config['MAIL_HOST'] || 'Not configured'}`
        };
    }
    
    // Check for generic SMTP
    if (config['MAIL_HOST']) {
        const host = config['MAIL_HOST'].toLowerCase();
        if (host.includes('gmail')) return { name: 'Gmail SMTP', details: host };
        if (host.includes('outlook') || host.includes('hotmail')) return { name: 'Outlook SMTP', details: host };
        if (host.includes('yahoo')) return { name: 'Yahoo SMTP', details: host };
        return { name: 'Custom SMTP', details: host };
    }
    
    return { name: 'Unknown', details: 'No email configuration detected' };
}

async function main() {
    const analysis = await analyzeEmailProviders();
    
    console.log(`\n[RECOMMENDATIONS]:`);
    if (analysis.devProvider.name === 'SES' && analysis.prodProvider.name === 'SendGrid') {
        console.log(`  1. Consider using SendGrid for dev environment too`);
        console.log(`  2. Or build SES reputation by sending regular emails`);
        console.log(`  3. SendGrid has better deliverability out-of-the-box`);
        console.log(`  4. SES is cheaper but requires reputation management`);
    }
}

if (require.main === module) {
    main().catch(console.error);
}