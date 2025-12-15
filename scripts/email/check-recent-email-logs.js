#!/usr/bin/env node
const AWS = require('aws-sdk');

const REGION = 'eu-central-1';
AWS.config.update({ region: REGION });

const logs = new AWS.CloudWatchLogs();

async function checkRecentEmailLogs() {
    console.log("[INFO] Checking recent email logs from ECS applications");
    console.log("=".repeat(60));
    
    const endTime = Date.now();
    const startTime = endTime - (4 * 60 * 60 * 1000); // Last 4 hours
    
    const logGroups = [
        '/ecs/upscend-dev-api-td',
        '/ecs/upscend-dev-api-auth-td',
        '/ecs/upscend-prod-api-td', 
        '/ecs/upscend-prod-api-auth-td'
    ];
    
    for (const logGroupName of logGroups) {
        try {
            console.log(`\n[INFO] Checking ${logGroupName}:`);
            
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
                    
                    const emailEvents = events.events.filter(event => {
                        const msg = event.message.toLowerCase();
                        return msg.includes('forgot') || 
                               msg.includes('password') || 
                               msg.includes('email') ||
                               msg.includes('smtp') ||
                               msg.includes('ses') ||
                               msg.includes('error') ||
                               msg.includes('mail');
                    });
                    
                    if (emailEvents.length > 0) {
                        console.log(`  Stream: ${stream.logStreamName.split('/').pop()}`);
                        emailEvents.slice(0, 10).forEach(event => {
                            const time = new Date(event.timestamp).toISOString().substring(11, 19);
                            console.log(`    [${time}] ${event.message.substring(0, 100)}...`);
                        });
                    }
                    
                } catch (streamError) {
                    // Skip inaccessible streams
                }
            }
            
        } catch (error) {
            console.log(`  [SKIP] Cannot access ${logGroupName}: ${error.message}`);
        }
    }
}

if (require.main === module) {
    checkRecentEmailLogs().catch(console.error);
}