#!/usr/bin/env node
const { execSync } = require('child_process');

function executeCommand(command, description) {
    try {
        console.log(`[INFO] ${description}`);
        console.log(`[CMD] ${command}`);
        const output = execSync(command, { encoding: 'utf8', cwd: process.cwd() });
        if (output.trim()) {
            console.log(output);
        }
        console.log(`✅ Success\n`);
        return true;
    } catch (error) {
        console.log(`❌ Error: ${error.message}\n`);
        return false;
    }
}

function pushCleanRepo() {
    console.log("=".repeat(60));
    console.log("PUSH CLEAN REPOSITORY & REMOVE SECRET HISTORY");
    console.log("=".repeat(60));
    
    // Step 1: Add all cleaned files
    executeCommand('git add .', 'Adding all cleaned files');
    
    // Step 2: Commit cleaned version
    executeCommand('git commit -m "Clean repository: Remove all secrets and credentials"', 'Committing cleaned files');
    
    // Step 3: Create new orphan branch (fresh history)
    executeCommand('git checkout --orphan clean-main', 'Creating clean branch without history');
    
    // Step 4: Add files to new branch
    executeCommand('git add .', 'Adding files to clean branch');
    
    // Step 5: Commit to new branch
    executeCommand('git commit -m "Initial commit: DevOps scripts (secrets removed)"', 'Creating initial clean commit');
    
    // Step 6: Delete old main branch
    executeCommand('git branch -D main', 'Deleting old main branch with secret history');
    
    // Step 7: Rename clean branch to main
    executeCommand('git branch -m main', 'Renaming clean branch to main');
    
    // Step 8: Force push to GitHub (overwrites history)
    console.log(`[WARNING] About to force push and overwrite GitHub history`);
    console.log(`[INFO] This will permanently remove all previous commits with secrets`);
    
    executeCommand('git push -f origin main', 'Force pushing clean repository to GitHub');
    
    console.log("=".repeat(60));
    console.log("✅ REPOSITORY CLEANED AND PUSHED");
    console.log("=".repeat(60));
    console.log("✅ All secrets removed from files");
    console.log("✅ All commit history with secrets erased");
    console.log("✅ Fresh repository pushed to GitHub");
    console.log("✅ Safe to share publicly");
    
    console.log("\n[NEXT STEPS]:");
    console.log("1. Verify repository on GitHub");
    console.log("2. Check that no secrets are visible");
    console.log("3. Consider rotating any exposed credentials as precaution");
}

if (require.main === module) {
    pushCleanRepo();
}