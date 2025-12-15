#!/usr/bin/env node
const AWS = require('aws-sdk');

// Configure AWS region
const REGION = 'eu-central-1';
AWS.config.update({ region: REGION });

const ecs = new AWS.ECS();
const s3 = new AWS.S3();

async function checkTaskDefinitionEnvVars(taskDefArn) {
    try {
        const taskDef = await ecs.describeTaskDefinition({
            taskDefinition: taskDefArn
        }).promise();
        
        console.log(`\n[TASK DEFINITION] ${taskDefArn}`);
        
        for (const container of taskDef.taskDefinition.containerDefinitions) {
            console.log(`\nContainer: ${container.name}`);
            
            // Check environment variables
            if (container.environment && container.environment.length > 0) {
                console.log('  Environment Variables:');
                container.environment.forEach(env => {
                    const value = env.name.includes('PASS') || env.name.includes('SECRET') ? '***HIDDEN***' : env.value;
                    console.log(`    ${env.name}=${value}`);
                });
            }
            
            // Check environmentFiles (S3 env files)
            if (container.environmentFiles && container.environmentFiles.length > 0) {
                console.log('  Environment Files (S3):');
                container.environmentFiles.forEach(envFile => {
                    console.log(`    ${envFile.value} (type: ${envFile.type})`);
                });
            }
            
            // Check secrets
            if (container.secrets && container.secrets.length > 0) {
                console.log('  Secrets:');
                container.secrets.forEach(secret => {
                    console.log(`    ${secret.name} -> ${secret.valueFrom}`);
                });
            }
        }
        
        return taskDef.taskDefinition;
        
    } catch (error) {
        console.log(`[ERROR] Failed to get task definition: ${error.message}`);
        return null;
    }
}

async function checkS3EnvFile(s3Uri) {
    try {
        // Parse S3 URI (s3://bucket/key)
        const match = s3Uri.match(/s3:\/\/([^\/]+)\/(.+)/);
        if (!match) {
            console.log(`[ERROR] Invalid S3 URI format: ${s3Uri}`);
            return null;
        }
        
        const bucket = match[1];
        const key = match[2];
        
        console.log(`\n[S3 ENV FILE] ${s3Uri}`);
        console.log(`Bucket: ${bucket}, Key: ${key}`);
        
        const object = await s3.getObject({
            Bucket: bucket,
            Key: key
        }).promise();
        
        const content = object.Body.toString('utf-8');
        const envVars = {};
        
        // Parse .env file format
        content.split('\n').forEach(line => {
            line = line.trim();
            if (line && !line.startsWith('#')) {
                const [key, ...valueParts] = line.split('=');
                if (key && valueParts.length > 0) {
                    const value = valueParts.join('=');
                    envVars[key] = value;
                }
            }
        });
        
        console.log('Environment variables in S3 file:');
        Object.keys(envVars).forEach(key => {
            const value = key.includes('PASS') || key.includes('SECRET') ? '***HIDDEN***' : envVars[key];
            console.log(`  ${key}=${value}`);
        });
        
        return envVars;
        
    } catch (error) {
        console.log(`[ERROR] Failed to read S3 env file: ${error.message}`);
        return null;
    }
}

