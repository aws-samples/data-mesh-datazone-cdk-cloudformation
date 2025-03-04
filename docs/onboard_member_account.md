# Onboard new member account 

At the moment DzDataMeshCfnStackSetExecutionRole.yaml assumes DzDataMeshCfnStackSetAdminRole exists in the governance account.  

1. Deploy the AWS CloudFormation template located at lib/cfn-templates/DzDataMeshCfnStackSetExecutionRole.yaml in the member account with the appropriate input parameters.

DataMeshApplicationName - the name you configured in Config.ts  
GovernanceAccountID - Account id of the governance account  
DataZoneKMSKeyID - Id of the AWS Key Management Service (KMS) key, that encrypts the DataZone metadata  
NotificationQueueName - Name of the Amazon SQS notification queue in the governance account  

```bash
aws cloudformation deploy \
    --template-file ./lib/cfn-templates/DzDataMeshCfnStackSetExecutionRole.yaml \
    --stack-name DzDataMeshCfnStackSetExecutionRoleStack \
    --capabilities CAPABILITY_NAMED_IAM \
    --parameter-overrides DataMeshApplicationName=dz-data-mesh DataZoneKMSKeyID=... GovernanceAccountID=... NotificationQueueName=... \
    --region us-east-1
```

2. Update the list of AWS CloudFormation StackSet execution role ARNs for the member accounts in Config.ts.

```bash
DZ_MEMBER_STACK_SET_EXEC_ROLE_LIST  - List of Stack set execution role arns for the member accounts.
```

3. Synthesize the AWS CloudFormation template and deploy the solution.

```bash
npx cdk synth
npx cdk deploy --all
```

4. From the AWS management console of the Central Governance Account, go to Amazon DataZone.
    - Click the domain, you just created.
    - Go to account association and click on Request Association.
    - Provide the AWS account ID and select AWSRAMPermissionDataZonePortalReadWrite as RAM policy.
    - Click on Request Association.
    - Wait until you receive an email notification that your account is successfully bootstrapped.

5. Update the following parameters in the config file in the format below.

```typescript
 export const DZ_MEMBER_ACCOUNT_CONFIG: memberAccountConfig = {
  '123456789012' : {
    PROJECT_NAME: 'TEST-PROJECT-123456789012',
    PROJECT_DESCRIPTION: 'TEST-PROJECT-123456789012',
    PROJECT_EMAIL: 'user@xyz.com'
  }
}
```

6. Synthesize the AWS CloudFormation template and deploy the solution.

```bash
npx cdk synth
npx cdk deploy --all
```

Repeat step (a) to step (f) to onboard additional member accounts in the data solution. This solution doesn’t differentiate between data producers and consumers.