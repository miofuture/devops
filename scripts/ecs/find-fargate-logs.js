#!/usr/bin/env node
const AWS = require('aws-sdk');

const REGION = 'eu-central-1';
AWS.config.update({ region: REGION });

const logs = new AWS.CloudWatchLogs();
const ecs = new AWS.ECS();

async function findFargateLogs() {
    console.log("[INFO] Finding Fargate cluster log groups");
    console.log("=".repeat(50));
    
    try {
        // List all log groups
        const logGroups = await logs.describeLogGroups().promise();
        
        console.log("\n[INFO] All log groups containing 'fargate' or 'prod':");
        const relevantGroups = logGroups.logGroups.filter(group => {
            const name = group.logGroupName.toLowerCase();
            return name.includes('fargate') || 
                   name.includes('prod') ||
                   name.includes('upscend');
        });
        
        relevantGroups.forEach(group => {
            console.log(`  ${group.logGroupName}`);
        });
        
        // Check ECS clusters
        console.log("\n[INFO] ECS Clusters:");
        const clusters = await ecs.listClusters().promise();
        
        for (const clusterArn of clusters.clusterArns) {
            const clusterName = clusterArn.split('/').pop();
            console.log(`  Cluster: ${clusterName}`);
            
            if (clusterName.toLowerCase().includes('fargate') || clusterName.toLowerCase().includes('prod')) {
                // Get services
                const services = await ecs.listServices({ cluster: clusterArn }).promise();
                console.log(`    Services: ${services.serviceArns.length}`);
                
                services.serviceArns.forEach(serviceArn => {
                    const serviceName = serviceArn.split('/').pop();
                    console.log(`      - ${serviceName}`);
                });
            }
        }
        
    } catch (error) {
        console.log(`[ERROR] ${error.message}`);
    }
}

if (require.main === module) {
    findFargateLogs().catch(console.error);
}