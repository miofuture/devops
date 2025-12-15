#!/usr/bin/env node
const AWS = require('aws-sdk');

const REGION = 'eu-central-1';
AWS.config.update({ region: REGION });

const logs = new AWS.CloudWatchLogs();

async function checkProdAuthLogs() {
    console.log("[INFO] Checking production auth service logs for email issues");
    console.log("=".repeat(60));
    
    const endTime = Date.now();
    const startTime = endTime - (6 * 60 * 60 * 1000); // Last 6 hours
    
    const logGroupName = '/ecs/upscend-prod-api-auth-td';
    
    try {
        console.log(`\n[INFO] Checking ${logGroupName}:`);
        
        const streams = await logs.describeLogStreams({
            logGroupName: logGroupName,
            orderBy: 'LastEventTime',
            descending: true,
            limit: 5
        }).promise();
        
        console.log(`  Found ${streams.logStreams.length} log streams`);
        
        for (const stream of streams.logStreams) {
            console.log(`\n  Stream: ${stream.logStreamName}`);
            
            try {
                const events = await logs.getLogEvents({
                    logGroupName: logGroupName,
                    logStreamName: stream.logStreamName,
                    startTime: startTime,
                    endTime: endTime
                }).promise();
                
                console.log(`    Total events: ${events.events.length}`);
                
                // Look for any email-related activity
                const emailEvents = events.events.filter(event => {
                    const msg = event.message.toLowerCase();
                    return msg.includes('forgot') || 
                           msg.includes('password') || 
                           msg.includes('email') ||
                           msg.includes('smtp') ||
                           msg.includes('ses') ||
                           msg.includes('send') ||
                           msg.includes('mail') ||
                           msg.includes('error');
                });
                
                if (emailEvents.length > 0) {
                    console.log(`    Email-related events: ${emailEvents.length}`);
                    emailEvents.slice(0, 20).forEach(event => {
                        const time = new Date(event.timestamp).toISOString();
                        console.log(`      [${time}] ${event.message}`);
                    });
                } else {
                    console.log(`    No email-related events found`);
                }
                
            } catch (streamError) {
                console.log(`    [ERROR] Cannot read stream: ${streamError.message}`);
            }
        }
        
    } catch (error) {
        console.log(`  [ERROR] Cannot access ${logGroupName}: ${error.message}`);
    }
}

if (require.main === module) {
    checkProdAuthLogs().catch(console.error);
}