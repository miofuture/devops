#!/usr/bin/env node
const AWS = require('aws-sdk');

// Configure AWS region
const REGION = 'eu-central-1';
AWS.config.update({ region: REGION });

const s3 = new AWS.S3();

async function checkS3ConfigFile(bucket, key) {
    try {
        console.log(`\n[S3 CONFIG] s3://${bucket}/${key}`);
        
        const object = await s3.getObject({
            Bucket: bucket,
            Key: key
        }).promise();
        
        const content = object.Body.toString('utf-8');
        const envVars = {};
        
        // Parse .env file format
        content.split('\n').forEach(line => {
            line = line.trim();
            if (line && !line.startsWith('#')) {
                const [key, ...valueParts] = line.split('=');
                if (key && valueParts.length > 0) {
                    const value = valueParts.join('=');
                    envVars[key] = value;
                }
            }
        });
        
        console.log(`Found ${Object.keys(envVars).length} environment variables:`);
        
        // Check SMTP variables specifically
        const smtpVars = ['SES_SMTP_HOST', 'SES_SMTP_PORT', 'SES_SMTP_USER', 'SES_SMTP_PASS'];
        const foundSmtp = {};
        
        smtpVars.forEach(varName => {
            if (envVars[varName]) {
                foundSmtp[varName] = envVars[varName];
                const displayValue = varName.includes('PASS') ? '***HIDDEN***' : envVars[varName];
                console.log(`  ✅ ${varName}=${displayValue}`);
            } else {
                console.log(`  ❌ ${varName}=NOT_FOUND`);
            }
        });
        
        // Show other relevant variables
        console.log('\nOther environment variables:');
        Object.keys(envVars).forEach(key => {
            if (!smtpVars.includes(key)) {
                const value = key.includes('PASS') || key.includes('SECRET') || key.includes('KEY') ? '***HIDDEN***' : envVars[key];
                console.log(`  ${key}=${value}`);
            }
        });
        
        return { envVars, foundSmtp };
        
    } catch (error) {
        console.log(`[ERROR] Failed to read s3://${bucket}/${key}: ${error.message}`);
        return null;
    }
}

async function updateS3ConfigWithSMTP(bucket, key, smtpVars) {
    try {
        console.log(`\n[UPDATE] Adding SMTP variables to s3://${bucket}/${key}`);
        
        // Get existing content
        const object = await s3.getObject({
            Bucket: bucket,
            Key: key
        }).promise();
        
        let content = object.Body.toString('utf-8');
        
        // Remove existing SMTP variables
        const lines = content.split('\n');
        const filteredLines = lines.filter(line => {
            const trimmed = line.trim();
            return !trimmed.startsWith('SES_SMTP_');
        });
        
        // Add SMTP variables
        filteredLines.push('');
        filteredLines.push('# SES SMTP Configuration');
        Object.keys(smtpVars).forEach(key => {
            filteredLines.push(`${key}=${smtpVars[key]}`);
        });
        
        const newContent = filteredLines.join('\n');
        
        // Upload updated content
        await s3.putObject({
            Bucket: bucket,
            Key: key,
            Body: newContent,
            ContentType: 'text/plain'
        }).promise();
        
        console.log(`[SUCCESS] Updated s3://${bucket}/${key} with SMTP variables`);
        return true;
        
    } catch (error) {
        console.log(`[ERROR] Failed to update s3://${bucket}/${key}: ${error.message}`);
        return false;
    }
}

async function main() {
    console.log('='.repeat(70));
    console.log('S3 CONFIGURATION CHECK');
    console.log('='.repeat(70));
    
    const bucket = 'upscend-config';
    const configFiles = [
        'api/dev.env',
        'api/prod.env'
    ];
    
    const smtpCredentials = {
        'SES_SMTP_HOST': 'email-smtp.eu-central-1.amazonaws.com',
        'SES_SMTP_PORT': '587',
        'SES_SMTP_USER': 'AKIA****************',
        'SES_SMTP_PASS': '****************************************BDx5'
    };
    
    let needsUpdate = false;
    
    for (const configFile of configFiles) {
        const result = await checkS3ConfigFile(bucket, configFile);
        
        if (result) {
            // Check if SMTP variables are missing or incorrect
            const missingVars = Object.keys(smtpCredentials).filter(key => 
                !result.foundSmtp[key] || result.foundSmtp[key] !== smtpCredentials[key]
            );
            
            if (missingVars.length > 0) {
                console.log(`\n[MISSING] ${configFile} needs SMTP variables: ${missingVars.join(', ')}`);
                needsUpdate = true;
                
                // Ask if user wants to update
                console.log(`\n[QUESTION] Update ${configFile} with correct SMTP credentials? (y/n)`);
                console.log('This will add/update the SMTP variables in the S3 config file.');
                
                // For automation, we'll show what would be updated
                console.log('\nWould add/update:');
                Object.keys(smtpCredentials).forEach(key => {
                    const displayValue = key.includes('PASS') ? '***HIDDEN***' : smtpCredentials[key];
                    console.log(`  ${key}=${displayValue}`);
                });
            } else {
                console.log(`\n[SUCCESS] ${configFile} has all correct SMTP variables`);
            }
        }
    }
    
    if (needsUpdate) {
        console.log('\n' + '='.repeat(70));
        console.log('NEXT STEPS:');
        console.log('='.repeat(70));
        console.log('1. Update S3 config files with SMTP credentials (shown above)');
        console.log('2. Remove SMTP variables from ECS task definitions');
        console.log('3. Restart ECS services to pick up S3 config');
        console.log('\nRun: npm run remove-task-def-smtp');
    } else {
        console.log('\n[SUCCESS] All S3 config files have correct SMTP credentials');
    }
}

if (require.main === module) {
    main().catch(console.error);
}