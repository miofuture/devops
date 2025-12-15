#!/usr/bin/env node
const { execSync } = require('child_process');
const AWS = require('aws-sdk');

const REGION = 'eu-central-1';
AWS.config.update({ region: REGION });

const ecs = new AWS.ECS();

async function enableECSExec(clusterName, serviceName) {
    try {
        console.log(`[INFO] Enabling ECS Exec for ${serviceName}...`);
        
        await ecs.updateService({
            cluster: clusterName,
            service: serviceName,
            enableExecuteCommand: true
        }).promise();
        
        console.log(`✅ ECS Exec enabled for ${serviceName}`);
        return true;
    } catch (error) {
        console.log(`❌ Failed to enable ECS Exec: ${error.message}`);
        return false;
    }
}

async function getRunningTasks(clusterName, serviceName) {
    try {
        const tasks = await ecs.listTasks({
            cluster: clusterName,
            serviceName: serviceName
        }).promise();
        
        if (tasks.taskArns.length === 0) {
            console.log(`❌ No running tasks found for ${serviceName}`);
            return null;
        }
        
        const taskArn = tasks.taskArns[0];
        const taskId = taskArn.split('/').pop();
        
        console.log(`✅ Found running task: ${taskId}`);
        return taskId;
    } catch (error) {
        console.log(`❌ Failed to get tasks: ${error.message}`);
        return null;
    }
}

function showConnectionCommands(clusterName, taskId, containerName) {
    console.log(`\n[CONNECT] Commands to connect to ${containerName}:`);
    
    const bashCommand = `aws ecs execute-command --region ${REGION} --cluster ${clusterName} --task ${taskId} --container ${containerName} --interactive --command "/bin/bash"`;
    const shCommand = `aws ecs execute-command --region ${REGION} --cluster ${clusterName} --task ${taskId} --container ${containerName} --interactive --command "/bin/sh"`;
    
    console.log(`\nBash: ${bashCommand}`);
    console.log(`\nSh:   ${shCommand}`);
}

async function setupDevCluster() {
    console.log("=".repeat(60));
    console.log("CONNECT TO DEV FARGATE CONTAINERS");
    console.log("=".repeat(60));
    
    const clusterName = 'upscend-dev-api-cluster';
    const services = [
        'upscend-dev-api-td-service',
        'upscend-dev-api-td-auth-service',
        'upscend-dev-api-td-notif-service'
    ];
    
    for (const serviceName of services) {
        console.log(`\n[SERVICE] ${serviceName}`);
        console.log("-".repeat(40));
        
        // Enable ECS Exec
        const execEnabled = await enableECSExec(clusterName, serviceName);
        if (!execEnabled) continue;
        
        // Get running task
        const taskId = await getRunningTasks(clusterName, serviceName);
        if (!taskId) continue;
        
        // Show connection commands
        const containerName = serviceName.includes('auth') ? 'upscend-api-auth' : 
                             serviceName.includes('notif') ? 'upscend-api-notif' : 'upscend-api';
        
        showConnectionCommands(clusterName, taskId, containerName);
    }
    
    console.log(`\n[USAGE] Once connected, you can:`);
    console.log(`  • Check environment: env | grep -E "(MAIL|SMTP|SES)"`);
    console.log(`  • Check app logs: find /var/log -name "*.log" -exec tail -f {} +`);
    console.log(`  • Check processes: ps aux | grep node`);
    console.log(`  • Test email config: node -e "console.log(process.env.SES_SMTP_HOST)"`);
    console.log(`  • Exit: exit`);
}

async function setupProdCluster() {
    console.log("\n" + "=".repeat(60));
    console.log("CONNECT TO PROD FARGATE CONTAINERS");
    console.log("=".repeat(60));
    
    const clusterName = 'upscend-prod-api-cluster';
    const services = [
        'upscend-prod-api-td-service',
        'upscend-prod-api-td-auth-service',
        'upscend-prod-api-td-notif-service'
    ];
    
    for (const serviceName of services) {
        console.log(`\n[SERVICE] ${serviceName}`);
        console.log("-".repeat(40));
        
        // Enable ECS Exec
        const execEnabled = await enableECSExec(clusterName, serviceName);
        if (!execEnabled) continue;
        
        // Get running task
        const taskId = await getRunningTasks(clusterName, serviceName);
        if (!taskId) continue;
        
        // Show connection commands
        const containerName = serviceName.includes('auth') ? 'upscend-api-auth' : 
                             serviceName.includes('notif') ? 'upscend-api-notif' : 'upscend-api';
        
        showConnectionCommands(clusterName, taskId, containerName);
    }
}

async function main() {
    await setupDevCluster();
    await setupProdCluster();
    
    console.log(`\n[NOTE] Wait 30-60 seconds after enabling ECS Exec before connecting`);
    console.log(`[NOTE] Make sure AWS CLI is installed and configured`);
}

if (require.main === module) {
    main().catch(console.error);
}