#!/usr/bin/env node
const AWS = require('aws-sdk');

async function checkSESInRegions() {
    const sesRegions = [
        'us-east-1', 'us-west-2', 'eu-west-1',
        'eu-central-1', 'ap-southeast-1', 'ap-northeast-1'
    ];
    
    const results = [];
    
    for (const region of sesRegions) {
        try {
            console.log(`Checking SES in ${region}...`);
            
            const ses = new AWS.SES({ region: region });
            
            // Get quota
            const quota = await ses.getSendQuota().promise();
            
            // Get identities
            const identities = await ses.listIdentities().promise();
            
            // Check if production (quota > 200)
            const isProduction = quota.Max24HourSend > 200;
            
            const result = {
                region: region,
                max24Hour: quota.Max24HourSend,
                maxSendRate: quota.MaxSendRate,
                sentLast24h: quota.SentLast24Hours,
                verifiedIdentities: identities.Identities,
                isProduction: isProduction
            };
            
            results.push(result);
            
            if (isProduction || identities.Identities.length > 0) {
                console.log(`[FOUND] Active SES in ${region}`);
                console.log(`  Quota: ${quota.Max24HourSend} emails/day`);
                console.log(`  Identities: ${identities.Identities.length}`);
            }
            
        } catch (error) {
            if (error.message.includes('not supported') || error.message.includes('not available')) {
                console.log(`[SKIP] SES not available in ${region}`);
            } else {
                console.log(`[ERROR] ${region}: ${error.message}`);
            }
        }
    }
    
    return results;
}

async function main() {
    console.log("Checking SES across all regions...");
    console.log("=".repeat(40));
    
    const results = await checkSESInRegions();
    
    console.log("\nSUMMARY:");
    console.log("-".repeat(20));
    
    const productionRegions = results.filter(r => r.isProduction);
    const activeRegions = results.filter(r => r.verifiedIdentities.length > 0);
    
    if (productionRegions.length > 0) {
        console.log("Production SES found in:");
        for (const r of productionRegions) {
            console.log(`  ${r.region}: ${r.max24Hour} emails/day`);
        }
    }
    
    if (activeRegions.length > 0) {
        console.log("Active identities found in:");
        for (const r of activeRegions) {
            console.log(`  ${r.region}: ${r.verifiedIdentities.length} identities`);
        }
    }
    
    if (productionRegions.length === 0 && activeRegions.length === 0) {
        console.log("No production SES or verified identities found in any region");
        console.log("Your SES account appears to be in sandbox mode globally");
    }
}

if (require.main === module) {
    main().catch(console.error);
}