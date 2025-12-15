#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function moveScatteredFiles() {
    console.log("[INFO] Moving scattered files to proper folders");
    console.log("=".repeat(50));
    
    const fileMoves = [
        // Email related files
        { from: 'check-recent-email-logs.js', to: 'scripts/email/check-recent-email-logs.js' },
        { from: 'check-prod-auth-logs.js', to: 'scripts/email/check-prod-auth-logs.js' },
        { from: 'check-forgot-password-attempts.js', to: 'scripts/email/check-forgot-password-attempts.js' },
        
        // ECS related files
        { from: 'check-fargate-logs.js', to: 'scripts/ecs/check-fargate-logs.js' },
        { from: 'find-fargate-logs.js', to: 'scripts/ecs/find-fargate-logs.js' },
        
        // Utils
        { from: 'auto-organize-files.js', to: 'scripts/utils/auto-organize-files.js' }
    ];
    
    fileMoves.forEach(({ from, to }) => {
        if (fs.existsSync(from)) {
            // Ensure target directory exists
            const targetDir = path.dirname(to);
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }
            
            fs.renameSync(from, to);
            console.log(`✅ Moved: ${from} → ${to}`);
        }
    });
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

# Temporary files
*.tmp
*.temp
`;
    
    fs.writeFileSync('.gitignore', gitignoreContent);
    console.log('🛡️ Updated .gitignore');
}

function main() {
    moveScatteredFiles();
    updateGitignore();
    
    console.log("\n✅ All files organized properly");
    console.log("📁 New files will be placed in correct folders automatically");
}

if (require.main === module) {
    main();
}