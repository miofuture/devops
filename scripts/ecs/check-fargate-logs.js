#!/usr/bin/env node
const AWS = require('aws-sdk');

const REGION = 'eu-central-1';
AWS.config.update({ region: REGION });

const logs = new AWS.CloudWatchLogs();

async function checkFargateLogs() {
    console.log("[INFO] Checking Fargate cluster logs for SES email issues");
    console.log("=".repeat(60));
    
    const endTime = Date.now();
    const startTime = endTime - (2 * 60 * 60 * 1000); // Last 2 hours
    
    // Check Fargate log groups
    const logGroups = [
        '/ecs/upscend-prod-api-clusterFargate',
        '/aws/ecs/containerinsights/upscend-prod-api-clusterFargate/application'
    ];
    
    for (const logGroupName of logGroups) {
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
                               msg.includes('error') ||
                               msg.includes('mail') ||
                               msg.includes('send');
                    });
                    
                    if (relevantEvents.length > 0) {
                        console.log(`\n  Stream: ${stream.logStreamName}`);
                        relevantEvents.slice(0, 15).forEach(event => {
                            const time = new Date(event.timestamp).toISOString();
                            console.log(`    [${time}] ${event.message}`);
                        });
                    }
                    
                } catch (streamError) {
                    console.log(`    [ERROR] Cannot read stream: ${streamError.message}`);
                }
            }
            
        } catch (error) {
            console.log(`  [SKIP] Cannot access ${logGroupName}: ${error.message}`);
        }
    }
}

if (require.main === module) {
    checkFargateLogs().catch(console.error);
}