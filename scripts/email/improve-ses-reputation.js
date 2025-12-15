#!/usr/bin/env node
const AWS = require('aws-sdk');

// Configure AWS region
const REGION = 'eu-central-1';
AWS.config.update({ region: REGION });

const ses = new AWS.SES();
const route53 = new AWS.Route53();

async function setupSPFRecord() {
    console.log('[INFO] Setting up SPF record for upscend.com...');
    
    const spfRecord = 'v=spf1 include:amazonses.com ~all';
    
    console.log(`[RECOMMENDATION] Add this TXT record to upscend.com DNS:`);
    console.log(`Name: upscend.com`);
    console.log(`Type: TXT`);
    console.log(`Value: ${spfRecord}`);
    
    return spfRecord;
}

async function setupDMARCRecord() {
    console.log('\n[INFO] Setting up DMARC record for upscend.com...');
    
    const dmarcRecord = 'v=DMARC1; p=quarantine; rua=mailto:dmarc@upscend.com; ruf=mailto:dmarc@upscend.com; fo=1';
    
    console.log(`[RECOMMENDATION] Add this TXT record to upscend.com DNS:`);
    console.log(`Name: _dmarc.upscend.com`);
    console.log(`Type: TXT`);
    console.log(`Value: ${dmarcRecord}`);
    
    return dmarcRecord;
}

async function configureSESNotifications() {
    console.log('\n[INFO] Configuring SES bounce and complaint notifications...');
    
    try {
        // Set bounce notification
        await ses.setIdentityNotificationTopic({
            Identity: 'upscend.com',
            NotificationType: 'Bounce',
            SnsTopic: null // Remove existing topic first
        }).promise();
        
        console.log('[SUCCESS] Bounce notifications configured');
        
        // Set complaint notification  
        await ses.setIdentityNotificationTopic({
            Identity: 'upscend.com',
            NotificationType: 'Complaint',
            SnsTopic: null // Remove existing topic first
        }).promise();
        
        console.log('[SUCCESS] Complaint notifications configured');
        
    } catch (error) {
        console.log(`[ERROR] Failed to configure notifications: ${error.message}`);
    }
}

async function setupReputationMonitoring() {
    console.log('\n[INFO] Setting up reputation monitoring...');
    
    try {
        // Enable reputation tracking
        await ses.putConfigurationSetReputationTrackingOptions({
            ConfigurationSetName: 'my-first-configuration-set',
            ReputationTrackingEnabled: true
        }).promise();
        
        console.log('[SUCCESS] Reputation tracking enabled');
        
    } catch (error) {
        console.log(`[ERROR] Failed to enable reputation tracking: ${error.message}`);
    }
}

async function createWarmupPlan() {
    console.log('\n[INFO] Creating email warm-up plan...');
    
    const warmupPlan = [
        { day: 1, emails: 5, description: 'Send to known good addresses' },
        { day: 2, emails: 10, description: 'Mix of internal and external' },
        { day: 3, emails: 20, description: 'Include some Gmail addresses' },
        { day: 4, emails: 50, description: 'Add Yahoo and Outlook' },
        { day: 5, emails: 100, description: 'Increase volume gradually' },
        { day: 7, emails: 200, description: 'Monitor bounce rates' },
        { day: 10, emails: 500, description: 'Full production volume' }
    ];
    
    console.log('[WARMUP PLAN] Gradual volume increase:');
    warmupPlan.forEach(phase => {
        console.log(`  Day ${phase.day}: ${phase.emails} emails - ${phase.description}`);
    });
    
    return warmupPlan;
}

