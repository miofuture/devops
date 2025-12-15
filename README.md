# DevOps Scripts

Comprehensive collection of AWS DevOps automation scripts for email delivery, ECS management, and infrastructure monitoring.

## 📁 Folder Structure

### `scripts/email/`
Email delivery and SES management scripts
- Email provider configuration and testing
- SES domain verification and reputation management
- SMTP troubleshooting and tracing

### `scripts/ecs/`
ECS (Elastic Container Service) management
- Service deployment and configuration
- Environment variable management
- Log retention and monitoring

### `scripts/storage/`
Storage monitoring and optimization
- Storage utilization analysis
- Error investigation and fixes
- Performance optimization

### `scripts/security/`
Security and secrets management
- Secret cleanup and repository sanitization
- Credential management utilities

### `scripts/utils/`
General utility scripts
- Configuration management
- File organization tools

### `config/`
Configuration files and templates
- Secret templates and local configuration
- Service setup scripts

### `docs/`
Documentation and guides
- Issue resolution documentation
- Best practices and guides

### `examples/`
Example usage and setup scripts
- Implementation examples
- Setup utilities

## 🔒 Security

- All secrets are stored in `config/local-secrets.js` (git ignored)
- Use `config/secrets-template.js` as a template
- Never commit real credentials to the repository

## 🚀 Usage

1. Copy `config/secrets-template.js` to `config/local-secrets.js`
2. Add your real credentials to `local-secrets.js`
3. Run scripts from the root directory: `node scripts/email/test-smtp-credentials.js`

## 📋 Key Scripts

- **Email Testing**: `scripts/email/test-smtp-credentials.js`
- **ECS Management**: `scripts/ecs/restart-ecs-services.js`
- **Storage Analysis**: `scripts/storage/check-storage-utilization.js`
- **Security Cleanup**: `scripts/security/clean-secrets-from-repo.js`
