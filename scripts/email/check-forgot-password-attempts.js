#!/usr/bin/env node
const AWS = require('aws-sdk');

const REGION = 'eu-central-1';
AWS.config.update({ region: REGION });

const logs = new AWS.CloudWatchLogs();

async function checkForgotPasswordAttempts() {
    console.log("[INFO] Checking for forgot password attempts and SES issues");
    console.log("=".repeat(60));
    
    const endTime = Date.now();
    const startTime = endTime - (24 * 60 * 60 * 1000); // Last 24 hours
    
    const logGroupName = '/ecs/upscend-prod-api-auth-td';
    
    try {
        const streams = await logs.describeLogStreams({
            logGroupName: logGroupName,
            orderBy: 'LastEventTime',
            descending: true,
            limit: 3
        }).promise();
        
        for (const stream of streams.logStreams) {
            try {
                const events = await logs.getLogEvents({
                    logGroupName: logGroupName,
                    logStreamName: stream.logStreamName,
                    startTime: startTime,
                    endTime: endTime
                }).promise();
                
                // Look for forgot password specific events
                const forgotEvents = events.events.filter(event => {
                    const msg = event.message;
                    return msg.includes('forgot-password') || 
                           msg.includes('forget-password') ||
                           msg.includes('FORGOT_PASSWORD') ||
                           msg.includes('POST') && msg.includes('password');
                });
                
                if (forgotEvents.length > 0) {
                    console.log(`\n[FOUND] Forgot password attempts in ${stream.logStreamName}:`);
                    forgotEvents.forEach(event => {
                        const time = new Date(event.timestamp).toISOString();
                        console.log(`  [${time}] ${event.message}`);
                    });
                }
                
                // Look for SES/SMTP errors
                const sesErrors = events.events.filter(event => {
                    const msg = event.message.toLowerCase();
                    return (msg.includes('ses') || msg.includes('smtp') || msg.includes('email')) && 
                           (msg.includes('error') || msg.includes('fail') || msg.includes('reject'));
                });
                
                if (sesErrors.length > 0) {
                    console.log(`\n[ERRORS] SES/Email errors in ${stream.logStreamName}:`);
                    sesErrors.slice(0, 10).forEach(event => {
                        const time = new Date(event.timestamp).toISOString();
                        console.log(`  [${time}] ${event.message}`);
                    });
                }
                
            } catch (streamError) {
                console.log(`[ERROR] Cannot read stream: ${streamError.message}`);
            }
        }
        
    } catch (error) {
        console.log(`[ERROR] Cannot access logs: ${error.message}`);
    }
}

if (require.main === module) {
    checkForgotPasswordAttempts().catch(console.error);
}