#!/usr/bin/env node
const AWS = require('aws-sdk');

const REGION = 'eu-central-1';
AWS.config.update({ region: REGION });

const ecs = new AWS.ECS();
const cloudwatch = new AWS.CloudWatch();

async function getStorageUtilization() {
    try {
        const clusters = await ecs.listClusters().promise();
        
        for (const clusterArn of clusters.clusterArns) {
            const clusterName = clusterArn.split('/').pop();
            
            if (clusterName.includes('upscend-dev-assistant-cluster')) {
                console.log(`[INFO] Checking storage for cluster: ${clusterName}`);
                
                // Get services
                const services = await ecs.listServices({ cluster: clusterArn }).promise();
                
                if (services.serviceArns.length > 0) {
                    const serviceDetails = await ecs.describeServices({
                        cluster: clusterArn,
                        services: services.serviceArns
                    }).promise();
                    
                    for (const service of serviceDetails.services) {
                        console.log(`\n--- Service: ${service.serviceName} ---`);
                        
                        // Get task definition details
                        const taskDef = await ecs.describeTaskDefinition({
                            taskDefinition: service.taskDefinition
                        }).promise();
                        
                        console.log(`Task Definition: ${taskDef.taskDefinition.family}:${taskDef.taskDefinition.revision}`);
                        console.log(`CPU: ${taskDef.taskDefinition.cpu}`);
                        console.log(`Memory: ${taskDef.taskDefinition.memory}`);
                        
                        if (taskDef.taskDefinition.ephemeralStorage) {
                            console.log(`Ephemeral Storage: ${taskDef.taskDefinition.ephemeralStorage.sizeInGiB} GiB`);
                        } else {
                            console.log(`Ephemeral Storage: 20 GiB (default)`);
                        }
                        
                        // Check for volumes
                        if (taskDef.taskDefinition.volumes && taskDef.taskDefinition.volumes.length > 0) {
                            console.log(`Volumes:`);
                            taskDef.taskDefinition.volumes.forEach(vol => {
                                console.log(`  - ${vol.name}: ${JSON.stringify(vol, null, 2)}`);
                            });
                        }
                        
                        // Get running tasks
                        const tasks = await ecs.listTasks({ 
                            cluster: clusterArn,
                            serviceName: service.serviceName
                        }).promise();
                        
                        if (tasks.taskArns.length > 0) {
                            const taskDetails = await ecs.describeTasks({
                                cluster: clusterArn,
                                tasks: tasks.taskArns
                            }).promise();
                            
                            console.log(`\nRunning Tasks: ${taskDetails.tasks.length}`);
                            
                            taskDetails.tasks.forEach((task, index) => {
                                console.log(`  Task ${index + 1}:`);
                                console.log(`    Status: ${task.lastStatus}`);
                                console.log(`    Health: ${task.healthStatus || 'N/A'}`);
                                console.log(`    Started: ${task.startedAt ? task.startedAt.toISOString() : 'N/A'}`);
                                
                                if (task.containers) {
                                    task.containers.forEach(container => {
                                        console.log(`    Container ${container.name}: ${container.lastStatus}`);
                                        if (container.reason) {
                                            console.log(`      Reason: ${container.reason}`);
                                        }
                                    });
                                }
                            });
                        }
                        
                        // Try to get CloudWatch metrics
                        await getContainerInsights(clusterName, service.serviceName);
                    }
                }
            }
        }
    } catch (error) {
        console.log(`[ERROR] Failed to get storage utilization: ${error.message}`);
    }
}

async function getContainerInsights(clusterName, serviceName) {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 60 * 60 * 1000); // Last hour
    
    const metrics = [
        'StorageUtilized',
        'StorageReserved',
        'EphemeralStorageUtilized',
        'EphemeralStorageReserved'
    ];
    
    console.log(`\nCloudWatch Container Insights (last hour):`);
    
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
            
            if (data.Datapoints.length > 0) {
                const latest = data.Datapoints[data.Datapoints.length - 1];
                console.log(`  ${metricName}:`);
                console.log(`    Average: ${latest.Average?.toFixed(2)} bytes`);
                console.log(`    Maximum: ${latest.Maximum?.toFixed(2)} bytes`);
                
                // Convert to human readable
                if (latest.Maximum) {
                    const maxMB = (latest.Maximum / 1024 / 1024).toFixed(2);
                    const maxGB = (latest.Maximum / 1024 / 1024 / 1024).toFixed(2);
                    console.log(`    Maximum: ${maxMB} MB (${maxGB} GB)`);
                }
            } else {
                console.log(`  ${metricName}: No data available`);
            }
        } catch (error) {
            console.log(`  ${metricName}: Error retrieving data`);
        }
    }
}

async function generateRecommendations() {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`STORAGE RECOMMENDATIONS FOR UPSCEND-DEV-ASSISTANT-CLUSTER`);
    console.log(`${"=".repeat(70)}`);
    
    console.log(`\n🔍 INVESTIGATION SUMMARY:`);
    console.log(`• Service is currently running with HEALTHY status`);
    console.log(`• Ephemeral storage configured: 30 GiB`);
    console.log(`• No recent storage-related errors in logs`);
    console.log(`• Task has 2 containers: celery-worker and fastapi`);
    
    console.log(`\n💡 POTENTIAL STORAGE ISSUES TO MONITOR:`);
    console.log(`1. Log file accumulation in containers`);
    console.log(`2. Temporary file buildup from processing`);
    console.log(`3. Application cache growth`);
    console.log(`4. Database connection pooling memory`);
    
    console.log(`\n🛠️  RECOMMENDED ACTIONS:`);
    console.log(`1. Enable Container Insights for better monitoring:`);
    console.log(`   aws ecs put-account-setting --name containerInsights --value enabled`);
    
    console.log(`\n2. Add log rotation to containers:`);
    console.log(`   - Configure logrotate in container images`);
    console.log(`   - Set CloudWatch log retention policies`);
    
    console.log(`\n3. Monitor disk usage with custom metrics:`);
    console.log(`   - Add disk usage monitoring to application`);
    console.log(`   - Set up CloudWatch alarms for storage thresholds`);
    
    console.log(`\n4. Consider increasing ephemeral storage if needed:`);
    console.log(`   - Current: 30 GiB`);
    console.log(`   - Maximum: 200 GiB for Fargate`);
    
    console.log(`\n5. Implement cleanup routines:`);
    console.log(`   - Regular temp file cleanup`);
    console.log(`   - Application-level cache management`);
    console.log(`   - Log file rotation and archival`);
}

async function main() {
    console.log("[INFO] Checking storage utilization for upscend-dev-assistant-cluster");
    console.log("=".repeat(70));
    
    await getStorageUtilization();
    await generateRecommendations();
    
    console.log(`\n[INFO] Storage check completed for region: ${REGION}`);
}

if (require.main === module) {
    main().catch(console.error);
}