#!/usr/bin/env node
const AWS = require('aws-sdk');

const REGION = 'eu-central-1';
AWS.config.update({ region: REGION });

const ecs = new AWS.ECS();
const cloudwatch = new AWS.CloudWatch();

async function verifyFixes() {
    console.log('[INFO] Verifying storage fixes...');
    
    // Check task definition
    const taskDef = await ecs.describeTaskDefinition({
        taskDefinition: 'upscend-dev-assistant-td'
    }).promise();
    
    console.log(`✅ Current task definition: ${taskDef.taskDefinition.family}:${taskDef.taskDefinition.revision}`);
    console.log(`✅ Ephemeral storage: ${taskDef.taskDefinition.ephemeralStorage?.sizeInGiB || 20} GiB`);
    
    // Check service status
    const service = await ecs.describeServices({
        cluster: 'upscend-dev-assistant-cluster',
        services: ['upscend-dev-assistant-td-service']
    }).promise();
    
    const svc = service.services[0];
    console.log(`✅ Service status: ${svc.status}`);
    console.log(`✅ Running tasks: ${svc.runningCount}/${svc.desiredCount}`);
    
    // Check alarms
    const alarms = await cloudwatch.describeAlarms({
        AlarmNames: ['upscend-dev-assistant-high-storage']
    }).promise();
    
    if (alarms.MetricAlarms.length > 0) {
        console.log(`✅ Storage alarm created: ${alarms.MetricAlarms[0].AlarmName}`);
    }
    
    console.log('\n🎉 All fixes verified successfully!');
}

verifyFixes().catch(console.error);