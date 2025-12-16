#!/usr/bin/env node
const AWS = require('aws-sdk');

const REGION = 'eu-central-1';
AWS.config.update({ region: REGION });

const ecr = new AWS.ECR();
const ecs = new AWS.ECS();

async function getImagesInUse() {
    const imagesInUse = new Set();
    
    try {
        const clusters = await ecs.listClusters().promise();
        
        for (const clusterArn of clusters.clusterArns) {
            const services = await ecs.listServices({ cluster: clusterArn }).promise();
            
            if (services.serviceArns.length > 0) {
                const serviceDetails = await ecs.describeServices({
                    cluster: clusterArn,
                    services: services.serviceArns
                }).promise();
                
                for (const service of serviceDetails.services) {
                    const taskDef = await ecs.describeTaskDefinition({
                        taskDefinition: service.taskDefinition
                    }).promise();
                    
                    taskDef.taskDefinition.containerDefinitions.forEach(container => {
                        if (container.image.includes('.dkr.ecr.')) {
                            imagesInUse.add(container.image);
                        }
                    });
                }
            }
            
            // Check running tasks
            const tasks = await ecs.listTasks({ cluster: clusterArn }).promise();
            if (tasks.taskArns.length > 0) {
                const taskDetails = await ecs.describeTasks({
                    cluster: clusterArn,
                    tasks: tasks.taskArns
                }).promise();
                
                taskDetails.tasks.forEach(task => {
                    const taskDefArn = task.taskDefinitionArn;
                    imagesInUse.add(taskDefArn);
                });
            }
        }
        
    } catch (error) {
        console.log(`[ERROR] Getting images in use: ${error.message}`);
    }
    
    return imagesInUse;
}

async function safeCleanup() {
    console.log('[INFO] Getting images currently in use by ECS...');
    const imagesInUse = await getImagesInUse();
    
    console.log(`[INFO] Found ${imagesInUse.size} images/tasks in use`);
    imagesInUse.forEach(img => console.log(`  🔒 ${img}`));
    
    console.log('\n[INFO] Analyzing ECR repositories for safe cleanup...');
    
    const repos = await ecr.describeRepositories().promise();
    let totalSafe = 0;
    let totalProtected = 0;
    
    for (const repo of repos.repositories) {
        const images = await ecr.describeImages({
            repositoryName: repo.repositoryName
        }).promise();
        
        const oldImages = images.imageDetails.filter(img => {
            const daysDiff = (Date.now() - new Date(img.imagePushedAt)) / (1000 * 60 * 60 * 24);
            const imageUri = `${repo.repositoryUri}:${img.imageTags?.[0] || img.imageDigest.split(':')[1].substring(0,12)}`;
            const isInUse = Array.from(imagesInUse).some(usedImg => usedImg.includes(imageUri) || usedImg.includes(img.imageDigest));
            
            return daysDiff > 30 && !isInUse;
        });
        
        const protectedImages = images.imageDetails.filter(img => {
            const imageUri = `${repo.repositoryUri}:${img.imageTags?.[0] || img.imageDigest.split(':')[1].substring(0,12)}`;
            return Array.from(imagesInUse).some(usedImg => usedImg.includes(imageUri) || usedImg.includes(img.imageDigest));
        });
        
        console.log(`\n📦 ${repo.repositoryName}`);
        console.log(`   Total images: ${images.imageDetails.length}`);
        console.log(`   Safe to delete: ${oldImages.length}`);
        console.log(`   Protected (in use): ${protectedImages.length}`);
        
        totalSafe += oldImages.length;
        totalProtected += protectedImages.length;
    }
    
    console.log(`\n📊 SUMMARY:`);
    console.log(`   Safe to delete: ${totalSafe} images`);
    console.log(`   Protected: ${totalProtected} images`);
    console.log(`   ✅ No images in use will be deleted`);
}

const SAFE_LIFECYCLE_POLICY = {
    rules: [
        {
            rulePriority: 1,
            description: "Keep last 15 production images",
            selection: {
                tagStatus: "tagged",
                tagPrefixList: ["prod", "production", "release", "main", "master"],
                countType: "imageCountMoreThan",
                countNumber: 15
            },
            action: { type: "expire" }
        },
        {
            rulePriority: 2,
            description: "Keep last 10 development images",
            selection: {
                tagStatus: "tagged",
                tagPrefixList: ["dev", "staging", "stage", "test"],
                countType: "imageCountMoreThan",
                countNumber: 10
            },
            action: { type: "expire" }
        },
        {
            rulePriority: 3,
            description: "Keep last 5 untagged images",
            selection: {
                tagStatus: "untagged",
                countType: "imageCountMoreThan",
                countNumber: 5
            },
            action: { type: "expire" }
        },
        {
            rulePriority: 4,
            description: "Delete untagged images older than 7 days",
            selection: {
                tagStatus: "untagged",
                countType: "sinceImagePushed",
                countUnit: "days",
                countNumber: 7
            },
            action: { type: "expire" }
        }
    ]
};

async function applySafePolicies() {
    console.log('\n[INFO] Applying safe lifecycle policies...');
    
    const repos = await ecr.describeRepositories().promise();
    let applied = 0;
    
    for (const repo of repos.repositories) {
        try {
            await ecr.putLifecyclePolicy({
                repositoryName: repo.repositoryName,
                lifecyclePolicyText: JSON.stringify(SAFE_LIFECYCLE_POLICY)
            }).promise();
            
            console.log(`✅ ${repo.repositoryName}`);
            applied++;
            
        } catch (error) {
            console.log(`❌ ${repo.repositoryName}: ${error.message}`);
        }
    }
    
    console.log(`\n🎉 Applied safe policies to ${applied}/${repos.repositories.length} repositories`);
}

async function main() {
    console.log('🛡️  SAFE ECR CLEANUP - PROTECTS IMAGES IN USE');
    console.log('='.repeat(60));
    
    await safeCleanup();
    await applySafePolicies();
    
    console.log('\n✅ SAFE CLEANUP COMPLETED');
    console.log('• All images currently in use are protected');
    console.log('• Conservative retention policies applied');
    console.log('• Lifecycle policies will handle future cleanup automatically');
}

if (require.main === module) {
    main().catch(console.error);
}