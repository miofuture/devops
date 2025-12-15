#!/usr/bin/env node
const AWS = require('aws-sdk');

// Configure AWS region
const REGION = 'eu-central-1';
AWS.config.update({ region: REGION });

const logs = new AWS.CloudWatchLogs();
const ses = new AWS.SES();
const sts = new AWS.STS();

async function fetchSESLogs(hoursBack = 24) {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - (hoursBack * 60 * 60 * 1000));
    
    const logGroups = [
        '/aws/ses/sending-stats',
        '/aws/ses/bounce',
        '/aws/ses/complaint',
        '/aws/ses/delivery',
        '/aws/lambda/ses-bounce-handler',
        '/aws/lambda/ses-complaint-handler',
        '/aws/apigateway/ses'
    ];
    
    const allLogs = [];
    
    for (const logGroup of logGroups) {
        try {
            console.log(`Fetching logs from: ${logGroup}`);
            
            const streams = await logs.describeLogStreams({
                logGroupName: logGroup,
                orderBy: 'LastEventTime',
                descending: true,
                limit: 10
            }).promise();
            
            for (const stream of streams.logStreams) {
                const events = await logs.getLogEvents({
                    logGroupName: logGroup,
                    logStreamName: stream.logStreamName,
                    startTime: startTime.getTime(),
                    endTime: endTime.getTime()
                }).promise();
                
                for (const event of events.events) {
                    allLogs.push({
                        timestamp: new Date(event.timestamp),
                        logGroup: logGroup,
                        logStream: stream.logStreamName,
                        message: event.message
                    });
                }
            }
            
        } catch (error) {
            if (error.code === 'ResourceNotFoundException') {
                console.log(`[SKIP] Log group ${logGroup} not found - skipping`);
            } else if (error.code === 'AccessDeniedException') {
                console.log(`[ERROR] Access denied to ${logGroup}: ${error.message}`);
            } else {
                console.log(`[ERROR] Error accessing ${logGroup}:`);
                console.log(`   Code: ${error.code}`);
                console.log(`   Message: ${error.message}`);
            }
        }
    }
    
    return allLogs;
}

async function fetchSESEvents() {
    try {
        console.log("Fetching SES sending quota...");
        const quota = await ses.getSendQuota().promise();
        
        console.log("Fetching SES sending statistics...");
        const stats = await ses.getSendStatistics().promise();
        
        console.log("Fetching all verified identities...");
        const identities = await ses.listIdentities().promise();
        
        console.log("Fetching configuration sets...");
        let configSets = { ConfigurationSets: [] };
        try {
            configSets = await ses.listConfigurationSets().promise();
        } catch (error) {
            // Ignore if not available
        }
        
        console.log("Checking account sending status...");
        let accountEnabled = { Enabled: 'Unknown' };
        try {
            accountEnabled = await ses.getAccountSendingEnabled().promise();
        } catch (error) {
            // Ignore if not available
        }
        
        return {
            accountSendingEnabled: accountEnabled.Enabled,
            sendQuota: {
                max24Hour: quota.Max24HourSend,
                maxSendRate: quota.MaxSendRate,
                sentLast24h: quota.SentLast24Hours
            },
            sendStatistics: stats.SendDataPoints.slice(-10),
            verifiedIdentities: identities.Identities,
            configurationSets: configSets.ConfigurationSets.map(cs => cs.Name)
        };
        
    } catch (error) {
        if (error.code === 'NoCredentialsError') {
            console.log("[ERROR] AWS credentials not found for SES API");
        } else {
            console.log(`[ERROR] SES API Error:`);
            console.log(`   Code: ${error.code}`);
            console.log(`   Message: ${error.message}`);
            if (error.code === 'AccessDeniedException') {
                console.log("   TIP: Check if your IAM user has SES permissions");
            }
        }
        return {};
    }
}

async function main() {
    console.log("[INFO] Fetching SES logs and events...");
    console.log("=".repeat(50));
    
    try {
        // Test AWS credentials first
        const identity = await sts.getCallerIdentity().promise();
        console.log(`[SUCCESS] AWS Identity: ${identity.Arn || 'Unknown'}`);
        console.log(`[SUCCESS] Account ID: ${identity.Account || 'Unknown'}`);
        console.log();
    } catch (error) {
        console.log(`[ERROR] Failed to verify AWS credentials: ${error.message}`);
        return;
    }
    
    // Fetch CloudWatch logs
    const logs = await fetchSESLogs(24);
    
    if (logs.length > 0) {
        console.log(`\n[SUCCESS] Found ${logs.length} log entries:`);
        console.log("-".repeat(30));
        
        logs.sort((a, b) => b.timestamp - a.timestamp);
        for (const log of logs) {
            console.log(`[${log.timestamp.toISOString()}] ${log.logGroup}`);
            console.log(`Stream: ${log.logStream}`);
            console.log(`Message: ${log.message}`);
            console.log("-".repeat(30));
        }
    } else {
        console.log("[WARNING] No SES logs found in CloudWatch (this might be normal if no emails were sent recently)");
    }
    
    // Fetch SES events
    console.log("\n[INFO] Fetching SES account info...");
    const events = await fetchSESEvents();
    
    if (Object.keys(events).length > 0) {
        console.log("[SUCCESS] SES Account Information:");
        console.log(JSON.stringify(events, null, 2));
    } else {
        console.log("[WARNING] Could not retrieve SES account information");
    }
}

if (require.main === module) {
    main().catch(console.error);
}