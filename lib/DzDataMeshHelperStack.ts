/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import * as cdk from 'aws-cdk-lib';
import { CfnOutput, Duration } from 'aws-cdk-lib';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as S3Deployment from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import * as cr from 'aws-cdk-lib/custom-resources';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import * as path from 'path';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { NagSuppressions } from 'cdk-nag';
import { CDK_EXEC_ROLE_ARN, DZ_APPLICATION_NAME } from '../config/Config';
import { CommonUtils } from './utils/CommonUtils';
import * as events from 'aws-cdk-lib/aws-events';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as targets from 'aws-cdk-lib/aws-events-targets';

interface DzDataMeshHelperStackProps extends cdk.StackProps {
  applicationName: string;
  stageName: string;
}

export class DzDataMeshHelperStack extends cdk.Stack {
  public readonly encryptionKey: kms.Key;
  public readonly rootDomainDzProvisioningRoleArn: string;
  public readonly rootDomainBlueprintBucketName: string;
  public readonly manageProjectMembershipCustomResource: Provider;
  public readonly manageGlossaryCustomResource: Provider;
  public readonly manageMetadataFormCustomResource: Provider;
  public readonly dzDataMeshCfnAssetsUrlPrefix: string;
  public readonly dzDatameshAssetsUploader: S3Deployment.BucketDeployment;
  public readonly lambdaLayerVersionArnParameterName: string;

