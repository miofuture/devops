#!/usr/bin/env node
const AWS = require('aws-sdk');
const axios = require('axios');

// Configure AWS region
const REGION = 'eu-central-1';
AWS.config.update({ region: REGION });

const logs = new AWS.CloudWatchLogs();

async function testResetPassword() {
    const testEmail = 'miofuture@yahoo.com';
    const apiUrl = 'https://api-dev.upscend.com/auth/forgot-password';
    
    console.log(`[INFO] Testing reset password for: ${testEmail}`);
    console.log(`[INFO] API endpoint: ${apiUrl}`);
    console.log("-".repeat(60));
    
    try {
        const response = await axios.post(apiUrl, {
            email: testEmail
        }, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });
        
        console.log(`[SUCCESS] API Response: ${response.status} ${response.statusText}`);
        console.log(`[INFO] Response data:`, response.data);
        
        return {
            success: true,
            status: response.status,
            data: response.data,
            timestamp: new Date()
        };
        
    } catch (error) {
        console.log(`[ERROR] API Request failed:`);
        if (error.response) {
            console.log(`  Status: ${error.response.status}`);
            console.log(`  Data:`, error.response.data);
        } else {
            console.log(`  Error: ${error.message}`);
        }
        
        return {
            success: false,
            error: error.message,
            timestamp: new Date()
        };
    }
}

async function checkRecentLogs(minutesBack = 5) {
    const endTime = Date.now();
    const startTime = endTime - (minutesBack * 60 * 1000);
    
    console.log(`\n[INFO] Checking logs from last ${minutesBack} minutes...`);
    
    const logGroups = [
        '/aws/ecs/upscend-dev-api',
        '/ecs/upscend-dev-api',
        '/aws/ecs/containerinsights/upscend-dev/application'
    ];
    
    for (const logGroupName of logGroups) {
        try {
            const streams = await logs.describeLogStreams({
                logGroupName: logGroupName,
                orderBy: 'LastEventTime',
                descending: true,
                limit: 5
            }).promise();
            
            console.log(`\n[INFO] Checking log group: ${logGroupName}`);
            
            for (const stream of streams.logStreams) {
                try {
                    const events = await logs.getLogEvents({
                        logGroupName: logGroupName,
                        logStreamName: stream.logStreamName,
                        startTime: startTime,
                        endTime: endTime
                    }).promise();
                    
                    const relevantEvents = events.events.filter(event => {
                        const msg = event.message.toLowerCase();
                        return msg.includes('forgot') || 
                               msg.includes('password') || 
                               msg.includes('email') ||
                               msg.includes('smtp') ||
                               msg.includes('ses') ||
                               msg.includes('miofuture');
                    });
                    
                    if (relevantEvents.length > 0) {
                        console.log(`  Stream: ${stream.logStreamName}`);
                        relevantEvents.forEach(event => {
                            const time = new Date(event.timestamp).toISOString();
                            console.log(`    [${time}] ${event.message}`);
                        });
                    }
                    
                } catch (streamError) {
                    // Skip inaccessible streams
                }
            }
            
        } catch (error) {
            console.log(`[SKIP] Cannot access log group ${logGroupName}: ${error.message}`);
        }
    }
}

async function main() {
    console.log("[INFO] Testing Reset Password Functionality");
    console.log("=".repeat(60));
    
    // Test the reset password API
    const result = await testResetPassword();
    
    // Wait a moment for logs to appear
    console.log(`\n[INFO] Waiting 10 seconds for logs to appear...`);
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Check recent logs
    await checkRecentLogs(5);
    
    console.log(`\n[SUMMARY] Reset Password Test Results:`);
    console.log(`  API Success: ${result.success}`);
    console.log(`  Timestamp: ${result.timestamp.toISOString()}`);
    
    if (result.success) {
        console.log(`  Status: ${result.status}`);
        console.log(`\n[NEXT STEPS]:`);
        console.log(`  1. Check Yahoo Mail inbox for miofuture@yahoo.com`);
        console.log(`  2. Check Yahoo Mail spam/junk folder`);
        console.log(`  3. Review logs above for any SMTP errors`);
    } else {
        console.log(`  Error: ${result.error}`);
        console.log(`\n[ACTION REQUIRED]: Fix API issues before testing email delivery`);
    }
}

if (require.main === module) {
    main().catch(console.error);
}