#!/usr/bin/env node
const AWS = require('aws-sdk');

const REGION = 'eu-central-1';
AWS.config.update({ region: REGION });

const s3 = new AWS.S3();

async function updateS3Config(bucket, key, newFromEmail) {
    try {
        // Get current config
        const result = await s3.getObject({
            Bucket: bucket,
            Key: key
        }).promise();
        
        let content = result.Body.toString('utf-8');
        console.log(`\n[INFO] Updating ${bucket}/${key}`);
        
        // Find and replace the AWS_SES_FROM_EMAIL line
        const oldFromEmailMatch = content.match(/AWS_SES_FROM_EMAIL=(.+)/);
        if (oldFromEmailMatch) {
            const oldEmail = oldFromEmailMatch[1].trim();
            console.log(`  Old: AWS_SES_FROM_EMAIL=${oldEmail}`);
            
            // Replace the line
            content = content.replace(
                /AWS_SES_FROM_EMAIL=.+/,
                `AWS_SES_FROM_EMAIL=${newFromEmail}`
            );
            
            console.log(`  New: AWS_SES_FROM_EMAIL=${newFromEmail}`);
            
            // Upload updated config
            await s3.putObject({
                Bucket: bucket,
                Key: key,
                Body: content,
                ContentType: 'text/plain'
            }).promise();
            
            console.log(`  ✅ Updated successfully`);
            return { updated: true, oldEmail, newEmail: newFromEmail };
        } else {
            console.log(`  ⚠️  AWS_SES_FROM_EMAIL not found in config`);
            return { updated: false };
        }
        
    } catch (error) {
        console.log(`  ❌ Error updating ${bucket}/${key}: ${error.message}`);
        return { updated: false, error: error.message };
    }
}

async function main() {
    console.log("[INFO] Fixing SES From Email Configuration");
    console.log("=".repeat(60));
    
    const newFromEmail = 'support@upscend.com';
    console.log(`[INFO] Changing AWS_SES_FROM_EMAIL to: ${newFromEmail}`);
    
    // Update dev environment
    const devResult = await updateS3Config('upscend-config', 'api/dev.env', newFromEmail);
    
    // Update prod environment
    const prodResult = await updateS3Config('upscend-config', 'api/prod.env', newFromEmail);
    
    console.log(`\n[SUMMARY]:`);
    console.log(`  Dev Environment: ${devResult.updated ? '✅ Updated' : '❌ Failed'}`);
    console.log(`  Prod Environment: ${prodResult.updated ? '✅ Updated' : '❌ Failed'}`);
    
    if (devResult.updated || prodResult.updated) {
        console.log(`\n[NEXT STEPS]:`);
        console.log(`  1. Restart ECS services to pick up new configuration`);
        console.log(`  2. Test forgot password functionality`);
        console.log(`  3. All emails will now come from: ${newFromEmail}`);
        console.log(`  4. No more "Email address is not verified" errors`);
    }
    
    // Check for any other references to lofty.kodefuse.com
    console.log(`\n[INFO] Checking for other references to lofty.kodefuse.com...`);
    
    const configs = [
        { bucket: 'upscend-config', key: 'api/dev.env' },
        { bucket: 'upscend-config', key: 'api/prod.env' }
    ];
    
    for (const config of configs) {
        try {
            const result = await s3.getObject({
                Bucket: config.bucket,
                Key: config.key
            }).promise();
            
            const content = result.Body.toString('utf-8');
            const loftyReferences = content.match(/lofty\.kodefuse\.com/g);
            
            if (loftyReferences && loftyReferences.length > 0) {
                console.log(`  ⚠️  Found ${loftyReferences.length} references to lofty.kodefuse.com in ${config.key}`);
            } else {
                console.log(`  ✅ No lofty.kodefuse.com references in ${config.key}`);
            }
            
        } catch (error) {
            console.log(`  ❌ Error checking ${config.key}: ${error.message}`);
        }
    }
}

if (require.main === module) {
    main().catch(console.error);
}