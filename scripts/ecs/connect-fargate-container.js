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

function connectToContainer(clusterName, taskId, containerName = 'upscend-api-auth') {
    console.log(`\n[INFO] Connecting to container...`);
    console.log(`Cluster: ${clusterName}`);
    console.log(`Task: ${taskId}`);
    console.log(`Container: ${containerName}`);
    
    const command = `aws ecs execute-command --region ${REGION} --cluster ${clusterName} --task ${taskId} --container ${containerName} --interactive --command "/bin/bash"`;
    
    console.log(`\n[COMMAND] Run this command to connect:`);
    console.log(command);
    
    console.log(`\n[ALTERNATIVE] If bash doesn't work, try:`);
    console.log(command.replace('/bin/bash', '/bin/sh'));
    
    try {
        console.log(`\n[INFO] Attempting to connect automatically...`);
        execSync(command, { stdio: 'inherit' });
    } catch (error) {
        console.log(`\n[INFO] Auto-connect failed. Please run the command manually.`);
        console.log(`Make sure you have AWS CLI installed and configured.`);
    }
}

async function main() {
    console.log("=".repeat(60));
    console.log("CONNECT TO FARGATE CONTAINER");
    console.log("=".repeat(60));
    
    const clusterName = 'upscend-prod-api-cluster';
    const serviceName = 'upscend-prod-api-td-auth-service';
    
    console.log(`[INFO] Target: ${clusterName}/${serviceName}`);
    
    // Step 1: Enable ECS Exec
    const execEnabled = await enableECSExec(clusterName, serviceName);
    if (!execEnabled) {
        console.log(`[ERROR] Cannot enable ECS Exec. Check permissions.`);
        return;
    }
    
    // Step 2: Wait for service to update
    console.log(`[INFO] Waiting 30 seconds for service to update...`);
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    // Step 3: Get running task
    const taskId = await getRunningTasks(clusterName, serviceName);
    if (!taskId) {
        console.log(`[ERROR] No running tasks found.`);
        return;
    }
    
    // Step 4: Connect to container
    connectToContainer(clusterName, taskId);
    
    console.log(`\n[USAGE] Once connected, you can:`);
    console.log(`  • Check logs: tail -f /var/log/app.log`);
    console.log(`  • Check environment: env | grep -i mail`);
    console.log(`  • Check processes: ps aux`);
    console.log(`  • Check network: netstat -tlnp`);
    console.log(`  • Exit: exit`);
}

if (require.main === module) {
    main().catch(console.error);
}