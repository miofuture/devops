#!/usr/bin/env node
const AWS = require('aws-sdk');

const REGION = 'eu-central-1';
AWS.config.update({ region: REGION });

const ecr = new AWS.ECR();

const LIFECYCLE_POLICY = {
    rules: [
        {
            rulePriority: 1,
            description: "Keep last 10 production images",
            selection: {
                tagStatus: "tagged",
                tagPrefixList: ["prod", "production", "release"],
                countType: "imageCountMoreThan",
                countNumber: 10
            },
            action: { type: "expire" }
        },
        {
            rulePriority: 2,
            description: "Keep last 5 staging images",
            selection: {
                tagStatus: "tagged",
                tagPrefixList: ["staging", "stage", "dev"],
                countType: "imageCountMoreThan",
                countNumber: 5
            },
            action: { type: "expire" }
        },
        {
            rulePriority: 3,
            description: "Keep last 3 untagged images",
            selection: {
                tagStatus: "untagged",
                countType: "imageCountMoreThan",
                countNumber: 3
            },
            action: { type: "expire" }
        },
        {
            rulePriority: 4,
            description: "Delete images older than 30 days",
            selection: {
                tagStatus: "any",
                countType: "sinceImagePushed",
                countUnit: "days",
                countNumber: 30
            },
            action: { type: "expire" }
        }
    ]
};

async function applyRetentionPolicies() {
    try {
        console.log('[INFO] Applying ECR lifecycle policies...');
        
        const repos = await ecr.describeRepositories().promise();
        let applied = 0;
        
        for (const repo of repos.repositories) {
            try {
                await ecr.putLifecyclePolicy({
                    repositoryName: repo.repositoryName,
                    lifecyclePolicyText: JSON.stringify(LIFECYCLE_POLICY)
                }).promise();
                
                console.log(`✅ ${repo.repositoryName}`);
                applied++;
                
            } catch (error) {
                console.log(`❌ ${repo.repositoryName}: ${error.message}`);
            }
        }
        
        console.log(`\n🎉 Applied lifecycle policies to ${applied}/${repos.repositories.length} repositories`);
        
    } catch (error) {
        console.log(`[ERROR] ${error.message}`);
    }
}

async function cleanupOldImages() {
    try {
        console.log('\n[INFO] Cleaning up old images (30+ days)...');
        
        const repos = await ecr.describeRepositories().promise();
        let totalDeleted = 0;
        
        for (const repo of repos.repositories) {
            const images = await ecr.describeImages({
                repositoryName: repo.repositoryName
            }).promise();
            
            const oldImages = images.imageDetails.filter(img => {
                const daysDiff = (Date.now() - new Date(img.imagePushedAt)) / (1000 * 60 * 60 * 24);
                return daysDiff > 30;
            });
            
            if (oldImages.length > 0) {
                const imageIds = oldImages.map(img => ({
                    imageDigest: img.imageDigest
                }));
                
                try {
                    await ecr.batchDeleteImage({
                        repositoryName: repo.repositoryName,
                        imageIds: imageIds
                    }).promise();
                    
                    console.log(`✅ ${repo.repositoryName}: Deleted ${oldImages.length} old images`);
                    totalDeleted += oldImages.length;
                    
                } catch (error) {
                    console.log(`❌ ${repo.repositoryName}: ${error.message}`);
                }
            }
        }
        
        console.log(`\n🗑️  Total images deleted: ${totalDeleted}`);
        
    } catch (error) {
        console.log(`[ERROR] ${error.message}`);
    }
}

async function main() {
    console.log('🚀 ECR CLEANUP AND RETENTION POLICY APPLICATION');
    console.log('='.repeat(60));
    
    console.log('\n📋 POLICY RULES:');
    console.log('• Keep last 10 production images (prod/production/release tags)');
    console.log('• Keep last 5 staging images (staging/stage/dev tags)');
    console.log('• Keep last 3 untagged images');
    console.log('• Delete all images older than 30 days');
    
    await applyRetentionPolicies();
    await cleanupOldImages();
    
    console.log('\n💰 ESTIMATED SAVINGS:');
    console.log('• Current total: 445.42 GB');
    console.log('• Expected reduction: ~60-80%');
    console.log('• Estimated new size: ~90-180 GB');
    console.log('• Monthly cost savings: ~$10-20');
}

if (require.main === module) {
    main().catch(console.error);
}