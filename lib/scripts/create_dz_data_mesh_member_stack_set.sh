#!/bin/bash


# Set the path to the lambdas
ASSOCIATION_REQUESTOR_PATH="./src/lambda-functions/member_account_dz_infra_deployer/member_account_dz_association_request_acceptor.py"

BLUEPRINT_ENABLER_PATH="./src/lambda-functions/member_account_dz_infra_deployer/member_account_dz_blueprint_enabler.py"

# Set the CloudFormation template file name
TEMPLATE_FILE="./lib/cfn-templates/DzDataMeshMemberStackSet.yaml"

# Read the lambda functions code into variables
ASSOCIATION_REQUESTOR_CODE=$(cat "$ASSOCIATION_REQUESTOR_PATH")
BLUEPRINT_ENABLER_CODE=$(cat "$BLUEPRINT_ENABLER_PATH")

# Construct the CloudFormation template in YAML format
cat > "$TEMPLATE_FILE" << EOF
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
Resources:
  StackSet:
    Type: AWS::CloudFormation::StackSet
    Properties:
      AdministrationRoleARN: !Sub arn:aws:iam::\${AWS::AccountId}:role/DzDataMeshCfnStackSetAdminRole
      Description: This is a StackSet to deploy the datazone infrastructure for bootstrapping the member account
      ExecutionRoleName: DzDataMeshCfnStackSetExecutionRole
      PermissionModel: SELF_MANAGED
      Capabilities:
        - "CAPABILITY_NAMED_IAM"
      StackSetName: "StackSet-DataZone-DataMesh-Member"
      TemplateBody: |
        AWSTemplateFormatVersion: "2010-09-09"
        Description: This template deploys the datazone infrastructure for bootstrapping the member account
        #####################################################
        # Parameters
        #####################################################
        Parameters:
          GovernanceAccountID:
            Type: String
            Description: Account ID of the governance account.
            Default: None

          DomainIdentifier:
            Type: String
            Description: Identifier of the DataZone domain.
            Default: None

          AssociationResourceShareArn:
            Type: String
            Description: RAM Resource Share ARN of the DataZone association request.
            Default: None

          NotificationQueueUrl:
            Type: String
            Description: URL of the SQS Notification Queue in the governance account.
            Default: None
        #####################################################
        # Resources
        #####################################################
        Resources:

          # Blueprint bucket
          DataZoneBluePrintBucket:
            Type: AWS::S3::Bucket
            Properties:
              BucketName: !Sub "amazon-datazone-\${AWS::AccountId}-\${AWS::Region}-datamesh-cfn"
              BucketEncryption:
                ServerSideEncryptionConfiguration:
                  - ServerSideEncryptionByDefault:
                      SSEAlgorithm: "AES256"

          DataZoneBluePrintBucketPolicy:
            Type: AWS::S3::BucketPolicy
            Properties:
              Bucket: !Ref DataZoneBluePrintBucket
              PolicyDocument:
                Statement:
                  - Action:
                      - "s3:*"
                    Effect: "Deny"
                    Resource:
                      - !GetAtt DataZoneBluePrintBucket.Arn
                      - !Sub "\${DataZoneBluePrintBucket.Arn}/*"
                    Principal: "*"
                    Condition:
                      Bool:
                        "aws:SecureTransport": "false"


          # IAM DataZone role (provisioningRole) for the member accounts
          MemberAccountProvisioningRole:
            Type: AWS::IAM::Role
            Properties:
              RoleName: !Sub "AmazonDataZoneProvisioning-\${GovernanceAccountID}"
              AssumeRolePolicyDocument:
                Version: 2012-10-17
                Statement:
                  - Effect: Allow
                    Principal:
                      "Service": "datazone.amazonaws.com"
                    Action:
                      - 'sts:AssumeRole'
                    Condition:
                      StringEquals:
                        'aws:SourceAccount': !Ref GovernanceAccountID
              Path: /service-role/
              ManagedPolicyArns:
                - arn:aws:iam::aws:policy/AmazonDataZoneRedshiftGlueProvisioningPolicy


          # IAM DataZone role (manageAccessRole) for the member accounts
          MemberAccountManageAccessRole:
            Type: AWS::IAM::Role
            Properties:
              RoleName: !Sub "AmazonDataZoneGlueAccess-\${AWS::Region}-\${DomainIdentifier}"
              AssumeRolePolicyDocument:
                Version: 2012-10-17
                Statement:
                  - Effect: Allow
                    Principal:
                      "Service": "datazone.amazonaws.com"
                    Action:
                      - 'sts:AssumeRole'
                    Condition:
                      StringEquals:
                        'aws:SourceAccount': !Ref GovernanceAccountID
                      ArnEquals:
                        'aws:SourceArn': !Sub "arn:aws:datazone:\${AWS::Region}:\${GovernanceAccountID}:domain/\${DomainIdentifier}"
              Path: /service-role/
              ManagedPolicyArns:
                - arn:aws:iam::aws:policy/service-role/AmazonDataZoneGlueManageAccessRolePolicy

          DataZoneBootstrapInfraQueue:
            Type: AWS::SQS::Queue
            Properties:
              DelaySeconds: 120
              VisibilityTimeout: 1800
              QueueName: !Sub "datazone-\${AWS::AccountId}-\${AWS::Region}-datamesh"
              SqsManagedSseEnabled: True



          DataZoneBluePrintEnablerEventSourceMapping:
            Type: AWS::Lambda::EventSourceMapping
            Properties:
              BatchSize: 10
              Enabled: true
              EventSourceArn: !GetAtt DataZoneBootstrapInfraQueue.Arn
              FunctionName: !GetAtt DataZoneBluePrintEnabler.Arn


          DataZoneAssociationRequestAcceptorCustomResource:
            Type: 'Custom::DataZoneAssociationRequestAcceptor'
            Properties:
              ServiceToken: !GetAtt DataZoneAssociationRequestAcceptor.Arn
              AssociationResourceShareArn: !Ref AssociationResourceShareArn

          # cfnresponse is supported latest in python3.11
          DataZoneAssociationRequestAcceptor:
            Type: AWS::Lambda::Function
            Properties:
              Runtime: python3.11
              MemorySize: 256
              Role: !Sub "arn:aws:iam::\${AWS::AccountId}:role/DzDataMeshCfnStackSetExecutionRole"
              Environment:
                Variables:
                  GOV_ACCOUNT_ID: !Ref GovernanceAccountID
                  DOMAIN_ID: !Ref DomainIdentifier
                  SQS_QUEUE_URL: !GetAtt DataZoneBootstrapInfraQueue.QueueUrl
              Timeout: 300
              Handler: index.lambda_handler
              Code:
                ZipFile: |
$(
    printf '%s\n' "$ASSOCIATION_REQUESTOR_CODE" |
    sed 's/^/                  /'
)



              Description: Deploys the datazone infrastructure to accept the association request in the member account.



          DataZoneBluePrintEnabler:
            Type: AWS::Lambda::Function
            Properties:
              Runtime: python3.12
              MemorySize: 256
              Role: !Sub "arn:aws:iam::\${AWS::AccountId}:role/DzDataMeshCfnStackSetExecutionRole"
              Environment:
                Variables:
                  GOV_ACCOUNT_ID: !Ref GovernanceAccountID
                  DOMAIN_ID: !Ref DomainIdentifier
                  SQS_QUEUE_URL: !GetAtt DataZoneBootstrapInfraQueue.QueueUrl
                  NOTIFICATION_QUEUE_URL: !Ref NotificationQueueUrl
              Timeout: 300
              Handler: index.lambda_handler
              Code:
                ZipFile: |
$(
    printf '%s\n' "$BLUEPRINT_ENABLER_CODE" |
    sed 's/^/                  /'
)




              Description: Enables the Datalake blueprint in the member account.


EOF

echo "Data Mesh Member StackSet template created: $TEMPLATE_FILE"

