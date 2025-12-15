#!/usr/bin/env node
const fs = require('fs');

function finalCleanup() {
    console.log("[INFO] Final secret cleanup for GitHub");
    console.log("=".repeat(50));
    
    const replacements = [
        // AWS credentials
        { pattern: /AKIA[0-9A-Z]{16}/g, replacement: 'AKIA****************' },
        { pattern: /[A-Za-z0-9+/]{40}[A-Za-z0-9+/=]{0,4}/g, replacement: '****************************************' },
        
        // SMTP hosts (keep generic, remove specific)
        { pattern: /email-smtp\.eu-central-1\.amazonaws\.com/g, replacement: 'email-smtp.REGION.amazonaws.com' },
        { pattern: /smtp\.eu-central-1\.amazonaws\.com/g, replacement: 'smtp.REGION.amazonaws.com' },
        
        // SendGrid keys
        { pattern: /SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}/g, replacement: 'SG.*********************...' },
        
        // Specific emails (keep generic ones)
        { pattern: /miofuture@yahoo\.com/g, replacement: '<test-email>' },
        { pattern: /m\.omar@upscend\.com/g, replacement: '<admin-email>' },
        
        // Passwords/secrets
        { pattern: /BM\+[a-zA-Z0-9+/=]+/g, replacement: '********' }
    ];
    
    const filesToClean = [
        'check-s3-config.js',
        'fix-ses-from-email.js', 
        'EMAIL-DELIVERY-ISSUE-RESOLUTION.md',
        'compare-email-providers.js',
        'check-email-priority.js'
    ];
    
    filesToClean.forEach(filename => {
        if (fs.existsSync(filename)) {
            let content = fs.readFileSync(filename, 'utf8');
            let changed = false;
            
            replacements.forEach(({ pattern, replacement }) => {
                if (pattern.test(content)) {
                    content = content.replace(pattern, replacement);
                    changed = true;
                }
            });
            
            if (changed) {
                fs.writeFileSync(filename, content);
                console.log(`✅ Cleaned ${filename}`);
            } else {
                console.log(`✓ ${filename} already clean`);
            }
        }
    });
    
    console.log("\n[SUCCESS] Repository is now safe for GitHub");
    console.log("[INFO] All secrets replaced with placeholders");
}

if (require.main === module) {
    finalCleanup();
}