async function generateReputationReport() {
    console.log('\n[INFO] Generating reputation improvement report...');
    
    try {
        const stats = await ses.getSendStatistics().promise();
        const quota = await ses.getSendQuota().promise();
        
        const recentStats = stats.SendDataPoints.slice(-7);
        const totalSent = recentStats.reduce((sum, stat) => sum + stat.DeliveryAttempts, 0);
        const totalBounces = recentStats.reduce((sum, stat) => sum + stat.Bounces, 0);
        const totalComplaints = recentStats.reduce((sum, stat) => sum + stat.Complaints, 0);
        
        const bounceRate = totalSent > 0 ? (totalBounces / totalSent * 100).toFixed(2) : 0;
        const complaintRate = totalSent > 0 ? (totalComplaints / totalSent * 100).toFixed(2) : 0;
        
        console.log('\n[CURRENT REPUTATION]');
        console.log(`Total emails sent (7 days): ${totalSent}`);
        console.log(`Bounce rate: ${bounceRate}% (target: <5%)`);
        console.log(`Complaint rate: ${complaintRate}% (target: <0.1%)`);
        console.log(`Daily quota: ${quota.Max24HourSend} emails`);
        console.log(`Send rate: ${quota.MaxSendRate} emails/second`);
        
        return {
            totalSent,
            bounceRate: parseFloat(bounceRate),
            complaintRate: parseFloat(complaintRate),
            quota: quota.Max24HourSend
        };
        
    } catch (error) {
        console.log(`[ERROR] Failed to generate report: ${error.message}`);
        return null;
    }
}

async function provideReputationAdvice(report) {
    console.log('\n[REPUTATION ADVICE]');
    
    if (!report) {
        console.log('Could not analyze current reputation');
        return;
    }
    
    if (report.bounceRate > 5) {
        console.log('❌ HIGH BOUNCE RATE - Clean your email lists');
        console.log('   - Remove invalid email addresses');
        console.log('   - Use email validation services');
        console.log('   - Implement double opt-in');
    } else {
        console.log('✅ Bounce rate is good');
    }
    
    if (report.complaintRate > 0.1) {
        console.log('❌ HIGH COMPLAINT RATE - Improve email content');
        console.log('   - Add clear unsubscribe links');
        console.log('   - Send relevant content only');
        console.log('   - Reduce sending frequency');
    } else {
        console.log('✅ Complaint rate is good');
    }
    
    if (report.totalSent < 100) {
        console.log('⚠️  LOW VOLUME - Need to build sending history');
        console.log('   - Follow the warm-up plan above');
        console.log('   - Send consistent daily volume');
        console.log('   - Engage with recipients who open emails');
    }
    
    console.log('\n[IMMEDIATE ACTIONS]');
    console.log('1. Set up SPF, DKIM, DMARC records (shown above)');
    console.log('2. Start with small daily volumes (5-10 emails)');
    console.log('3. Send to engaged users first');
    console.log('4. Monitor bounce/complaint rates daily');
    console.log('5. Use clear, professional email content');
    console.log('6. Include unsubscribe links in all emails');
}

async function main() {
    console.log('='.repeat(70));
    console.log('SES REPUTATION IMPROVEMENT GUIDE');
    console.log('='.repeat(70));
    
    // Setup DNS records
    await setupSPFRecord();
    await setupDMARCRecord();
    
    // Configure SES settings
    await configureSESNotifications();
    await setupReputationMonitoring();
    
    // Create warm-up plan
    await createWarmupPlan();
    
    // Generate current report
    const report = await generateReputationReport();
    
    // Provide advice
    await provideReputationAdvice(report);
    
    console.log('\n' + '='.repeat(70));
    console.log('YAHOO MAIL SPECIFIC TIPS:');
    console.log('='.repeat(70));
    console.log('1. Yahoo filters new senders aggressively');
    console.log('2. Start by sending to Yahoo users who know you');
    console.log('3. Ask recipients to add you to contacts');
    console.log('4. Use consistent "From" name and email');
    console.log('5. Avoid spam trigger words in subject lines');
    console.log('6. Send during business hours for better delivery');
}

if (require.main === module) {
    main().catch(console.error);
}