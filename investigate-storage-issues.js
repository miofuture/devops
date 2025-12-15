#!/usr/bin/env node
const AWS = require('aws-sdk');

const REGION = 'eu-central-1';
AWS.config.update({ region: REGION });

const ecs = new AWS.ECS();
const cloudwatch = new AWS.CloudWatch();
const logs = new AWS.CloudWatchLogs();

async function getClusterServices() {
    try {
        const clusters = await ecs.listClusters().promise();
        const services = [];
        
        for (const clusterArn of clusters.clusterArns) {
            const clusterName = clusterArn.split('/').pop();
            
            if (clusterName.includes('upscend-dev-assistant-cluster')) {
                const serviceList = await ecs.listServices({ cluster: clusterArn }).promise();
                
                if (serviceList.serviceArns.length > 0) {
                    const serviceDetails = await ecs.describeServices({
                        cluster: clusterArn,
                        services: serviceList.serviceArns
                    }).promise();
                    
                    for (const service of serviceDetails.services) {
                        services.push({
                            clusterName,
                            serviceName: service.serviceName,
                            taskDefinition: service.taskDefinition,
                            runningCount: service.runningCount,
                            desiredCount: service.desiredCount
                        });
                    }
                }
            }
        }
        
        return services;
    } catch (error) {
        console.log(`[ERROR] Failed to get services: ${error.message}`);
        return [];
    }
}

async function checkTaskDefinitionStorage(taskDefArn) {
    try {
        const result = await ecs.describeTaskDefinition({
            taskDefinition: taskDefArn
        }).promise();
        
        const taskDef = result.taskDefinition;
        const storageInfo = {
            ephemeralStorage: taskDef.ephemeralStorage,
            volumes: taskDef.volumes || [],
            containerMounts: []
        };
        
        taskDef.containerDefinitions.forEach(container => {
            if (container.mountPoints && container.mountPoints.length > 0) {
                storageInfo.containerMounts.push({
                    containerName: container.name,
                    mountPoints: container.mountPoints
                });
            }
        });
        
        return storageInfo;
    } catch (error) {
        console.log(`[ERROR] Failed to get task definition: ${error.message}`);
        return null;
    }
}

async function getStorageMetrics(clusterName, serviceName) {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 60 * 60 * 1000); // Last hour
    
    const metrics = [
        'EphemeralStorageUtilized',
        'StorageReadBytes',
        'StorageWriteBytes'
    ];
    
    const results = {};
    
    for (const metricName of metrics) {
        try {
            const params = {
                MetricName: metricName,
                Namespace: 'AWS/ECS',
                StartTime: startTime,
                EndTime: endTime,
                Period: 300,
                Statistics: ['Average', 'Maximum'],
                Dimensions: [
                    { Name: 'ServiceName', Value: serviceName },
                    { Name: 'ClusterName', Value: clusterName }
                ]
            };
            
            const data = await cloudwatch.getMetricStatistics(params).promise();
            results[metricName] = data.Datapoints;
        } catch (error) {
            results[metricName] = [];
        }
    }
    
    return results;
}

