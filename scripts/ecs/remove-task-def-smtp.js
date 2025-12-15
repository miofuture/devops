#!/usr/bin/env node
const AWS = require('aws-sdk');

// Configure AWS region
const REGION = 'eu-central-1';
AWS.config.update({ region: REGION });

const ecs = new AWS.ECS();

async function removeSmtpFromTaskDef(taskDefArn) {
    try {
        console.log(`\n[INFO] Processing task definition: ${taskDefArn}`);
        
        const result = await ecs.describeTaskDefinition({
            taskDefinition: taskDefArn
        }).promise();
        
        const taskDef = result.taskDefinition;
        
        // Create new task definition without SMTP variables
        const newTaskDef = {
            family: taskDef.family,
            taskRoleArn: taskDef.taskRoleArn,
            executionRoleArn: taskDef.executionRoleArn,
            networkMode: taskDef.networkMode,
            requiresCompatibilities: taskDef.requiresCompatibilities,
            cpu: taskDef.cpu,
            memory: taskDef.memory,
            containerDefinitions: taskDef.containerDefinitions.map(container => {
                // Remove SMTP environment variables
                const filteredEnv = (container.environment || []).filter(env => 
                    !env.name.startsWith('SES_SMTP_')
                );
                
                const removedVars = (container.environment || []).filter(env => 
                    env.name.startsWith('SES_SMTP_')
                );
                
                if (removedVars.length > 0) {
                    console.log(`  Container ${container.name}: Removing ${removedVars.length} SMTP variables`);
                    removedVars.forEach(env => {
                        console.log(`    - ${env.name}`);
                    });
                }
                
                return {
                    ...container,
                    environment: filteredEnv
                };
            })
        };
        
        // Register new task definition
        const newResult = await ecs.registerTaskDefinition(newTaskDef).promise();
        console.log(`[SUCCESS] New task definition: ${newResult.taskDefinition.taskDefinitionArn}`);
        
        return newResult.taskDefinition;
        
    } catch (error) {
        console.log(`[ERROR] Failed to process ${taskDefArn}: ${error.message}`);
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
        
        console.log(`[SUCCESS] Service ${serviceName} updated`);
        return result.service;
        
    } catch (error) {
        console.log(`[ERROR] Failed to update service ${serviceName}: ${error.message}`);
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
    console.log('='.repeat(70));
    console.log('REMOVE SMTP FROM TASK DEFINITIONS');
    console.log('='.repeat(70));
    
    const services = await getServicesWithTaskDefs();
    
    if (services.length === 0) {
        console.log('[WARNING] No ECS services found');
        return;
    }
    
    console.log(`[INFO] Found ${services.length} services to process`);
    
    for (const service of services) {
        console.log(`\n--- Processing ${service.clusterName}/${service.serviceName} ---`);
        
        // Remove SMTP from task definition
        const newTaskDef = await removeSmtpFromTaskDef(service.taskDefinition);
        
        if (newTaskDef) {
            // Update service with new task definition
            await updateServiceWithNewTaskDef(
                service.clusterName,
                service.serviceName,
                newTaskDef.taskDefinitionArn
            );
        }
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('SUMMARY:');
    console.log('='.repeat(70));
    console.log('✅ Removed SMTP variables from all task definitions');
    console.log('✅ Updated all services with new task definitions');
    console.log('⏳ Services are restarting to pick up S3 configuration');
    console.log('🔍 Wait 2-3 minutes, then test forgot password again');
    console.log('\nNext: Verify S3 config has SMTP credentials with:');
    console.log('npm run check-s3-config');
}

if (require.main === module) {
    main().catch(console.error);
}