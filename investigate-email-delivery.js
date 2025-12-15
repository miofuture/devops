#!/usr/bin/env node
const AWS = require('aws-sdk');

// Configure AWS region
const REGION = 'eu-central-1';
AWS.config.update({ region: REGION });

const ses = new AWS.SES();
const logs = new AWS.CloudWatchLogs();

async function checkSESReputation() {
    try {
        console.log('[INFO] Checking SES reputation and deliverability...');
        
        // Get sending statistics
        const stats = await ses.getSendStatistics().promise();
        const recentStats = stats.SendDataPoints.slice(-10);
        
        console.log('\n[INFO] Recent sending statistics:');
        for (const stat of recentStats) {
            const deliveryRate = stat.DeliveryAttempts > 0 ? 
                ((stat.DeliveryAttempts - stat.Bounces - stat.Rejects) / stat.DeliveryAttempts * 100).toFixed(1) : 0;
            
            console.log(`${stat.Timestamp}: ${stat.DeliveryAttempts} sent, ${stat.Bounces} bounces, ${stat.Complaints} complaints, ${stat.Rejects} rejects (${deliveryRate}% delivery rate)`);
        }
        
        // Calculate overall reputation
        const totalAttempts = recentStats.reduce((sum, stat) => sum + stat.DeliveryAttempts, 0);
        const totalBounces = recentStats.reduce((sum, stat) => sum + stat.Bounces, 0);
        const totalComplaints = recentStats.reduce((sum, stat) => sum + stat.Complaints, 0);
        
        const bounceRate = totalAttempts > 0 ? (totalBounces / totalAttempts * 100).toFixed(2) : 0;
        const complaintRate = totalAttempts > 0 ? (totalComplaints / totalAttempts * 100).toFixed(2) : 0;
        
        console.log(`\n[REPUTATION] Bounce rate: ${bounceRate}% (should be < 5%)`);
        console.log(`[REPUTATION] Complaint rate: ${complaintRate}% (should be < 0.1%)`);
        
        if (bounceRate > 5) {
            console.log('[WARNING] High bounce rate may affect deliverability');
        }
        if (complaintRate > 0.1) {
            console.log('[WARNING] High complaint rate may affect deliverability');
        }
        
    } catch (error) {
        console.log(`[ERROR] Failed to check reputation: ${error.message}`);
    }
}

async function checkEmailDeliverability(email = 'miofuture@yahoo.com') {
    console.log(`\n[INFO] Analyzing deliverability issues for ${email}...`);
    
    // Check domain reputation
    const domain = email.split('@')[1];
    console.log(`[INFO] Target domain: ${domain}`);
    
    // Common deliverability issues
    const issues = [];
    
    if (domain === 'yahoo.com') {
        issues.push('Yahoo has strict spam filtering - emails often go to spam folder');
        issues.push('Yahoo may delay delivery by several minutes to hours');
        issues.push('Yahoo requires good sender reputation for inbox delivery');
    }
    
    if (domain.includes('gmail.com')) {
        issues.push('Gmail has advanced spam detection');
        issues.push('New sending domains may be filtered initially');
    }
    
    if (domain.includes('outlook.com') || domain.includes('hotmail.com')) {
        issues.push('Microsoft has strict authentication requirements');
        issues.push('May require SPF, DKIM, and DMARC records');
    }
    
    console.log(`\n[DELIVERABILITY] Potential issues for ${domain}:`);
    issues.forEach(issue => console.log(`  - ${issue}`));
    
    return issues;
}

