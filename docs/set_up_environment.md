# Set up environment

Implement the following steps in your local development environment (Linux or macOS).

1. Clone the repository.

```bash
git clone https://github.com/aws-samples/data-mesh-datazone-cdk-cloudformation.git
```


2. Create python virtual environment.

```bash
 python3 -m venv .venv
 source .venv/bin/activate
 pip install -r requirements.txt
```

4. CDK bootstrap the Central Governance Account.

```bash
cdk bootstrap aws://<GOVERNANCE_ACCOUNT_ID>/<AWS_REGION>
```

Log into the Central Governance Account management console and get the ARN of the cdk execution role.

5. Construct the ```DzDataMeshMemberStackSet.yaml``` file. From the root directory of the repository, initiate the bash script

```bash
./lib/scripts/create_dz_data_mesh_member_stack_set.sh
```

Ensure that the AWS CloudFormation template file is created at ```lib/cfn-templates/DzDataMeshMemberStackSet.yaml```.
