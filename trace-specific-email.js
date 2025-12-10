#!/usr/bin/env node
const AWS = require('aws-sdk');

// Configure AWS region
const REGION = 'eu-central-1';
AWS.config.update({ region: REGION });

const logs = new AWS.CloudWatchLogs();
const ses = new AWS.SES();

async function traceSpecificEmail(email = 'miofuture@yahoo.com', hoursBack = 1) {
    const endTime = Date.now();
    const startTime = endTime - (hoursBack * 60 * 60 * 1000);
    
    console.log(`[INFO] Tracing emails for: ${email}`);
    console.log(`[INFO] Time range: ${new Date(startTime).toISOString()} to ${new Date(endTime).toISOString()}`);
    
    // All possible log groups to check
    const logGroups = [
        '/aws/ses/delivery',
        '/aws/ses/bounce', 
        '/aws/ses/complaint',
        '/aws/ses/send',
        '/aws/ses/reject',
        '/ecs/upscend-prod-api-td',
        '/ecs/upscend-prod-api-auth-td',
        '/ecs/upscend-prod-api-notif-td',
        '/ecs/upscend-dev-api-td',
        '/ecs/upscend-dev-api-auth-td',
        '/ecs/upscend-dev-api-notif-td'
    ];
    
    let foundLogs = [];
    
    for (const logGroup of logGroups) {
        try {
            console.log(`\n[INFO] Checking ${logGroup}...`);
            
            // Get recent log streams
            const streams = await logs.describeLogStreams({
                logGroupName: logGroup,
                orderBy: 'LastEventTime',
                descending: true,
                limit: 20
            }).promise();
            
            for (const stream of streams.logStreams) {
                try {
                    // Get log events
                    const events = await logs.getLogEvents({
                        logGroupName: logGroup,
                        logStreamName: stream.logStreamName,
                        startTime: startTime,
                        endTime: endTime
                    }).promise();
                    
                    for (const event of events.events) {
                        const message = event.message.toLowerCase();
                        
                        // Check for the specific email or related keywords
                        if (message.includes(email.toLowerCase()) || 
                            message.includes('forgot') || 
                            message.includes('password') ||
                            message.includes('reset') ||
                            message.includes('miofuture')) {
                            
                            foundLogs.push({
                                timestamp: new Date(event.timestamp),
                                logGroup: logGroup,
                                logStream: stream.logStreamName,
                                message: event.message
                            });
                        }
                    }
                } catch (streamError) {
                    // Skip streams that can't be read
                }
            }
            
        } catch (error) {
            if (error.code === 'ResourceNotFoundException') {
                console.log(`[SKIP] ${logGroup} - not found`);
            } else {
                console.log(`[ERROR] ${logGroup}: ${error.message}`);
            }
        }
    }
    
    return foundLogs;
}

async function checkSESStatistics() {
    try {
        console.log(`\n[INFO] Checking recent SES statistics...`);
        
        const stats = await ses.getSendStatistics().promise();
        const recentStats = stats.SendDataPoints.slice(-5);
        
        if (recentStats.length > 0) {
            console.log(`[INFO] Recent SES activity:`);
            for (const stat of recentStats) {
                console.log(`  ${stat.Timestamp}: ${stat.DeliveryAttempts} attempts, ${stat.Bounces} bounces, ${stat.Complaints} complaints, ${stat.Rejects} rejects`);
            }
        }
        
        const quota = await ses.getSendQuota().promise();
        console.log(`\n[INFO] Current quota: ${quota.SentLast24Hours}/${quota.Max24HourSend} emails sent today`);
        
    } catch (error) {
        console.log(`[ERROR] Failed to get SES statistics: ${error.message}`);
    }
}

async function searchAllRecentLogs(email, hoursBack = 2) {
    const endTime = Date.now();
    const startTime = endTime - (hoursBack * 60 * 60 * 1000);
    
    console.log(`\n[INFO] Searching ALL recent logs for ${email}...`);
    
    try {
        // Get all log groups
        const allLogGroups = await logs.describeLogGroups().promise();
        let foundAny = false;
        
        for (const logGroup of allLogGroups.logGroups) {
            const logGroupName = logGroup.logGroupName;
            
            // Skip very large log groups to avoid timeouts
            if (logGroupName.includes('vpc-flow-logs') || 
                logGroupName.includes('cloudtrail')) {
                continue;
            }
            
            try {
                // Quick check for recent activity
                const streams = await logs.describeLogStreams({
                    logGroupName: logGroupName,
                    orderBy: 'LastEventTime',
                    descending: true,
                    limit: 3
                }).promise();
                
                for (const stream of streams.logStreams) {
                    if (stream.lastEventTime && stream.lastEventTime > startTime) {
                        try {
                            const events = await logs.getLogEvents({
                                logGroupName: logGroupName,
                                logStreamName: stream.logStreamName,
                                startTime: startTime,
                                endTime: endTime,
                                limit: 100
                            }).promise();
                            
                            for (const event of events.events) {
                                if (event.message.toLowerCase().includes(email.toLowerCase()) ||
                                    event.message.toLowerCase().includes('miofuture')) {
                                    
                                    foundAny = true;
                                    console.log(`\n[FOUND] ${logGroupName}`);
                                    console.log(`Stream: ${stream.logStreamName}`);
                                    console.log(`Time: ${new Date(event.timestamp).toISOString()}`);
                                    console.log(`Message: ${event.message}`);
                                    console.log("-".repeat(50));
                                }
                            }
                        } catch (eventError) {
                            // Skip if can't read events
                        }
                    }
                }
            } catch (groupError) {
                // Skip if can't access log group
            }
        }
        
        if (!foundAny) {
            console.log(`[WARNING] No logs found containing ${email} in the last ${hoursBack} hours`);
        }
        
    } catch (error) {
        console.log(`[ERROR] Failed to search all logs: ${error.message}`);
    }
}

async function main() {
    const email = 'miofuture@yahoo.com';
    
    console.log("[INFO] Tracing forgot password email delivery...");
    console.log("=".repeat(60));
    
    // Check SES statistics first
    await checkSESStatistics();
    
    // Trace specific email in known log groups
    const logs = await traceSpecificEmail(email, 2);
    
    if (logs.length > 0) {
        console.log(`\n[FOUND] ${logs.length} relevant log entries:`);
        console.log("-".repeat(60));
        
        logs.sort((a, b) => b.timestamp - a.timestamp);
        
        for (const log of logs) {
            console.log(`[${log.timestamp.toISOString()}] ${log.logGroup}`);
            console.log(`Stream: ${log.logStream}`);
            console.log(`Message: ${log.message}`);
            console.log("-".repeat(60));
        }
    } else {
        console.log(`\n[WARNING] No specific logs found for ${email}`);
        
        // Search all logs as fallback
        await searchAllRecentLogs(email, 2);
    }
    
    console.log(`\n[INFO] Possible reasons for missing email:`);
    console.log(`1. Email is in spam/junk folder`);
    console.log(`2. Yahoo.com blocking or delaying delivery`);
    console.log(`3. SES bounce/complaint (check bounce logs)`);
    console.log(`4. Application error before sending`);
    console.log(`5. Wrong email configuration in app`);
}

if (require.main === module) {
    main().catch(console.error);
}