async function searchStorageLogs(serviceName, hoursBack = 24) {
    const endTime = Date.now();
    const startTime = endTime - (hoursBack * 60 * 60 * 1000);
    
    const storageKeywords = ['storage', 'disk', 'space', 'full', 'no space', 'enospc', 'volume'];
    const errorKeywords = ['error', 'failed', 'exception', 'critical', 'fatal'];
    
    let foundErrors = [];
    
    try {
        const logGroups = await logs.describeLogGroups().promise();
        
        for (const logGroup of logGroups.logGroups) {
            const logGroupName = logGroup.logGroupName;
            
            if (logGroupName.includes(serviceName) || logGroupName.includes('upscend')) {
                console.log(`[INFO] Checking log group: ${logGroupName}`);
                
                try {
                    const streams = await logs.describeLogStreams({
                        logGroupName: logGroupName,
                        orderBy: 'LastEventTime',
                        descending: true,
                        limit: 5
                    }).promise();
                    
                    for (const stream of streams.logStreams) {
                        try {
                            const events = await logs.getLogEvents({
                                logGroupName: logGroupName,
                                logStreamName: stream.logStreamName,
                                startTime: startTime,
                                endTime: endTime
                            }).promise();
                            
                            for (const event of events.events) {
                                const message = event.message.toLowerCase();
                                
                                const hasStorageKeyword = storageKeywords.some(keyword => message.includes(keyword));
                                const hasErrorKeyword = errorKeywords.some(keyword => message.includes(keyword));
                                
                                if (hasStorageKeyword && hasErrorKeyword) {
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
                    console.log(`[SKIP] Cannot access log group ${logGroupName}`);
                }
            }
        }
        
    } catch (error) {
        console.log(`[ERROR] Failed to search logs: ${error.message}`);
    }
    
    return foundErrors;
}

async function main() {
    console.log("[INFO] Investigating storage issues in upscend-dev-assistant-cluster");
    console.log("=".repeat(70));
    
    const services = await getClusterServices();
    
    if (services.length === 0) {
        console.log("[WARNING] No services found in upscend-dev-assistant-cluster");
        return;
    }
    
    console.log(`[INFO] Found ${services.length} services to investigate:`);
    services.forEach(service => {
        console.log(`  - ${service.clusterName}/${service.serviceName}`);
        console.log(`    Running: ${service.runningCount}/${service.desiredCount} tasks`);
    });
    
    for (const service of services) {
        console.log(`\n--- Investigating ${service.serviceName} ---`);
        
        // Check task definition storage configuration
        console.log("[INFO] Checking task definition storage configuration...");
        const storageInfo = await checkTaskDefinitionStorage(service.taskDefinition);
        
        if (storageInfo) {
            console.log("Storage Configuration:");
            if (storageInfo.ephemeralStorage) {
                console.log(`  Ephemeral Storage: ${storageInfo.ephemeralStorage.sizeInGiB} GiB`);
            } else {
                console.log("  Ephemeral Storage: Default (20 GiB)");
            }
            
            if (storageInfo.volumes.length > 0) {
                console.log("  Volumes:");
                storageInfo.volumes.forEach(vol => {
                    console.log(`    - ${vol.name}: ${JSON.stringify(vol)}`);
                });
            }
            
            if (storageInfo.containerMounts.length > 0) {
                console.log("  Container Mounts:");
                storageInfo.containerMounts.forEach(mount => {
                    console.log(`    Container: ${mount.containerName}`);
                    mount.mountPoints.forEach(mp => {
                        console.log(`      ${mp.sourceVolume} -> ${mp.containerPath}`);
                    });
                });
            }
        }
        
        // Check CloudWatch metrics
        console.log("\n[INFO] Checking storage metrics...");
        const metrics = await getStorageMetrics(service.clusterName, service.serviceName);
        
        Object.keys(metrics).forEach(metricName => {
            const datapoints = metrics[metricName];
            if (datapoints.length > 0) {
                const latest = datapoints[datapoints.length - 1];
                console.log(`  ${metricName}: Avg=${latest.Average?.toFixed(2)}, Max=${latest.Maximum?.toFixed(2)}`);
            } else {
                console.log(`  ${metricName}: No data available`);
            }
        });
        
        // Search for storage-related errors in logs
        console.log("\n[INFO] Searching for storage-related errors in logs...");
        const errors = await searchStorageLogs(service.serviceName, 24);
        
        if (errors.length > 0) {
            console.log(`[FOUND] ${errors.length} storage-related errors:`);
            errors.sort((a, b) => b.timestamp - a.timestamp);
            
            errors.slice(0, 5).forEach(error => {
                console.log(`  [${error.timestamp.toISOString()}] ${error.message.substring(0, 100)}...`);
            });
        } else {
            console.log("  No storage-related errors found in recent logs");
        }
    }
    
    console.log(`\n[INFO] Investigation completed for region: ${REGION}`);
}

if (require.main === module) {
    main().catch(console.error);
}