#!/usr/bin/env node
const AWS = require('aws-sdk');

// Configure AWS region
const REGION = 'eu-central-1';
AWS.config.update({ region: REGION });

const ecs = new AWS.ECS();

// SMTP Environment Variables to add
const SMTP_ENV_VARS = [
    { name: 'SES_SMTP_HOST', value: 'email-smtp.eu-central-1.amazonaws.com' },
    { name: 'SES_SMTP_PORT', value: '587' },
    { name: 'SES_SMTP_USER', value: 'AKIA5RP5FWVY4UGVDYUM' },
    { name: 'SES_SMTP_PASS', value: 'BM+zIynBs56WJVFCgglj0HfYIM3zOEh99Zzd2UwwBDx5' }
];

async function getTaskDefinition(taskDefArn) {
    try {
        const result = await ecs.describeTaskDefinition({
            taskDefinition: taskDefArn
        }).promise();
        return result.taskDefinition;
    } catch (error) {
        console.log(`[ERROR] Failed to get task definition: ${error.message}`);
        return null;
    }
}

async function updateTaskDefinitionWithSMTP(taskDefArn) {
    console.log(`[INFO] Updating task definition: ${taskDefArn}`);
    
    const taskDef = await getTaskDefinition(taskDefArn);
    if (!taskDef) return null;
    
    // Create new task definition with SMTP environment variables
    const newTaskDef = {
        family: taskDef.family,
        taskRoleArn: taskDef.taskRoleArn,
        executionRoleArn: taskDef.executionRoleArn,
        networkMode: taskDef.networkMode,
        requiresCompatibilities: taskDef.requiresCompatibilities,
        cpu: taskDef.cpu,
        memory: taskDef.memory,
        containerDefinitions: taskDef.containerDefinitions.map(container => {
            // Add SMTP environment variables to existing environment
            const existingEnv = container.environment || [];
            
            // Remove any existing SMTP variables to avoid duplicates
            const filteredEnv = existingEnv.filter(env => 
                !env.name.startsWith('SES_SMTP_')
            );
            
            // Add new SMTP variables
            const updatedEnv = [...filteredEnv, ...SMTP_ENV_VARS];
            
            return {
                ...container,
                environment: updatedEnv
            };
        })
    };
    
    try {
        const result = await ecs.registerTaskDefinition(newTaskDef).promise();
        console.log(`[SUCCESS] New task definition registered: ${result.taskDefinition.taskDefinitionArn}`);
        return result.taskDefinition;
    } catch (error) {
        console.log(`[ERROR] Failed to register new task definition: ${error.message}`);
        return null;
    }
}

async function updateServiceWithNewTaskDef(clusterName, serviceName, newTaskDefArn) {
    try {
        console.log(`[INFO] Updating service ${serviceName} with new task definition...`);
        
        const result = await ecs.updateService({
            cluster: clusterName,
            service: serviceName,
            taskDefinition: newTaskDefArn
        }).promise();
        
        console.log(`[SUCCESS] Service ${serviceName} updated successfully`);
        return result.service;
    } catch (error) {
        console.log(`[ERROR] Failed to update service: ${error.message}`);
        return null;
    }
}

async function getServicesWithTaskDefs() {
    try {
        const clusters = await ecs.listClusters().promise();
        const services = [];
        
        for (const clusterArn of clusters.clusterArns) {
            const clusterName = clusterArn.split('/').pop();
            
            const serviceList = await ecs.listServices({ cluster: clusterArn }).promise();
            
            if (serviceList.serviceArns.length > 0) {
                const serviceDetails = await ecs.describeServices({
                    cluster: clusterArn,
                    services: serviceList.serviceArns
                }).promise();
                
                for (const service of serviceDetails.services) {
                    services.push({
                        clusterName: clusterName,
                        serviceName: service.serviceName,
                        taskDefinition: service.taskDefinition
                    });
                }
            }
        }
        
        return services;
    } catch (error) {
        console.log(`[ERROR] Failed to get services: ${error.message}`);
        return [];
    }
}

async function main() {
    console.log("[INFO] Updating ECS task definitions with SMTP configuration...");
    console.log("=".repeat(70));
    
    // Get all services and their task definitions
    const services = await getServicesWithTaskDefs();
    
    if (services.length === 0) {
        console.log("[WARNING] No ECS services found");
        return;
    }
    
    console.log(`[INFO] Found ${services.length} services to update:`);
    services.forEach(service => {
        console.log(`  - ${service.clusterName}/${service.serviceName}`);
    });
    
    console.log(`\n[INFO] SMTP Environment Variables to add:`);
    SMTP_ENV_VARS.forEach(env => {
        const displayValue = env.name === 'SES_SMTP_PASS' ? '***HIDDEN***' : env.value;
        console.log(`  ${env.name}=${displayValue}`);
    });
    
    console.log(`\n[INFO] Starting updates...`);
    
    for (const service of services) {
        console.log(`\n--- Updating ${service.clusterName}/${service.serviceName} ---`);
        
        // Update task definition
        const newTaskDef = await updateTaskDefinitionWithSMTP(service.taskDefinition);
        
        if (newTaskDef) {
            // Update service to use new task definition
            await updateServiceWithNewTaskDef(
                service.clusterName,
                service.serviceName,
                newTaskDef.taskDefinitionArn
            );
        }
    }
    
    console.log(`\n[SUCCESS] All task definitions updated with SMTP configuration!`);
    console.log(`[INFO] Services will restart automatically to pick up new environment variables`);
    console.log(`[INFO] Wait 2-3 minutes for deployment to complete, then test forgot password again`);
}

if (require.main === module) {
    main().catch(console.error);
}