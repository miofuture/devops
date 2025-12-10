#!/usr/bin/env node
const AWS = require('aws-sdk');

// Configure AWS region
const REGION = 'eu-central-1';
const CONFIG_SET = 'my-first-configuration-set';

AWS.config.update({ region: REGION });

const ses = new AWS.SES();
const logs = new AWS.CloudWatchLogs();

async function setupSESLogging(configSet = CONFIG_SET) {
    console.log(`[INFO] Setting up SES logging for ${configSet}`);
    
    // Create CloudWatch log groups
    const logGroups = ['/aws/ses/bounce', '/aws/ses/complaint', '/aws/ses/delivery'];
    
    for (const logGroup of logGroups) {
        try {
            await logs.createLogGroup({ logGroupName: logGroup }).promise();
            console.log(`[SUCCESS] Created: ${logGroup}`);
        } catch (error) {
            if (error.code === 'ResourceAlreadyExistsException') {
                console.log(`[EXISTS] ${logGroup}`);
            } else {
                console.log(`[ERROR] ${logGroup}: ${error.message}`);
            }
        }
    }
    
    // Configure CloudWatch destinations
    const events = ['bounce', 'complaint', 'delivery'];
    
    for (const event of events) {
        try {
            // Delete existing if present
            try {
                await ses.deleteConfigurationSetEventDestination({
                    ConfigurationSetName: configSet,
                    EventDestinationName: `${event}-cw`
                }).promise();
            } catch (error) {
                // Ignore if doesn't exist
            }
            
            // Create CloudWatch destination
            await ses.createConfigurationSetEventDestination({
                ConfigurationSetName: configSet,
                EventDestination: {
                    Name: `${event}-cw`,
                    Enabled: true,
                    MatchingEventTypes: [event],
                    CloudWatchDestination: {
                        DimensionConfigurations: [{
                            DimensionName: 'MessageTag',
                            DimensionValueSource: 'messageTag',
                            DefaultDimensionValue: 'ses-email'
                        }]
                    }
                }
            }).promise();
            
            console.log(`[SUCCESS] Configured ${event} events -> CloudWatch`);
            
        } catch (error) {
            console.log(`[ERROR] ${event} configuration: ${error.message}`);
        }
    }
    
    console.log(`\n[SUCCESS] SES logging setup complete!`);
    console.log(`Logs will appear in CloudWatch after sending emails`);
}

async function main() {
    try {
        await setupSESLogging();
    } catch (error) {
        console.error(`[ERROR] Setup failed: ${error.message}`);
    }
}

if (require.main === module) {
    main();
}