async function checkDNSRecords() {
    try {
        console.log('\n[INFO] Checking DNS authentication records...');
        
        // Get verified identities
        const identities = await ses.listIdentities().promise();
        
        for (const identity of identities.Identities) {
            if (identity.includes('.')) { // Domain
                console.log(`\n[DNS] Checking records for domain: ${identity}`);
                
                try {
                    // Get DKIM attributes
                    const dkimAttrs = await ses.getIdentityDkimAttributes({
                        Identities: [identity]
                    }).promise();
                    
                    const dkim = dkimAttrs.DkimAttributes[identity];
                    if (dkim) {
                        console.log(`  DKIM Status: ${dkim.DkimEnabled ? 'Enabled' : 'Disabled'}`);
                        console.log(`  DKIM Verification: ${dkim.DkimVerificationStatus}`);
                    }
                    
                    // Get verification attributes
                    const verifyAttrs = await ses.getIdentityVerificationAttributes({
                        Identities: [identity]
                    }).promise();
                    
                    const verify = verifyAttrs.VerificationAttributes[identity];
                    if (verify) {
                        console.log(`  Domain Verification: ${verify.VerificationStatus}`);
                    }
                    
                } catch (error) {
                    console.log(`  [ERROR] Could not check DNS records: ${error.message}`);
                }
            }
        }
        
    } catch (error) {
        console.log(`[ERROR] Failed to check DNS records: ${error.message}`);
    }
}

async function searchForBounceComplaints(email = 'miofuture@yahoo.com') {
    console.log(`\n[INFO] Searching for bounces/complaints for ${email}...`);
    
    const endTime = Date.now();
    const startTime = endTime - (24 * 60 * 60 * 1000); // Last 24 hours
    
    const logGroups = ['/aws/ses/bounce', '/aws/ses/complaint'];
    
    for (const logGroup of logGroups) {
        try {
            console.log(`[INFO] Checking ${logGroup}...`);
            
            const streams = await logs.describeLogStreams({
                logGroupName: logGroup,
                orderBy: 'LastEventTime',
                descending: true,
                limit: 10
            }).promise();
            
            let found = false;
            for (const stream of streams.logStreams) {
                try {
                    const events = await logs.getLogEvents({
                        logGroupName: logGroup,
                        logStreamName: stream.logStreamName,
                        startTime: startTime,
                        endTime: endTime
                    }).promise();
                    
                    for (const event of events.events) {
                        if (event.message.toLowerCase().includes(email.toLowerCase())) {
                            found = true;
                            console.log(`[FOUND] ${logGroup} event:`);
                            console.log(`  Time: ${new Date(event.timestamp).toISOString()}`);
                            console.log(`  Message: ${event.message}`);
                        }
                    }
                } catch (streamError) {
                    // Skip if can't read stream
                }
            }
            
            if (!found) {
                console.log(`[SUCCESS] No ${logGroup.split('/').pop()} events found for ${email}`);
            }
            
        } catch (error) {
            if (error.code === 'ResourceNotFoundException') {
                console.log(`[INFO] ${logGroup} - No log group (no events of this type)`);
            } else {
                console.log(`[ERROR] ${logGroup}: ${error.message}`);
            }
        }
    }
}

async function main() {
    console.log('='.repeat(70));
    console.log('EMAIL DELIVERY INVESTIGATION');
    console.log('='.repeat(70));
    
    // Check SES reputation
    await checkSESReputation();
    
    // Check deliverability issues
    await checkEmailDeliverability('miofuture@yahoo.com');
    
    // Check DNS authentication
    await checkDNSRecords();
    
    // Search for bounces/complaints
    await searchForBounceComplaints('miofuture@yahoo.com');
    
    console.log('\n' + '='.repeat(70));
    console.log('RECOMMENDATIONS:');
    console.log('='.repeat(70));
    console.log('1. Check spam/junk folder in Yahoo Mail');
    console.log('2. Check all email folders (Promotions, Updates, etc.)');
    console.log('3. Add support@upscend.com to Yahoo contacts/whitelist');
    console.log('4. Wait up to 30 minutes - Yahoo can delay delivery');
    console.log('5. Set up SPF, DKIM, DMARC records for better deliverability');
    console.log('6. Consider sending a test email to a different provider');
}

if (require.main === module) {
    main().catch(console.error);
}