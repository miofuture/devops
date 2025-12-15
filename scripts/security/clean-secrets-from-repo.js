#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function findSecretsInFiles() {
    console.log("[INFO] Scanning for exposed secrets in repository files");
    console.log("=".repeat(60));
    
    const secretPatterns = [
        /AKIA[0-9A-Z]{16}/g,  // AWS Access Key
        /[0-9a-zA-Z/+]{40}/g, // AWS Secret Key (base64)
        /SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}/g, // SendGrid API Key
        /smtp\.eu-central-1\.amazonaws\.com/g, // SMTP host
        /email-smtp\.[a-z0-9-]+\.amazonaws\.com/g, // SES SMTP
        /BM\+[a-zA-Z0-9+/=]+/g, // Encoded passwords
        /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g // Email addresses
    ];
    
    const filesToCheck = [
        'check-env-precedence.js',
        'check-s3-config.js', 
        'compare-email-providers.js',
        'check-email-priority.js',
        'fix-ses-from-email.js',
        'EMAIL-DELIVERY-ISSUE-RESOLUTION.md'
    ];
    
    const foundSecrets = [];
    
    filesToCheck.forEach(filename => {
        const filepath = path.join(__dirname, filename);
        
        if (fs.existsSync(filepath)) {
            const content = fs.readFileSync(filepath, 'utf8');
            
            secretPatterns.forEach((pattern, index) => {
                const matches = content.match(pattern);
                if (matches) {
                    matches.forEach(match => {
                        foundSecrets.push({
                            file: filename,
                            type: ['AWS Access Key', 'AWS Secret', 'SendGrid Key', 'SMTP Host', 'SES SMTP', 'Password', 'Email'][index],
                            secret: match,
                            line: content.split('\n').findIndex(line => line.includes(match)) + 1
                        });
                    });
                }
            });
        }
    });
    
    if (foundSecrets.length > 0) {
        console.log(`\n[FOUND] ${foundSecrets.length} potential secrets:`);
        foundSecrets.forEach(secret => {
            console.log(`  ${secret.file}:${secret.line} - ${secret.type}: ${secret.secret.substring(0, 10)}...`);
        });
    } else {
        console.log(`\n[CLEAN] No secrets found in repository files`);
    }
    
    return foundSecrets;
}

function createGitignore() {
    const gitignoreContent = `# Secrets and credentials
*.env
.env*
config/
credentials/
secrets/
*.key
*.pem
*.p12
*.pfx

# AWS credentials
.aws/
aws-credentials*
credentials.json

# Node modules and logs
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# IDE files
.vscode/
.idea/
*.swp
*.swo

# OS files
.DS_Store
Thumbs.db

# Temporary files
*.tmp
*.temp
*.log

# Build outputs
dist/
build/
*.zip
*.tar.gz
`;

    const gitignorePath = path.join(__dirname, '.gitignore');
    
    if (fs.existsSync(gitignorePath)) {
        console.log(`\n[INFO] .gitignore already exists`);
        const existing = fs.readFileSync(gitignorePath, 'utf8');
        if (!existing.includes('*.env')) {
            fs.appendFileSync(gitignorePath, '\n' + gitignoreContent);
            console.log(`[INFO] Added security rules to existing .gitignore`);
        }
    } else {
        fs.writeFileSync(gitignorePath, gitignoreContent);
        console.log(`\n[CREATED] .gitignore with security rules`);
    }
}

function cleanSecretsFromFiles(secrets) {
    console.log(`\n[INFO] Cleaning secrets from files...`);
    
    secrets.forEach(secret => {
        const filepath = path.join(__dirname, secret.file);
        let content = fs.readFileSync(filepath, 'utf8');
        
        // Replace secrets with placeholders
        if (secret.type === 'AWS Access Key') {
            content = content.replace(secret.secret, 'AKIA****************');
        } else if (secret.type === 'AWS Secret') {
            content = content.replace(secret.secret, '****************************************');
        } else if (secret.type === 'SendGrid Key') {
            content = content.replace(secret.secret, 'SG.*********************...');
        } else if (secret.type === 'Password') {
            content = content.replace(secret.secret, '********...');
        } else if (secret.type === 'Email') {
            // Only replace if it's not a generic example
            if (!secret.secret.includes('example.com') && !secret.secret.includes('upscend.com')) {
                content = content.replace(secret.secret, '<email>');
            }
        }
        
        fs.writeFileSync(filepath, content);
        console.log(`  ✅ Cleaned ${secret.file}`);
    });
}

function main() {
    const secrets = findSecretsInFiles();
    createGitignore();
    
    if (secrets.length > 0) {
        cleanSecretsFromFiles(secrets);
        
        console.log(`\n[NEXT STEPS]:`);
        console.log(`1. Review cleaned files to ensure functionality`);
        console.log(`2. Add and commit changes: git add . && git commit -m "Remove secrets"`);
        console.log(`3. If secrets were already pushed, consider rotating them`);
        console.log(`4. Use environment variables or AWS Secrets Manager for production`);
    } else {
        console.log(`\n[SUCCESS] Repository is clean of secrets`);
        console.log(`[INFO] .gitignore created to prevent future exposure`);
    }
}

if (require.main === module) {
    main();
}