#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function createFolders() {
    const folders = [
        'scripts/email',
        'scripts/ecs',
        'scripts/storage', 
        'scripts/security',
        'scripts/utils',
        'docs',
        'config',
        'examples'
    ];
    
    folders.forEach(folder => {
        if (!fs.existsSync(folder)) {
            fs.mkdirSync(folder, { recursive: true });
            console.log(`✅ Created folder: ${folder}`);
        }
    });
}

function organizeFiles() {
    const fileMap = {
        // Email related scripts
        'scripts/email/': [
            'check-email-priority.js',
            'compare-email-providers.js', 
            'fix-ses-from-email.js',
            'check-ses-domains.js',
            'check-ses-regions.js',
            'fetch-ses-logs.js',
            'improve-ses-reputation.js',
            'investigate-email-delivery.js',
            'send-and-trace-email.js',
            'test-reset-password.js',
            'test-smtp-credentials.js',
            'trace-specific-email.js'
        ],
        
        // ECS related scripts
        'scripts/ecs/': [
            'check-ecs-ses-errors.js',
            'check-env-precedence.js',
            'remove-task-def-smtp.js',
            'restart-ecs-services.js',
            'update-ecs-task-definition.js',
            'apply-log-retention-all-ecs.js'
        ],
        
        // Storage related scripts
        'scripts/storage/': [
            'analyze-storage-errors.js',
            'check-storage-utilization.js',
            'fix-storage-issues.js',
            'investigate-storage-issues.js',
            'verify-storage-fixes.js'
        ],
        
        // Security related scripts
        'scripts/security/': [
            'clean-secrets-from-repo.js',
            'final-secret-cleanup.js',
            'push-clean-repo.js'
        ],
        
        // Configuration scripts
        'scripts/utils/': [
            'check-s3-config.js',
            'organize-files.js'
        ],
        
        // Configuration files
        'config/': [
            'setup-ses-logging.js',
            'secrets-template.js',
            'local-secrets.js'
        ],
        
        // Documentation
        'docs/': [
            'EMAIL-DELIVERY-ISSUE-RESOLUTION.md',
            'SES-REPUTATION-GUIDE.md'
        ],
        
        // Examples
        'examples/': [
            'example-usage.js',
            'setup-local-only-secrets.js'
        ]
    };
    
    Object.keys(fileMap).forEach(targetFolder => {
        fileMap[targetFolder].forEach(filename => {
            if (fs.existsSync(filename)) {
                const targetPath = path.join(targetFolder, filename);
                fs.renameSync(filename, targetPath);
                console.log(`📁 Moved: ${filename} → ${targetPath}`);
            }
        });
    });
}

function createReadme() {
    const readmeContent = `# DevOps Scripts

Comprehensive collection of AWS DevOps automation scripts for email delivery, ECS management, and infrastructure monitoring.

## 📁 Folder Structure

### \`scripts/email/\`
Email delivery and SES management scripts
- Email provider configuration and testing
- SES domain verification and reputation management
- SMTP troubleshooting and tracing

### \`scripts/ecs/\`
ECS (Elastic Container Service) management
- Service deployment and configuration
- Environment variable management
- Log retention and monitoring

### \`scripts/storage/\`
Storage monitoring and optimization
- Storage utilization analysis
- Error investigation and fixes
- Performance optimization

### \`scripts/security/\`
Security and secrets management
- Secret cleanup and repository sanitization
- Credential management utilities

### \`scripts/utils/\`
General utility scripts
- Configuration management
- File organization tools

### \`config/\`
Configuration files and templates
- Secret templates and local configuration
- Service setup scripts

### \`docs/\`
Documentation and guides
- Issue resolution documentation
- Best practices and guides

### \`examples/\`
Example usage and setup scripts
- Implementation examples
- Setup utilities

## 🔒 Security

- All secrets are stored in \`config/local-secrets.js\` (git ignored)
- Use \`config/secrets-template.js\` as a template
- Never commit real credentials to the repository

## 🚀 Usage

1. Copy \`config/secrets-template.js\` to \`config/local-secrets.js\`
2. Add your real credentials to \`local-secrets.js\`
3. Run scripts from the root directory: \`node scripts/email/test-smtp-credentials.js\`

## 📋 Key Scripts

- **Email Testing**: \`scripts/email/test-smtp-credentials.js\`
- **ECS Management**: \`scripts/ecs/restart-ecs-services.js\`
- **Storage Analysis**: \`scripts/storage/check-storage-utilization.js\`
- **Security Cleanup**: \`scripts/security/clean-secrets-from-repo.js\`
`;
    
    fs.writeFileSync('README.md', readmeContent);
    console.log('📝 Created README.md');
}

function updateGitignore() {
    const gitignoreContent = `# Local secrets and credentials
config/local-secrets.js
*-secrets.js
*-credentials.js
.env*
*.key
*.pem

# Dependencies
node_modules/
package-lock.json

# Logs
*.log
logs/

# IDE
.vscode/
.idea/
*.swp

# OS
.DS_Store
Thumbs.db

# Build
dist/
build/
*.zip
*.tar.gz
`;
    
    fs.writeFileSync('.gitignore', gitignoreContent);
    console.log('🛡️ Updated .gitignore');
}

function main() {
    console.log("📁 ORGANIZING DEVOPS REPOSITORY");
    console.log("=".repeat(50));
    
    createFolders();
    console.log();
    
    organizeFiles();
    console.log();
    
    createReadme();
    updateGitignore();
    
    console.log("\n✅ ORGANIZATION COMPLETE");
    console.log("📁 Files organized into logical folders");
    console.log("📝 README.md created with documentation");
    console.log("🛡️ .gitignore updated for security");
}

if (require.main === module) {
    main();
}