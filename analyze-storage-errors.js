#!/usr/bin/env node
const AWS = require('aws-sdk');

const REGION = 'eu-central-1';
AWS.config.update({ region: REGION });

const logs = new AWS.CloudWatchLogs();
const ecs = new AWS.ECS();

async function getDetailedStorageErrors(hoursBack = 24) {
    const endTime = Date.now();
    const startTime = endTime - (hoursBack * 60 * 60 * 1000);
    
    const storageKeywords = ['storage', 'disk', 'space', 'full', 'no space', 'enospc', 'volume'];
    const errorKeywords = ['error', 'failed', 'exception', 'critical', 'fatal'];
    
    let foundErrors = [];
    
    try {
        const logGroups = await logs.describeLogGroups().promise();
        
        for (const logGroup of logGroups.logGroups) {
            const logGroupName = logGroup.logGroupName;
            
            if (logGroupName.includes('upscend-dev-assistant') || logGroupName.includes('/ecs/upscend-dev-assistant-td')) {
                console.log(`[INFO] Analyzing log group: ${logGroupName}`);
                
                try {
                    const streams = await logs.describeLogStreams({
                        logGroupName: logGroupName,
                        orderBy: 'LastEventTime',
                        descending: true,
                        limit: 10
                    }).promise();
                    
                    for (const stream of streams.logStreams) {
                        try {
                            const events = await logs.getLogEvents({
                                logGroupName: logGroupName,
                                logStreamName: stream.logStreamName,
                                startTime: startTime,
                                endTime: endTime,
                                limit: 100
                            }).promise();
                            
                            for (const event of events.events) {
                                const message = event.message.toLowerCase();
                                
                                const hasStorageKeyword = storageKeywords.some(keyword => message.includes(keyword));
                                const hasErrorKeyword = errorKeywords.some(keyword => message.includes(keyword));
                                
                                if (hasStorageKeyword || hasErrorKeyword) {
                                    foundErrors.push({
                                        timestamp: new Date(event.timestamp),
                                        logGroup: logGroupName,
                                        logStream: stream.logStreamName,
                                        message: event.message,
                                        isStorageRelated: hasStorageKeyword,
                                        isError: hasErrorKeyword
                                    });
                                }
                            }
                        } catch (streamError) {
                            console.log(`[SKIP] Cannot read stream ${stream.logStreamName}: ${streamError.message}`);
                        }
                    }
                } catch (groupError) {
                    console.log(`[SKIP] Cannot access log group ${logGroupName}: ${groupError.message}`);
                }
            }
        }
        
    } catch (error) {
        console.log(`[ERROR] Failed to search logs: ${error.message}`);
    }
    
    return foundErrors;
}

async function getTaskDetails() {
    try {
        const clusters = await ecs.listClusters().promise();
        
        for (const clusterArn of clusters.clusterArns) {
            const clusterName = clusterArn.split('/').pop();
            
            if (clusterName.includes('upscend-dev-assistant-cluster')) {
                console.log(`[INFO] Getting task details for cluster: ${clusterName}`);
                
                const tasks = await ecs.listTasks({ cluster: clusterArn }).promise();
                
                if (tasks.taskArns.length > 0) {
                    const taskDetails = await ecs.describeTasks({
                        cluster: clusterArn,
                        tasks: tasks.taskArns
                    }).promise();
                    
                    for (const task of taskDetails.tasks) {
                        console.log(`\nTask: ${task.taskArn.split('/').pop()}`);
                        console.log(`  Status: ${task.lastStatus}`);
                        console.log(`  Health: ${task.healthStatus || 'N/A'}`);
                        console.log(`  CPU/Memory: ${task.cpu}/${task.memory}`);
                        
                        if (task.containers) {
                            task.containers.forEach(container => {
                                console.log(`  Container: ${container.name}`);
                                console.log(`    Status: ${container.lastStatus}`);
                                console.log(`    Health: ${container.healthStatus || 'N/A'}`);
                                
                                if (container.reason) {
                                    console.log(`    Reason: ${container.reason}`);
                                }
                            });
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.log(`[ERROR] Failed to get task details: ${error.message}`);
    }
}

async function main() {
    console.log("[INFO] Analyzing storage errors in upscend-dev-assistant-cluster");
    console.log("=".repeat(70));
    
    // Get current task status
    await getTaskDetails();
    
    console.log("\n[INFO] Searching for detailed storage and error logs...");
    const errors = await getDetailedStorageErrors(24);
    
    if (errors.length > 0) {
        console.log(`\n[FOUND] ${errors.length} relevant log entries:`);
        console.log("-".repeat(70));
        
        // Sort by timestamp (newest first)
        errors.sort((a, b) => b.timestamp - a.timestamp);
        
        // Group by type
        const storageErrors = errors.filter(e => e.isStorageRelated);
        const generalErrors = errors.filter(e => e.isError && !e.isStorageRelated);
        
        if (storageErrors.length > 0) {
            console.log(`\n🔴 STORAGE-RELATED ERRORS (${storageErrors.length}):`);
            storageErrors.slice(0, 10).forEach(error => {
                console.log(`[${error.timestamp.toISOString()}]`);
                console.log(`Log: ${error.logGroup}`);
                console.log(`Message: ${error.message}`);
                console.log("-".repeat(50));
            });
        }
        
        if (generalErrors.length > 0) {
            console.log(`\n⚠️  GENERAL ERRORS (${generalErrors.length}):`);
            generalErrors.slice(0, 10).forEach(error => {
                console.log(`[${error.timestamp.toISOString()}]`);
                console.log(`Log: ${error.logGroup}`);
                console.log(`Message: ${error.message}`);
                console.log("-".repeat(50));
            });
        }
        
        // Analyze patterns
        console.log(`\n📊 ERROR ANALYSIS:`);
        const messagePatterns = {};
        errors.forEach(error => {
            const msg = error.message.toLowerCase();
            if (msg.includes('no space')) messagePatterns['No Space Left'] = (messagePatterns['No Space Left'] || 0) + 1;
            if (msg.includes('disk full')) messagePatterns['Disk Full'] = (messagePatterns['Disk Full'] || 0) + 1;
            if (msg.includes('enospc')) messagePatterns['ENOSPC Error'] = (messagePatterns['ENOSPC Error'] || 0) + 1;
            if (msg.includes('storage')) messagePatterns['Storage Issues'] = (messagePatterns['Storage Issues'] || 0) + 1;
            if (msg.includes('memory')) messagePatterns['Memory Issues'] = (messagePatterns['Memory Issues'] || 0) + 1;
            if (msg.includes('timeout')) messagePatterns['Timeout'] = (messagePatterns['Timeout'] || 0) + 1;
        });
        
        Object.keys(messagePatterns).forEach(pattern => {
            console.log(`  ${pattern}: ${messagePatterns[pattern]} occurrences`);
        });
        
    } else {
        console.log("\n✅ No storage-related errors found in recent logs");
    }
    
    console.log(`\n[INFO] Analysis completed for region: ${REGION}`);
}

if (require.main === module) {
    main().catch(console.error);
}