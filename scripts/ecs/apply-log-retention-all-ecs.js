#!/usr/bin/env node
const AWS = require('aws-sdk');

const REGION = 'eu-central-1';
AWS.config.update({ region: REGION });

const logs = new AWS.CloudWatchLogs();

async function applyLogRetentionToAllECS() {
    try {
        console.log('[INFO] Applying 7-day log retention to all ECS log groups...');
        
        let nextToken;
        let totalUpdated = 0;
        
        do {
            const params = { nextToken };
            const result = await logs.describeLogGroups(params).promise();
            
            for (const logGroup of result.logGroups) {
                const logGroupName = logGroup.logGroupName;
                
                // Check if it's an ECS-related log group
                if (logGroupName.includes('/ecs/') || 
                    logGroupName.includes('/aws/ecs/') || 
                    logGroupName.includes('upscend')) {
                    
                    try {
                        await logs.putRetentionPolicy({
                            logGroupName: logGroupName,
                            retentionInDays: 7
                        }).promise();
                        
                        console.log(`✅ ${logGroupName}`);
                        totalUpdated++;
                        
                    } catch (error) {
                        console.log(`❌ ${logGroupName}: ${error.message}`);
                    }
                }
            }
            
            nextToken = result.nextToken;
        } while (nextToken);
        
        console.log(`\n🎉 Applied 7-day retention to ${totalUpdated} ECS log groups`);
        
    } catch (error) {
        console.log(`[ERROR] ${error.message}`);
    }
}

if (require.main === module) {
    applyLogRetentionToAllECS().catch(console.error);
}