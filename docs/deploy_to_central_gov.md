# Deploy resources in the Central Governance Account

1. In the ```config/Config.ts``` file, modify the following parameters.

```bash
DZ_APPLICATION_NAME - Name of the application. 
DZ_STAGE_NAME - Name of the stage. 
DZ_DOMAIN_NAME - Name of the Amazon DataZone domain
DZ_DOMAIN_DESCRIPTION - Description of the Amazon DataZone domain
DZ_DOMAIN_TAG - Tag of the Amazon DataZone domain
DZ_ADMIN_PROJECT_NAME - Name of the Amazon DataZone project for administrators
DZ_ADMIN_PROJECT_DESCRIPTION - Description of the Amazon DataZone project for administrators
CDK_EXEC_ROLE_ARN - ARN of the cdk execution role
DZ_ADMIN_ROLE_ARN - ARN of the administrator role
```
  Keep the remaining parameters empty.

2. Update the Amazon DataZone glossary configuration in the ```lib/utils/glossary_config.json``` file.

3. Update the Amazon DataZone metadata form configuration in the ```lib/utils/metadata_form_config.json``` file. 

4. Export AWS credentials to your development environment for the AWS IAM role with administrative permissions in the following format.

```bash
export AWS_ACCESS_KEY_ID=
export AWS_SECRET_ACCESS_KEY=
export AWS_SESSION_TOKEN=
```

5. Synthesise to create the AWS CloudFormation template.

```bash
npx cdk synth
```

6. Deploy the solution.

```bash
npx cdk deploy --all
```