  constructor(scope: Construct, id: string, props: DzDataMeshHelperStackProps) {
    super(scope, id, props);

    const blueprintBucket = this.createDzBlueprintBucket();
    this.rootDomainBlueprintBucketName = `s3://${blueprintBucket.bucketName}`;

    const dzDataMeshAssetsBucket = this.createDzDataMeshAssetsBucket();
    this.dzDatameshAssetsUploader = this.datameshAssetsUploader(
      dzDataMeshAssetsBucket,
    );
    this.dzDataMeshCfnAssetsUrlPrefix = `https://${dzDataMeshAssetsBucket.bucketName}.s3.${this.region}.amazonaws.com`;

    //TODO: Check if Provisioning Role exist and provision
    this.rootDomainDzProvisioningRoleArn = `arn:aws:iam::${this.account}:role/service-role/AmazonDataZoneProvisioning-${this.account}`;

    const utilsLambdaLayerArn = this.createLambdaLayer();

    this.lambdaLayerVersionArnParameterName =
      this.updateLambdaVersionArnParameter(props, utilsLambdaLayerArn);

    this.manageProjectMembershipCustomResource =
      this.manageProjectMembershipCustomResourceProvider(
        props.applicationName,
        utilsLambdaLayerArn,
      );

    this.manageGlossaryCustomResource =
      this.manageGlossaryCustomResourceProvider(
        props.applicationName,
        utilsLambdaLayerArn,
      );
    this.manageMetadataFormCustomResource =
      this.manageMetadataFormCustomResourceProvider(
        props.applicationName,
        utilsLambdaLayerArn,
      );

    const manageMemberAccountBootstrapUtils =
      this.manageMemberAccountBootstrapUtils(
        props,
        this.dzDataMeshCfnAssetsUrlPrefix,
        dzDataMeshAssetsBucket.bucketArn,
        utilsLambdaLayerArn,
      );

    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.node.path}/DzBlueprintBucket/Resource`,
      [
        {
          id: 'AwsSolutions-S1',
          reason: ' The S3 Bucket does not require server access logs',
        },
      ],
    );
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.node.path}/DzDataMeshAssetsBucket/Resource`,
      [
        {
          id: 'AwsSolutions-S1',
          reason: ' The S3 Bucket does not require server access logs',
        },
      ],
    );
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.node.path}/ProjectMembershipManagerCustomResource/framework-onEvent/Resource`,
      [
        {
          id: 'AwsSolutions-L1',
          reason: 'The lambda version not controllable from Provider',
        },
      ],
    );
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.node.path}/GlossaryManagerCustomResource/framework-onEvent/Resource`,
      [
        {
          id: 'AwsSolutions-L1',
          reason: 'The lambda version not controllable from Provider',
        },
      ],
    );
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.node.path}/MetadataFormManagerCustomResource/framework-onEvent/Resource`,
      [
        {
          id: 'AwsSolutions-L1',
          reason: 'The lambda version not controllable from Provider',
        },
      ],
    );
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.node.path}/Custom::CDKBucketDeployment8693BB64968944B69AAFB0CC9EB8756C/Resource`,
      [
        {
          id: 'AwsSolutions-L1',
          reason: 'The lambda version not controllable from S3Deployment',
        },
      ],
    );
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.node.path}/Custom::CDKBucketDeployment8693BB64968944B69AAFB0CC9EB8756C/ServiceRole/Resource`,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'The permissions are automatically managed through CDK',
        },
      ],
    );
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.node.path}/Custom::CDKBucketDeployment8693BB64968944B69AAFB0CC9EB8756C/ServiceRole/DefaultPolicy/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'The permissions are automatically managed through CDK',
        },
      ],
    );
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.node.path}/ProjectMembershipManager-CustomResourceRole/PolicyDzDataMeshHelperStackProjectMembershipManagerCustomResourceRoleB4F3DAD8/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Custom resource uses CDK execution role',
        },
      ],
    );
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.node.path}/GlossaryManager-CustomResourceRole/PolicyDzDataMeshHelperStackGlossaryManagerCustomResourceRole325A0946/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Custom resource uses CDK execution role',
        },
      ],
    );
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.node.path}/MetadataFormManager-CustomResourceRole/PolicyDzDataMeshHelperStackMetadataFormManagerCustomResourceRole723FF326/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Custom resource uses CDK execution role',
        },
      ],
    );
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.node.path}/MemberAccountBootstrapUtilsFormManager-Policy/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Wildcard permissions are required for solution',
        },
      ],
    );
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.node.path}/dz-data-mesh-MemberAccountBootstrapUtilsFormManager-event-queue-DLQ/Resource`,
      [
        {
          id: 'AwsSolutions-SQS3',
          reason:
            'The SQS queue is used as a dead-letter queue (DLQ) for the EventBridge rule',
        },
      ],
    );

    new CfnOutput(this, `${props.applicationName}-ObjectKeyPrefix`, {
      value: this.dzDataMeshCfnAssetsUrlPrefix,
      description: 'The stackset object key',
      exportName: `${props.applicationName}-ObjectKeyPrefix`,
    });
  }

  private createDzBlueprintBucket() {
    const bucketIdentifier = 'DzBlueprintBucket';
    const bucketName = `amazon-datazone-${this.account}-${this.region}-datamesh-cdk`;
    return CommonUtils.createS3Bucket(this, bucketIdentifier, bucketName);
  }

  private datameshAssetsUploader(dataMeshAssetsBucket: Bucket) {
    return new S3Deployment.BucketDeployment(this, 'DatameshAssetsUploader', {
      sources: [
        S3Deployment.Source.asset(path.join(__dirname, './cfn-templates/')),
      ],
      destinationBucket: dataMeshAssetsBucket,
    });
  }

  private createDzDataMeshAssetsBucket() {
    const bucketIdentifier = 'DzDataMeshAssetsBucket';
    const bucketName = `amazon-datazone-datamesh-assets-${this.account}-${this.region}-cdk`;
    return CommonUtils.createS3Bucket(this, bucketIdentifier, bucketName);
  }

  private createLambdaLayer() {
    const lambdaLayer = new lambda.LayerVersion(this, 'Datamesh-utils', {
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../src/lambda-layers'),
        {
          bundling: {
            image: lambda.Runtime.PYTHON_3_13.bundlingImage,
            command: [
              'bash',
              '-c',
              'pip install -r requirements.txt -t /asset-output/python && cp -r /asset-input/common /asset-output/python',
            ],
          },
        },
      ),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_13],
      layerVersionName: 'utils',
      description: 'Common utilities for Data Mesh Solution',
    });

    return lambdaLayer.layerVersionArn;
  }

  private updateLambdaVersionArnParameter(
    props: DzDataMeshHelperStackProps,
    utilsLambdaLayerArn: string,
  ) {
    const utilsLambdaLayerArnParameter = new ssm.StringParameter(
      this,
      'utilsLambdaLayerArnParameter',
      {
        parameterName: `/${props.applicationName}/${props.stageName}/utilsLambdaLayerArn`,
        description: 'The Arn of the utils Lambda Layer',
        stringValue: utilsLambdaLayerArn,
        simpleName: false,
      },
    );

    const boto3LambdaLayerArnParameter = new ssm.StringParameter(
      this,
      'boto3LambdaLayerArnParameter',
      {
        parameterName: `/${props.applicationName}/${props.stageName}/boto3LambdaLayerArn`,
        description: 'The Arn of the utils Lambda Layer',
        stringValue: utilsLambdaLayerArn,
        simpleName: false,
      },
    );

    return boto3LambdaLayerArnParameter.parameterName;
  }

  private manageProjectMembershipCustomResourceProvider(
    applicationName: string,
    dzDataMeshLambdaLayerArn: string,
  ) {
    const lambdaName = 'ProjectMembershipManager';
    const lambdaHandler = 'project_membership_manager.lambda_handler';
    const lambdaProperties = CommonUtils.getLambdaCoreProperties();

    const lambdaFunction = new lambda.Function(this, lambdaName + 'Lambda', {
      code: lambda.Code.fromAsset(
        path.join(
          __dirname,
          '../src/lambda-functions/project_membership_manager',
        ),
      ),
      role: iam.Role.fromRoleArn(
        this,
        'LambdaProjectMembershipManagerRole',
        CDK_EXEC_ROLE_ARN,
      ),
      layers: [
        lambda.LayerVersion.fromLayerVersionArn(
          this,
          `${lambdaName}-utils`,
          dzDataMeshLambdaLayerArn,
        ),
      ],
      environment: {
        LOG_LEVEL: 'INFO',
      },
      handler: lambdaHandler,
      ...lambdaProperties,
    });

    return new cr.Provider(this, lambdaName + 'CustomResource', {
      onEventHandler: lambdaFunction,
      logGroup: new LogGroup(
        this,
        `${applicationName}-${lambdaName}-CustomResourceLogs`,
        { retention: RetentionDays.ONE_MONTH },
      ),
      role: iam.Role.fromRoleArn(
        this,
        `${lambdaName}-CustomResourceRole`,
        CDK_EXEC_ROLE_ARN,
      ),
    });
  }

  private manageGlossaryCustomResourceProvider(
    applicationName: string,
    lambdaLayerArn: string,
  ) {
    const lambdaName = 'GlossaryManager';
    const lambdaHandler = 'glossary_manager.lambda_handler';
    const lambdaProperties = CommonUtils.getLambdaCoreProperties();

    const lambdaFunction = new lambda.Function(this, lambdaName + 'Lambda', {
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../src/lambda-functions/glossary_manager'),
      ),
      role: iam.Role.fromRoleArn(
        this,
        'LambdaGlossaryManagerRole',
        CDK_EXEC_ROLE_ARN,
      ),
      layers: [
        lambda.LayerVersion.fromLayerVersionArn(
          this,
          `${lambdaName}-utils`,
          lambdaLayerArn,
        ),
      ],
      environment: {
        LOG_LEVEL: 'INFO',
      },
      handler: lambdaHandler,
      ...lambdaProperties,
    });

    return new cr.Provider(this, lambdaName + 'CustomResource', {
      onEventHandler: lambdaFunction,
      logGroup: new LogGroup(
        this,
        `${applicationName}-${lambdaName}-CustomResourceLogs`,
        { retention: RetentionDays.ONE_MONTH },
      ),
      role: iam.Role.fromRoleArn(
        this,
        `${lambdaName}-CustomResourceRole`,
        CDK_EXEC_ROLE_ARN,
      ),
    });
  }

  private manageMetadataFormCustomResourceProvider(
    applicationName: string,
    lambdaLayerArn: string,
  ) {
    const lambdaName = 'MetadataFormManager';
    const lambdaHandler = 'metadata_form_manager.lambda_handler';
    const lambdaProperties = CommonUtils.getLambdaCoreProperties();

    const lambdaFunction = new lambda.Function(this, lambdaName + 'Lambda', {
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../src/lambda-functions/metadata_form_manager'),
      ),
      role: iam.Role.fromRoleArn(
        this,
        'LambdaMetadataFormManagerRole',
        CDK_EXEC_ROLE_ARN,
      ),
      layers: [
        lambda.LayerVersion.fromLayerVersionArn(
          this,
          `${lambdaName}-utils`,
          lambdaLayerArn,
        ),
      ],
      environment: {
        LOG_LEVEL: 'INFO',
      },
      handler: lambdaHandler,
      ...lambdaProperties,
    });

    return new cr.Provider(this, lambdaName + 'CustomResource', {
      onEventHandler: lambdaFunction,
      logGroup: new LogGroup(
        this,
        `${applicationName}-${lambdaName}-CustomResourceLogs`,
        { retention: RetentionDays.ONE_MONTH },
      ),
      role: iam.Role.fromRoleArn(
        this,
        `${lambdaName}-CustomResourceRole`,
        CDK_EXEC_ROLE_ARN,
      ),
    });
  }

  private getManageMemberAccountBootstrapUtilsPolicy(
    lambdaName: string,
    dzDataMeshAssetsBucketArn: string,
  ) {
    return new iam.Policy(this, `${lambdaName}-Policy`, {
      statements: [
        new iam.PolicyStatement({
          actions: ['s3:GetObject', 's3:GetObjectVersion'],
          resources: [`${dzDataMeshAssetsBucketArn}/*`],
        }),
        new iam.PolicyStatement({
          actions: [
            'iam:CreateRole',
            'iam:DeleteRole',
            'iam:AttachRolePolicy',
            'iam:PutRolePolicy',
            'iam:DeleteRolePolicy',
            'iam:RemoveRoleFromInstanceProfile',
          ],
          resources: [`arn:aws:iam::${this.account}:role/*`],
          conditions: {
            StringEquals: {
              'aws:ResourceTag/ApplicationName': DZ_APPLICATION_NAME,
            },
          },
        }),
        new iam.PolicyStatement({
          actions: [
            'iam:GetRole',
            'iam:ListAttachedRolePolicies',
            'iam:GetRolePolicy',
            'iam:TagRole',
            'iam:UntagRole',
          ],
          resources: [`arn:aws:iam::${this.account}:role/*`],
        }),
        new iam.PolicyStatement({
          actions: [
            'cloudformation:CreateStack',
            'cloudformation:UpdateStack',
            'cloudformation:DeleteStack',
            'cloudformation:DescribeStacks',
            'cloudformation:DescribeStackEvents',
            'cloudformation:DescribeStackResources',
          ],
          resources: ['arn:aws:cloudformation:*:*:stack/*'],
          conditions: {
            StringEquals: {
              'aws:ResourceTag/ApplicationName': DZ_APPLICATION_NAME,
            },
          },
        }),
        new iam.PolicyStatement({
          actions: [
            'cloudformation:GetTemplate',
            'cloudformation:GetTemplateSummary',
            'cloudformation:SetStackPolicy',
            'cloudformation:ValidateTemplate',
            'cloudformation:CreateChangeSet',
          ],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          actions: [
            'cloudformation:CreateStack',
            'cloudformation:DeleteStack',
            'cloudformation:UpdateStack',
          ],
          resources: ['*'],
          conditions: {
            StringEquals: {
              'aws:ResourceTag/ApplicationName': DZ_APPLICATION_NAME,
            },
          },
        }),
        new iam.PolicyStatement({
          actions: [
            'cloudformation:ListStacks',
          ],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          actions: [
            'logs:CreateLogGroup',
            'logs:CreateLogStream',
            'logs:PutLogEvents',
          ],
          resources: ['*'],
        }),
      ],
    });
  }

  private manageMemberAccountBootstrapUtils(
    props: DzDataMeshHelperStackProps,
    dzDataMeshCfnAssetsUrlPrefix: string,
    dzDataMeshAssetsBucketArn: string,
    lambdaLayerArn: string,
  ) {
    const lambdaName = 'MemberAccountBootstrapUtilsFormManager';
    const lambdaHandler =
      'member_account_bootstrap_utils_manager.lambda_handler';
    const lambdaPolicy = this.getManageMemberAccountBootstrapUtilsPolicy(
      lambdaName,
      dzDataMeshAssetsBucketArn,
    );
    const lambdaRole = CommonUtils.getLambdaExecutionRole(
      this,
      lambdaName,
      lambdaPolicy,
    );
    const lambdaProperties = CommonUtils.getLambdaCoreProperties();

    const memberAccountBootstrapUtilsManager = new lambda.Function(
      this,
      lambdaName + 'Lambda',
      {
        code: lambda.Code.fromAsset(
          path.join(
            __dirname,
            '../src/lambda-functions/member_account_bootstrap_utils_manager',
          ),
        ),
        role: lambdaRole,
        layers: [
          lambda.LayerVersion.fromLayerVersionArn(
            this,
            `${lambdaName}-utils`,
            lambdaLayerArn,
          ),
        ],
        logGroup: new LogGroup(
          this,
          `${props.applicationName}-${lambdaName}-CustomResourceLogs`,
          { retention: RetentionDays.ONE_MONTH },
        ),
        environment: {
          CFN_ASSETS_URL_PREFIX: dzDataMeshCfnAssetsUrlPrefix,
          STACK_SET_ADMIN_ROLE_TEMPLATE_NAME:
            'DzDataMeshCfnStackSetAdminRole.yaml',
          GOV_STACK_NAME: 'DataZone-DataMesh-StackSet-Admin',
          LOG_LEVEL: 'INFO',
          TAG_APPLICATION_NAME: DZ_APPLICATION_NAME,
        },
        handler: lambdaHandler,
        ...lambdaProperties,
      },
    );

    const eventBridgeRule = new events.Rule(
      this,
      `${props.applicationName}-member-bootstrap-utils-rule`,
      {
        eventPattern: {
          source: ['aws.cloudformation'],
          detailType: ['CloudFormation Stack Status Change'],
          detail: {
            'status-details': {
              status: ['CREATE_COMPLETE', 'UPDATE_COMPLETE', 'DELETE_COMPLETE'],
            },
          },
        },
      },
    );

    const cfnRule = eventBridgeRule.node.defaultChild as events.CfnRule;
    cfnRule.addOverride('Properties.EventPattern.resources', [
      {
        wildcard: `arn:aws:cloudformation:${this.region}:${this.account}:stack/*MeshMemberStack/*`,
      },
    ]);

    const eventBridgeDeadLetterQueue = new sqs.Queue(
      this,
      `${props.applicationName}-${lambdaName}-event-queue-DLQ`,
      {
        visibilityTimeout: Duration.seconds(300),
        retentionPeriod: Duration.days(7),
        enforceSSL: true,
        encryption: sqs.QueueEncryption.SQS_MANAGED,
      },
    );

    eventBridgeRule.addTarget(
      new targets.LambdaFunction(memberAccountBootstrapUtilsManager, {
        deadLetterQueue: eventBridgeDeadLetterQueue,
        maxEventAge: Duration.hours(2),
        retryAttempts: 2,
      }),
    );

    return memberAccountBootstrapUtilsManager;
  }
}
