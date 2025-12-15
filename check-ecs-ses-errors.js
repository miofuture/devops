#!/usr/bin/env node
const AWS = require('aws-sdk');

// Configure AWS region
const REGION = 'eu-central-1';
AWS.config.update({ region: REGION });

const ecs = new AWS.ECS();
const logs = new AWS.CloudWatchLogs();

async function getECSClusters() {
    try {
        const clusters = await ecs.listClusters().promise();
        return clusters.clusterArns;
    } catch (error) {
        console.log(`[ERROR] Failed to list ECS clusters: ${error.message}`);
        return [];
    }
}

async function getECSServices(clusterArn) {
    try {
        const services = await ecs.listServices({ cluster: clusterArn }).promise();
        return services.serviceArns;
    } catch (error) {
        console.log(`[ERROR] Failed to list services for cluster ${clusterArn}: ${error.message}`);
        return [];
    }
}

async function getECSTasks(clusterArn) {
    try {
        const tasks = await ecs.listTasks({ cluster: clusterArn }).promise();
        return tasks.taskArns;
    } catch (error) {
        console.log(`[ERROR] Failed to list tasks for cluster ${clusterArn}: ${error.message}`);
        return [];
    }
}

async function searchECSLogs(hoursBack = 24) {
    const endTime = Date.now();
    const startTime = endTime - (hoursBack * 60 * 60 * 1000);
    
    // Common ECS log group patterns
    const ecsLogPatterns = [
        '/aws/ecs/containerinsights',
        '/ecs/',
        '/aws/ecs/',
        '/fargate/'
    ];
    
    const sesKeywords = ['ses', 'email', 'smtp', 'bounce', 'complaint', 'delivery', 'sendmail'];
    const errorKeywords = ['error', 'failed', 'exception', 'timeout', 'denied'];
    
    let foundErrors = [];
    
    try {
        // Get all log groups
        const logGroups = await logs.describeLogGroups().promise();
        
        for (const logGroup of logGroups.logGroups) {
            const logGroupName = logGroup.logGroupName;
            
            // Check if it's an ECS-related log group
            const isECSLog = ecsLogPatterns.some(pattern => logGroupName.includes(pattern));
            
            if (isECSLog) {
                console.log(`[INFO] Checking ECS log group: ${logGroupName}`);
                
                try {
                    // Get recent log streams
                    const streams = await logs.describeLogStreams({
                        logGroupName: logGroupName,
                        orderBy: 'LastEventTime',
                        descending: true,
                        limit: 10
                    }).promise();
                    
                    for (const stream of streams.logStreams) {
                        try {
                            // Get log events
                            const events = await logs.getLogEvents({
                                logGroupName: logGroupName,
                                logStreamName: stream.logStreamName,
                                startTime: startTime,
                                endTime: endTime
                            }).promise();
                            
                            for (const event of events.events) {
                                const message = event.message.toLowerCase();
                                
                                // Check for SES-related errors
                                const hasSESKeyword = sesKeywords.some(keyword => message.includes(keyword));
                                const hasErrorKeyword = errorKeywords.some(keyword => message.includes(keyword));
                                
                                if (hasSESKeyword && hasErrorKeyword) {
                                    foundErrors.push({
                                        timestamp: new Date(event.timestamp),
                                        logGroup: logGroupName,
                                        logStream: stream.logStreamName,
                                        message: event.message
                                    });
                                }
                            }
                        } catch (streamError) {
                            // Skip streams that can't be read
                        }
                    }
                } catch (groupError) {
                    console.log(`[SKIP] Cannot access log group ${logGroupName}: ${groupError.message}`);
                }
            }
        }
        
    } catch (error) {
        console.log(`[ERROR] Failed to search ECS logs: ${error.message}`);
    }
    
    return foundErrors;
}

async function getECSClusterInfo() {
    console.log(`[INFO] Getting ECS cluster information...`);
    
    const clusters = await getECSClusters();
    
    if (clusters.length === 0) {
        console.log(`[WARNING] No ECS clusters found in region ${REGION}`);
        return;
    }
    
    for (const clusterArn of clusters) {
        const clusterName = clusterArn.split('/').pop();
        console.log(`\n[INFO] Cluster: ${clusterName}`);
        
        // Get services
        const services = await getECSServices(clusterArn);
        console.log(`  Services: ${services.length}`);
        
        // Get tasks
        const tasks = await getECSTasks(clusterArn);
        console.log(`  Running tasks: ${tasks.length}`);
        
        if (services.length > 0) {
            console.log(`  Service ARNs:`);
            services.forEach(service => {
                const serviceName = service.split('/').pop();
                console.log(`    - ${serviceName}`);
            });
        }
    }
}

async function main() {
    console.log("[INFO] Checking ECS clusters and SES-related errors...");
    console.log("=".repeat(60));
    
    // Get ECS cluster information
    await getECSClusterInfo();
    
    // Search for SES-related errors in ECS logs
    console.log(`\n[INFO] Searching ECS logs for SES-related errors...`);
    const errors = await searchECSLogs(24);
    
    if (errors.length > 0) {
        console.log(`\n[FOUND] ${errors.length} SES-related errors in ECS logs:`);
        console.log("-".repeat(60));
        
        errors.sort((a, b) => b.timestamp - a.timestamp);
        
        for (const error of errors) {
            console.log(`[${error.timestamp.toISOString()}] ${error.logGroup}`);
            console.log(`Stream: ${error.logStream}`);
            console.log(`Error: ${error.message}`);
            console.log("-".repeat(60));
        }
    } else {
        console.log(`\n[SUCCESS] No SES-related errors found in ECS logs (last 24 hours)`);
    }
    
    console.log(`\n[INFO] Search completed for region: ${REGION}`);
}

if (require.main === module) {
    main().catch(console.error);
}