#!/usr/bin/env node
const AWS = require('aws-sdk');

const REGION = 'eu-central-1';
AWS.config.update({ region: REGION });

const ecr = new AWS.ECR();

async function analyzeECRRepos() {
    try {
        console.log('[INFO] Analyzing ECR repositories...');
        
        const repos = await ecr.describeRepositories().promise();
        let totalImages = 0;
        let totalSizeGB = 0;
        
        console.log(`\nFound ${repos.repositories.length} ECR repositories:\n`);
        
        for (const repo of repos.repositories) {
            const images = await ecr.describeImages({
                repositoryName: repo.repositoryName
            }).promise();
            
            const sizeBytes = images.imageDetails.reduce((sum, img) => sum + img.imageSizeInBytes, 0);
            const sizeGB = (sizeBytes / 1024 / 1024 / 1024).toFixed(2);
            
            totalImages += images.imageDetails.length;
            totalSizeGB += parseFloat(sizeGB);
            
            console.log(`📦 ${repo.repositoryName}`);
            console.log(`   Images: ${images.imageDetails.length}`);
            console.log(`   Size: ${sizeGB} GB`);
            console.log(`   Policy: ${repo.lifecyclePolicyText ? '✅ Has policy' : '❌ No policy'}`);
            
            // Show oldest and newest images
            if (images.imageDetails.length > 0) {
                const sorted = images.imageDetails.sort((a, b) => new Date(a.imagePushedAt) - new Date(b.imagePushedAt));
                console.log(`   Oldest: ${sorted[0].imagePushedAt.toISOString().split('T')[0]}`);
                console.log(`   Newest: ${sorted[sorted.length-1].imagePushedAt.toISOString().split('T')[0]}`);
            }
            console.log('');
        }
        
        console.log(`📊 SUMMARY:`);
        console.log(`   Total repositories: ${repos.repositories.length}`);
        console.log(`   Total images: ${totalImages}`);
        console.log(`   Total size: ${totalSizeGB.toFixed(2)} GB`);
        
        return repos.repositories;
        
    } catch (error) {
        console.log(`[ERROR] ${error.message}`);
        return [];
    }
}

if (require.main === module) {
    analyzeECRRepos().catch(console.error);
}