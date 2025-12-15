# Fargate Container Access Guide

**Date**: December 15, 2025  
**Purpose**: Access ECS Fargate containers for debugging email issues

## 🐳 Container Access Commands

### DEV Environment

#### Auth Service (Email Sending)
```bash
aws ecs execute-command --region eu-central-1 --cluster upscend-dev-api-cluster --task 257d27a253d0469399028b0c73450f5d --container upscend-api-auth --interactive --command "/bin/bash"
```

#### Main API Service
```bash
aws ecs execute-command --region eu-central-1 --cluster upscend-dev-api-cluster --task 08d51c68db5c4b68ab63724214e66940 --container upscend-api --interactive --command "/bin/bash"
```

#### Notification Service
```bash
aws ecs execute-command --region eu-central-1 --cluster upscend-dev-api-cluster --task 4a2d4c4abdf7460fa28b9b06aec4170a --container upscend-api-notif --interactive --command "/bin/bash"
```

### PROD Environment

#### Auth Service (Email Sending)
```bash
aws ecs execute-command --region eu-central-1 --cluster upscend-prod-api-cluster --task f9bc5a14d71b459c972e6cc6721dbcb8 --container upscend-api-auth --interactive --command "/bin/bash"
```

#### Main API Service
```bash
aws ecs execute-command --region eu-central-1 --cluster upscend-prod-api-cluster --task 37942185c941420fb866b5cfb3d0b7f2 --container upscend-api --interactive --command "/bin/bash"
```

#### Notification Service
```bash
aws ecs execute-command --region eu-central-1 --cluster upscend-prod-api-cluster --task 104269b291c74fe1a74fe68e0eaedd40 --container upscend-api-notif --interactive --command "/bin/bash"
```

## 🔍 Debugging Commands

### Check Email Configuration
```bash
# Check environment variables
env | grep -E "(MAIL|SMTP|SES|SENDGRID)"

# Check specific SES variables
echo "SES_SMTP_HOST: $SES_SMTP_HOST"
echo "SES_SMTP_USER: $SES_SMTP_USER"
echo "SENDGRID_API_KEY: $SENDGRID_API_KEY"
```

### Test API Endpoints
```bash
# Test forgot password endpoint
curl -X POST localhost:3000/auth/forgot-password \
     -H "Content-Type: application/json" \
     -d '{"email":"test@test.com"}'

# Check API health
curl localhost:3000/health

# List available routes
curl localhost:3000/
```

### Check Application Logs
```bash
# Find log files
find /var/log -name "*.log" -type f

# Tail application logs
tail -f /var/log/app.log

# Check recent logs
journalctl -u your-service --since "1 hour ago"

# Check stdout/stderr
tail -f /proc/1/fd/1
tail -f /proc/1/fd/2
```

### System Information
```bash
# Check running processes
ps aux | grep node

# Check network connections
netstat -tlnp

# Check disk space
df -h

# Check memory usage
free -h

# Check container info
cat /proc/version
```

### Email Testing
```bash
# Test SMTP connection (if telnet available)
telnet email-smtp.eu-central-1.amazonaws.com 587

# Check DNS resolution
nslookup email-smtp.eu-central-1.amazonaws.com

# Test with Node.js
node -e "
const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransporter({
  host: process.env.SES_SMTP_HOST,
  port: 587,
  auth: {
    user: process.env.SES_SMTP_USER,
    pass: process.env.SES_SMTP_PASS
  }
});
transporter.verify((error, success) => {
  console.log(error ? 'SMTP Error: ' + error : 'SMTP Ready: ' + success);
});
"
```

## 📋 Prerequisites

### AWS CLI Setup
```bash
# Install AWS CLI (if not installed)
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Configure AWS CLI
aws configure
```

### Session Manager Plugin
```bash
# Install Session Manager plugin
curl "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/ubuntu_64bit/session-manager-plugin.deb" -o "session-manager-plugin.deb"
sudo dpkg -i session-manager-plugin.deb
```

## ⚠️ Important Notes

1. **Wait Time**: Wait 30-60 seconds after enabling ECS Exec before connecting
2. **Task IDs**: Task IDs change when containers restart - use the script to get current IDs
3. **Permissions**: Ensure your AWS user has ECS execute permissions
4. **Shell**: If `/bin/bash` fails, try `/bin/sh`
5. **Exit**: Use `exit` command to disconnect from container

## 🛠️ Automation Script

Use the automation script to enable ECS Exec and get current task IDs:

```bash
# Enable ECS Exec for all services
node scripts/ecs/connect-dev-fargate.js
```

## 🔧 Troubleshooting

### Connection Issues
```bash
# Check ECS Exec status
aws ecs describe-services --cluster upscend-prod-api-cluster --services upscend-prod-api-td-auth-service

# Check task definition
aws ecs describe-task-definition --task-definition upscend-prod-api-auth-td

# Check IAM permissions
aws sts get-caller-identity
```

### Common Errors
- **"ExecuteCommandAgent not running"**: Wait longer or restart the service
- **"Permission denied"**: Check IAM permissions for ECS execute
- **"Task not found"**: Get current task ID using the script
- **"Container not found"**: Check container name in task definition

## 📊 Email Issue Diagnosis

### Check Email Provider
```bash
# In container, check which provider is configured
if [ -n "$SENDGRID_API_KEY" ]; then
  echo "Using SendGrid"
elif [ -n "$SES_SMTP_HOST" ]; then
  echo "Using SES"
else
  echo "No email provider configured"
fi
```

### Verify Configuration
```bash
# Check S3 config loading
ls -la /app/config/
cat /app/config/production.json

# Check environment precedence
env | sort | grep -E "(MAIL|SMTP|SES|SENDGRID)"
```

This guide provides complete access to your Fargate containers for debugging the email sending issues.