async function analyzeEnvPrecedence(taskDefArn) {
    console.log(`\n[ANALYSIS] Environment Variable Precedence for ${taskDefArn}`);
    console.log('='.repeat(80));
    
    const taskDef = await checkTaskDefinitionEnvVars(taskDefArn);
    if (!taskDef) return;
    
    for (const container of taskDef.containerDefinitions) {
        console.log(`\n--- Container: ${container.name} ---`);
        
        // Collect all env sources
        const taskDefEnvs = {};
        const s3Envs = {};
        const secrets = {};
        
        // Task definition environment variables
        if (container.environment) {
            container.environment.forEach(env => {
                taskDefEnvs[env.name] = env.value;
            });
        }
        
        // S3 environment files
        if (container.environmentFiles) {
            for (const envFile of container.environmentFiles) {
                const s3EnvVars = await checkS3EnvFile(envFile.value);
                if (s3EnvVars) {
                    Object.assign(s3Envs, s3EnvVars);
                }
            }
        }
        
        // Secrets
        if (container.secrets) {
            container.secrets.forEach(secret => {
                secrets[secret.name] = secret.valueFrom;
            });
        }
        
        // Analyze conflicts and precedence
        console.log('\n[PRECEDENCE ANALYSIS]');
        console.log('ECS Environment Variable Precedence Order:');
        console.log('1. Task Definition environment (highest priority)');
        console.log('2. Environment Files from S3');
        console.log('3. Secrets from Parameter Store/Secrets Manager');
        
        // Check for conflicts
        const allKeys = new Set([
            ...Object.keys(taskDefEnvs),
            ...Object.keys(s3Envs),
            ...Object.keys(secrets)
        ]);
        
        console.log('\n[CONFLICTS DETECTED]');
        let hasConflicts = false;
        
        allKeys.forEach(key => {
            const sources = [];
            if (taskDefEnvs[key]) sources.push('Task Definition');
            if (s3Envs[key]) sources.push('S3 File');
            if (secrets[key]) sources.push('Secrets');
            
            if (sources.length > 1) {
                hasConflicts = true;
                console.log(`❌ ${key}: Found in ${sources.join(', ')}`);
                console.log(`   Winner: Task Definition (${taskDefEnvs[key] || 'not set'})`);
                if (s3Envs[key]) console.log(`   S3 value ignored: ${s3Envs[key]}`);
            }
        });
        
        if (!hasConflicts) {
            console.log('✅ No environment variable conflicts detected');
        }
        
        // Check SMTP variables specifically
        console.log('\n[SMTP VARIABLES CHECK]');
        const smtpVars = ['SES_SMTP_HOST', 'SES_SMTP_PORT', 'SES_SMTP_USER', 'SES_SMTP_PASS'];
        
        smtpVars.forEach(varName => {
            if (taskDefEnvs[varName]) {
                console.log(`✅ ${varName}: Set in Task Definition`);
            } else if (s3Envs[varName]) {
                console.log(`⚠️  ${varName}: Only in S3 file (may be ignored)`);
            } else {
                console.log(`❌ ${varName}: Not found anywhere`);
            }
        });
    }
}

async function getServicesTaskDefinitions() {
    try {
        const clusters = await ecs.listClusters().promise();
        const services = [];
        
        for (const clusterArn of clusters.clusterArns) {
            const serviceList = await ecs.listServices({ cluster: clusterArn }).promise();
            
            if (serviceList.serviceArns.length > 0) {
                const serviceDetails = await ecs.describeServices({
                    cluster: clusterArn,
                    services: serviceList.serviceArns
                }).promise();
                
                for (const service of serviceDetails.services) {
                    services.push({
                        clusterName: clusterArn.split('/').pop(),
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
    console.log('[INFO] Analyzing ECS Environment Variable Precedence...');
    console.log('='.repeat(80));
    
    const services = await getServicesTaskDefinitions();
    
    if (services.length === 0) {
        console.log('[WARNING] No ECS services found');
        return;
    }
    
    // Focus on auth services that handle SMTP
    const authServices = services.filter(s => 
        s.serviceName.includes('auth') || s.serviceName.includes('api')
    );
    
    if (authServices.length === 0) {
        console.log('[WARNING] No auth/api services found');
        return;
    }
    
    for (const service of authServices) {
        await analyzeEnvPrecedence(service.taskDefinition);
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY & RECOMMENDATIONS:');
    console.log('='.repeat(80));
    console.log('1. Task Definition env vars ALWAYS override S3 env files');
    console.log('2. If SMTP vars are in both places, Task Definition wins');
    console.log('3. Remove SMTP vars from Task Definition to use S3 values');
    console.log('4. Or remove SMTP vars from S3 and keep in Task Definition');
    console.log('5. Restart ECS tasks after making changes');
}

if (require.main === module) {
    main().catch(console.error);
}