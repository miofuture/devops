#!/usr/bin/env node
const AWS = require('aws-sdk');

const REGION = 'eu-central-1';
AWS.config.update({ region: REGION });

const ecs = new AWS.ECS();

async function restartECSServices() {
    console.log("[INFO] Restarting ECS Services to Pick Up New Configuration");
    console.log("=".repeat(60));
    
    try {
        // Get clusters
        const clusters = await ecs.listClusters().promise();
        
        for (const clusterArn of clusters.clusterArns) {
            const clusterName = clusterArn.split('/').pop();
            console.log(`\n[INFO] Processing cluster: ${clusterName}`);
            
            // Get services in this cluster
            const services = await ecs.listServices({ cluster: clusterArn }).promise();
            
            if (services.serviceArns.length === 0) {
                console.log(`  No services found in cluster ${clusterName}`);
                continue;
            }
            
            for (const serviceArn of services.serviceArns) {
                const serviceName = serviceArn.split('/').pop();
                
                try {
                    console.log(`  Restarting service: ${serviceName}`);
                    
                    // Force new deployment to pick up new environment variables
                    await ecs.updateService({
                        cluster: clusterArn,
                        service: serviceArn,
                        forceNewDeployment: true
                    }).promise();
                    
                    console.log(`    ✅ Restart initiated for ${serviceName}`);
                    
                } catch (error) {
                    console.log(`    ❌ Failed to restart ${serviceName}: ${error.message}`);
                }
            }
        }
        
        console.log(`\n[INFO] All service restarts initiated`);
        console.log(`[INFO] Services will take 2-5 minutes to fully restart`);
        console.log(`[INFO] New containers will use support@upscend.com for SES emails`);
        
    } catch (error) {
        console.log(`[ERROR] Failed to restart services: ${error.message}`);
    }
}

if (require.main === module) {
    restartECSServices().catch(console.error);
}