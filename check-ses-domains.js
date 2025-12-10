#!/usr/bin/env node
const AWS = require('aws-sdk');

const REGION = 'eu-central-1';
AWS.config.update({ region: REGION });

const ses = new AWS.SES();

async function checkSESDomains() {
    console.log("[INFO] Checking SES Domain Configuration");
    console.log("=".repeat(60));
    
    try {
        // Get verified domains
        const domains = await ses.listVerifiedEmailAddresses().promise();
        console.log("\n[VERIFIED EMAIL ADDRESSES]:");
        domains.VerifiedEmailAddresses.forEach(email => {
            console.log(`  • ${email}`);
        });
        
        // Get domain identities
        const identities = await ses.listIdentities().promise();
        console.log("\n[SES IDENTITIES] (Domains and Email Addresses):");
        
        for (const identity of identities.Identities) {
            try {
                const verification = await ses.getIdentityVerificationAttributes({
                    Identities: [identity]
                }).promise();
                
                const status = verification.VerificationAttributes[identity];
                const verificationStatus = status ? status.VerificationStatus : 'Unknown';
                
                console.log(`  • ${identity} - Status: ${verificationStatus}`);
                
                // Check if it's a domain (contains a dot but no @)
                if (identity.includes('.') && !identity.includes('@')) {
                    console.log(`    [DOMAIN] ${identity}`);
                    
                    // Get DKIM attributes for domains
                    try {
                        const dkim = await ses.getIdentityDkimAttributes({
                            Identities: [identity]
                        }).promise();
                        
                        const dkimStatus = dkim.DkimAttributes[identity];
                        if (dkimStatus) {
                            console.log(`      DKIM Enabled: ${dkimStatus.DkimEnabled}`);
                            console.log(`      DKIM Status: ${dkimStatus.DkimVerificationStatus}`);
                        }
                    } catch (dkimError) {
                        console.log(`      DKIM: Unable to retrieve`);
                    }
                }
            } catch (error) {
                console.log(`  • ${identity} - Error: ${error.message}`);
            }
        }
        
    } catch (error) {
        console.log(`[ERROR] Failed to retrieve SES configuration: ${error.message}`);
    }
}

async function checkConfiguredFromAddresses() {
    console.log("\n[CONFIGURED FROM ADDRESSES]:");
    console.log("-".repeat(40));
    
    // Check S3 configuration
    const s3 = new AWS.S3();
    
    try {
        const devConfig = await s3.getObject({
            Bucket: 'upscend-config',
            Key: 'api/dev.env'
        }).promise();
        
        const devContent = devConfig.Body.toString('utf-8');
        const devFromEmail = devContent.match(/AWS_SES_FROM_EMAIL=(.+)/);
        
        if (devFromEmail) {
            console.log(`  Dev Environment: ${devFromEmail[1].trim()}`);
        }
        
    } catch (error) {
        console.log(`  Dev Environment: Unable to retrieve (${error.message})`);
    }
    
    try {
        const prodConfig = await s3.getObject({
            Bucket: 'upscend-config',
            Key: 'api/prod.env'
        }).promise();
        
        const prodContent = prodConfig.Body.toString('utf-8');
        const prodFromEmail = prodContent.match(/AWS_SES_FROM_EMAIL=(.+)/);
        
        if (prodFromEmail) {
            console.log(`  Prod Environment: ${prodFromEmail[1].trim()}`);
        }
        
    } catch (error) {
        console.log(`  Prod Environment: Unable to retrieve (${error.message})`);
    }
}

async function main() {
    await checkSESDomains();
    await checkConfiguredFromAddresses();
    
    console.log("\n[ANALYSIS]:");
    console.log("-".repeat(40));
    console.log("• lofty.kodefuse.com appears to be an old/test domain");
    console.log("• Your main domain should be upscend.com");
    console.log("• Check if lofty.kodefuse.com is still needed");
    console.log("• Consider using no-reply@upscend.com instead");
}

if (require.main === module) {
    main().catch(console.error);
}