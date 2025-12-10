#!/usr/bin/env node
const AWS = require('aws-sdk');

// Configure AWS region
const REGION = 'eu-central-1';
const CONFIG_SET = 'my-first-configuration-set';

AWS.config.update({ region: REGION });

const ses = new AWS.SES();
const logs = new AWS.CloudWatchLogs();

async function sendTestEmail(configSet = CONFIG_SET) {
    const fromEmail = 'support@upscend.com';
    const toEmail = 'support@upscend.com';
    const subject = `SES Test Email - ${new Date().toISOString()}`;
    
    const message = `
This is a test email sent via Amazon SES.

Timestamp: ${new Date().toISOString()}
Configuration Set: ${configSet}
Purpose: Testing SES logging and tracing

This email should generate delivery logs in CloudWatch.
    `;
    
    try {
        console.log(`[INFO] Sending test email...`);
        console.log(`From: ${fromEmail}`);
        console.log(`To: ${toEmail}`);
        console.log(`Subject: ${subject}`);
        
        const response = await ses.sendEmail({
            Source: fromEmail,
            Destination: { ToAddresses: [toEmail] },
            Message: {
                Subject: { Data: subject },
                Body: { Text: { Data: message } }
            },
            ConfigurationSetName: configSet,
            Tags: [
                { Name: 'Purpose', Value: 'Testing' },
                { Name: 'Environment', Value: 'Development' }
            ]
        }).promise();
        
        const messageId = response.MessageId;
        console.log(`[SUCCESS] Email sent! Message ID: ${messageId}`);
        return messageId;
        
    } catch (error) {
        console.log(`[ERROR] Failed to send email: ${error.message}`);
        return null;
    }
}

async function traceEmailLogs(messageId, waitTime = 30) {
    console.log(`\n[INFO] Waiting ${waitTime} seconds for logs to appear...`);
    await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
    
    const logGroups = ['/aws/ses/delivery', '/aws/ses/bounce', '/aws/ses/complaint'];
    
    // Calculate time range (last 5 minutes)
    const endTime = Date.now();
    const startTime = endTime - (5 * 60 * 1000); // 5 minutes ago
    
    let foundLogs = false;
    
    for (const logGroup of logGroups) {
        try {
            console.log(`\n[INFO] Checking ${logGroup}...`);
            
            // Get log streams
            const streams = await logs.describeLogStreams({
                logGroupName: logGroup,
                orderBy: 'LastEventTime',
                descending: true,
                limit: 5
            }).promise();
            
            for (const stream of streams.logStreams) {
                // Get log events
                const events = await logs.getLogEvents({
                    logGroupName: logGroup,
                    logStreamName: stream.logStreamName,
                    startTime: startTime,
                    endTime: endTime
                }).promise();
                
                for (const event of events.events) {
                    // Check if this log contains our message ID
                    if (event.message.includes(messageId)) {
                        foundLogs = true;
                        const timestamp = new Date(event.timestamp);
                        console.log(`[FOUND] Log entry at ${timestamp.toISOString()}`);
                        console.log(`Log Group: ${logGroup}`);
                        console.log(`Message: ${event.message}`);
                        console.log("-".repeat(50));
                        
                        // Try to parse JSON if possible
                        try {
                            const logData = JSON.parse(event.message);
                            console.log("Parsed log data:");
                            console.log(JSON.stringify(logData, null, 2));
                        } catch (parseError) {
                            // Not JSON, that's fine
                        }
                        console.log("-".repeat(50));
                    }
                }
            }
            
        } catch (error) {
            if (error.message.includes('does not exist')) {
                console.log(`[SKIP] ${logGroup} - no logs yet`);
            } else {
                console.log(`[ERROR] ${logGroup}: ${error.message}`);
            }
        }
    }
    
    if (!foundLogs) {
        console.log(`\n[WARNING] No logs found for message ID: ${messageId}`);
        console.log("This might be normal - logs can take a few minutes to appear");
        console.log("Try running: npm run fetch-logs");
    }
    
    return foundLogs;
}

async function main() {
    console.log("[INFO] Sending test email and tracing logs...");
    console.log("=".repeat(50));
    
    // Send test email
    const messageId = await sendTestEmail();
    
    if (messageId) {
        // Trace the email logs
        await traceEmailLogs(messageId);
        
        console.log(`\n[INFO] You can also check logs manually:`);
        console.log(`1. Run: npm run fetch-logs`);
        console.log(`2. Check AWS Console CloudWatch Logs`);
        console.log(`3. Look for message ID: ${messageId}`);
    } else {
        console.log(`\n[ERROR] Email sending failed - cannot trace logs`);
    }
}

if (require.main === module) {
    main().catch(console.error);
}