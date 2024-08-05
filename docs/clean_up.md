# Clean up


## 1. Disassociate the member accounts


From the AWS Management Console, go to Amazon DataZone.


1. Click on View Domains. Select the domain you’ve created.

2. Select the Account associations tab. Select the account you want to disassociate.

3. Click on disassociate, type “disassociate” to confirm.

Repeat step 1 to step 3 for all member accounts.


## 2. Delete the AWS CloudFormation stack instances

From AWS Management Console, go to AWS CloudFormation console. 

1. Select StackSets from the left panel.

2. Click on the StackSet named ```StackSet-DataZone-DataMesh-Member```.

3. Select the Stack instances tab. Copy the AWS account ID you want to remove from membership.

4. Click on Actions. Select Delete stacks from StackSet. Keep the default options.

5. Enter the account id in the Account numbers field.

6. Select the AWS region in the Specify regions dropdown menu.

7. Click on Next. In next page click on submit.

8. In the Operations tab, wait until the operation has succeeded.

Repeat step 1 to step 8 for all member accounts.


## 3. Destroy all resources.

Implement the following steps in your local development environment (linux or macOS).

1. Go to the root directory of your repository.

2. Export the AWS credentials for the same AWS IAM role, that created the AWS CDK stack.

3. Destroy the cloud resources.

```bash
npx cdk destroy --all
```