#!/usr/bin/env node
const AWS = require('aws-sdk');

const REGION = 'eu-central-1';
AWS.config.update({ region: REGION });

const ecs = new AWS.ECS();
const cloudwatch = new AWS.CloudWatch();
const logs = new AWS.CloudWatchLogs();

async function enableContainerInsights() {
    try {
        await ecs.putAccountSetting({
            name: 'containerInsights',
            value: 'enabled'
        }).promise();
        console.log('✅ Container Insights enabled');
    } catch (error) {
        console.log(`❌ Failed to enable Container Insights: ${error.message}`);
    }
}

async function setLogRetention() {
    try {
        const logGroups = ['/ecs/upscend-dev-assistant-td'];
        
        for (const logGroupName of logGroups) {
            await logs.putRetentionPolicy({
                logGroupName: logGroupName,
                retentionInDays: 7
            }).promise();
            console.log(`✅ Set log retention to 7 days for ${logGroupName}`);
        }
    } catch (error) {
        console.log(`❌ Failed to set log retention: ${error.message}`);
    }
}

async function createStorageAlarms() {
    const alarms = [
        {
            AlarmName: 'upscend-dev-assistant-high-storage',
            MetricName: 'EphemeralStorageUtilized',
            Threshold: 25000000000, // 25GB in bytes
            ComparisonOperator: 'GreaterThanThreshold'
        }
    ];

    for (const alarm of alarms) {
        try {
            await cloudwatch.putMetricAlarm({
                AlarmName: alarm.AlarmName,
                AlarmDescription: 'High storage usage alert',
                MetricName: alarm.MetricName,
                Namespace: 'AWS/ECS',
                Statistic: 'Average',
                Period: 300,
                EvaluationPeriods: 2,
                Threshold: alarm.Threshold,
                ComparisonOperator: alarm.ComparisonOperator,
                Dimensions: [
                    { Name: 'ServiceName', Value: 'upscend-dev-assistant-td-service' },
                    { Name: 'ClusterName', Value: 'upscend-dev-assistant-cluster' }
                ]
            }).promise();
            console.log(`✅ Created alarm: ${alarm.AlarmName}`);
        } catch (error) {
            console.log(`❌ Failed to create alarm ${alarm.AlarmName}: ${error.message}`);
        }
    }
}

async function updateTaskDefinitionWithCleanup() {
    try {
        const taskDef = await ecs.describeTaskDefinition({
            taskDefinition: 'upscend-dev-assistant-td'
        }).promise();

        const newTaskDef = {
            family: taskDef.taskDefinition.family,
            taskRoleArn: taskDef.taskDefinition.taskRoleArn,
            executionRoleArn: taskDef.taskDefinition.executionRoleArn,
            networkMode: taskDef.taskDefinition.networkMode,
            requiresCompatibilities: taskDef.taskDefinition.requiresCompatibilities,
            cpu: taskDef.taskDefinition.cpu,
            memory: taskDef.taskDefinition.memory,
            ephemeralStorage: { sizeInGiB: 40 }, // Increase from 30GB to 40GB
            containerDefinitions: taskDef.taskDefinition.containerDefinitions.map(container => ({
                ...container,
                environment: [
                    ...(container.environment || []),
                    { name: 'LOG_ROTATION_ENABLED', value: 'true' },
                    { name: 'CLEANUP_INTERVAL', value: '3600' }
                ],
                logConfiguration: {
                    ...container.logConfiguration,
                    options: {
                        ...container.logConfiguration?.options,
                        'max-buffer-size': '25m',
                        'mode': 'non-blocking'
                    }
                }
            }))
        };

        const result = await ecs.registerTaskDefinition(newTaskDef).promise();
        console.log(`✅ Updated task definition: ${result.taskDefinition.taskDefinitionArn}`);

        // Update service
        await ecs.updateService({
            cluster: 'upscend-dev-assistant-cluster',
            service: 'upscend-dev-assistant-td-service',
            taskDefinition: result.taskDefinition.taskDefinitionArn
        }).promise();
        console.log('✅ Service updated with new task definition');

    } catch (error) {
        console.log(`❌ Failed to update task definition: ${error.message}`);
    }
}

async function schedulePeriodicRestart() {
    try {
        const events = new AWS.EventBridge();
        
        await events.putRule({
            Name: 'upscend-assistant-weekly-restart',
            Description: 'Weekly restart for storage cleanup',
            ScheduleExpression: 'rate(7 days)',
            State: 'ENABLED'
        }).promise();

        await events.putTargets({
            Rule: 'upscend-assistant-weekly-restart',
            Targets: [{
                Id: '1',
                Arn: `arn:aws:ecs:${REGION}:${await getAccountId()}:cluster/upscend-dev-assistant-cluster`,
                RoleArn: await getECSTaskRole(),
                EcsParameters: {
                    TaskDefinitionArn: 'upscend-dev-assistant-td',
                    LaunchType: 'FARGATE'
                }
            }]
        }).promise();

        console.log('✅ Scheduled weekly restart');
    } catch (error) {
        console.log(`❌ Failed to schedule restart: ${error.message}`);
    }
}

async function getAccountId() {
    const sts = new AWS.STS();
    const identity = await sts.getCallerIdentity().promise();
    return identity.Account;
}

async function getECSTaskRole() {
    const iam = new AWS.IAM();
    try {
        const role = await iam.getRole({ RoleName: 'ecsTaskExecutionRole' }).promise();
        return role.Role.Arn;
    } catch {
        return `arn:aws:iam::${await getAccountId()}:role/ecsTaskExecutionRole`;
    }
}

async function main() {
    console.log('[INFO] Applying storage fixes for upscend-dev-assistant-cluster');
    console.log('='.repeat(60));

    await enableContainerInsights();
    await setLogRetention();
    await createStorageAlarms();
    await updateTaskDefinitionWithCleanup();
    await schedulePeriodicRestart();

    console.log('\n✅ All storage fixes applied successfully!');
    console.log('📋 Summary of changes:');
    console.log('• Container Insights enabled');
    console.log('• Log retention set to 7 days');
    console.log('• Storage monitoring alarms created');
    console.log('• Ephemeral storage increased to 40GB');
    console.log('• Log rotation and cleanup enabled');
    console.log('• Weekly restart scheduled');
}

if (require.main === module) {
    main().catch(console.error);
}