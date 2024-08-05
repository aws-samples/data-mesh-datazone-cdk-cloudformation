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
import { NagSuppressions } from 'cdk-nag';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Duration } from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import * as S3Deployment from 'aws-cdk-lib/aws-s3-deployment';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { DZ_APPLICATION_NAME } from '../config/Config';
import { CommonUtils } from './utils/CommonUtils';
import { Construct } from 'constructs';

interface DzDataMeshMemberStackProps extends cdk.StackProps {
  domainId: string;
  stageName: string;
  applicationName: string;
  domainName: string;
  dzDataMeshCfnAssetsUrlPrefix: string;
  dzDataMeshNotificationQueue: sqs.Queue;
  dzDatameshAssetsUploader: S3Deployment.BucketDeployment;
  manageProjectMembershipCustomResource: Provider;
  lambdaLayerVersionArnParameterName: string;
}

export class DzDataMeshMemberStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DzDataMeshMemberStackProps) {
    super(scope, id, props);

    const coreResourcesMemberAccount =
      this.createCoreResourcesMemberAccount(props);
    coreResourcesMemberAccount.node.addDependency(
      props.dzDatameshAssetsUploader,
    );
    const bootstrapManager = this.manageMemberAccountBootstrap(props);

    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.node.path}/dz-data-mesh-DataSolutionMemberAccountBootstrapManager-event-queue-DLQ/Resource`,
      [
        {
          id: 'AwsSolutions-SQS3',
          reason:
            'The SQS queue is used as a dead-letter queue (DLQ) for the EventBridge rule',
        },
      ],
    );
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.node.path}/DataSolutionMemberAccountBootstrapManager-Policy/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Wildcard permissions are required for solution',
        },
      ],
    );
  }

  private createCoreResourcesMemberAccount(props: DzDataMeshMemberStackProps) {
    const content = readFileSync(
      path.join(__dirname, './cfn-templates/DzDataMeshMemberStackSet.yaml'),
      'utf8',
    );
    const sha256EncodedContent = createHash('sha256')
      .update(content)
      .digest('hex');

    return new cdk.CfnStack(this, 'DzDataMeshMemberStackSet', {
      tags: [
        {
          key: 'SHA-256 Encoding',
          value: sha256EncodedContent,
        },
      ],
      templateUrl: `${props.dzDataMeshCfnAssetsUrlPrefix}/DzDataMeshMemberStackSet.yaml`,
    });
  }

  private getManageMemberAccountBootstrapPolicy(
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
            'ram:ListResources',
            'ram:ListResources',
            'ram:GetResourceShares',
            'ram:GetResourceShareAssociations',
            'ram:GetResourceShareInvitations',
          ],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          actions: ['sqs:SetQueueAttributes'],
          resources: [`arn:aws:sqs:${this.region}:${this.account}:*`],
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
            'ssm:GetParameter',
            'ssm:GetParameters',
            'ssm:GetParametersByPath',
            'ssm:PutParameter',
          ],
          resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/*`],
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
            'cloudformation:ListStacks',
            'cloudformation:CreateChangeSet',
          ],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          actions: [
            'cloudformation:CreateStackSet',
            'cloudformation:DeleteStackSet',
            'cloudformation:UpdateStackSet',
            'cloudformation:ListStackSetOperationResults',
            'cloudformation:ListStackSetOperations',
            'cloudformation:StopStackSetOperation',
            'cloudformation:DescribeStackSetOperation',
          ],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          actions: [
            'cloudformation:CreateStackInstances',
            'cloudformation:DeleteStackInstances',
            'cloudformation:UpdateStackInstances',
            'cloudformation:ListStackInstances',
          ],
          resources: ['arn:aws:cloudformation:*:*:stackset/*:*'],
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

  private manageMemberAccountBootstrap(props: DzDataMeshMemberStackProps) {
    const lambdaName = 'DataSolutionMemberAccountBootstrapManager';
    const lambdaHandler = 'member_account_bootstrap_manager.lambda_handler';
    const dzDataMeshAssetsBucketArn =
      props.dzDatameshAssetsUploader.deployedBucket.bucketArn;
    const lambdaPolicy = this.getManageMemberAccountBootstrapPolicy(
      lambdaName,
      dzDataMeshAssetsBucketArn,
    );
    const lambdaRole = CommonUtils.getLambdaExecutionRole(
      this,
      lambdaName,
      lambdaPolicy,
    );
    const lambdaProperties = CommonUtils.getLambdaCoreProperties();

    const utilsLambdaLayerArn: string =
      ssm.StringParameter.fromStringParameterAttributes(
        this,
        props.lambdaLayerVersionArnParameterName,
        {
          parameterName: props.lambdaLayerVersionArnParameterName,
          simpleName: false,
          forceDynamicReference: true,
          valueType: ssm.ParameterValueType.STRING,
        },
      ).stringValue.toString();

    const lambdaFunction = new lambda.Function(this, lambdaName + 'Lambda', {
      code: lambda.Code.fromAsset(
        path.join(
          __dirname,
          '../src/lambda-functions/member_account_bootstrap_manager',
        ),
      ),
      role: lambdaRole,
      layers: [
        lambda.LayerVersion.fromLayerVersionArn(
          this,
          `${lambdaName}-utils`,
          utilsLambdaLayerArn,
        ),
      ],
      logGroup: new LogGroup(
        this,
        `${props.applicationName}-${lambdaName}-Logs`,
        { retention: RetentionDays.ONE_MONTH },
      ),
      environment: {
        DOMAIN_NAME: props.domainName,
        DOMAIN_ID_PARAMETER_NAME: `/${props.applicationName.toLowerCase()}/${props.stageName.toLowerCase()}/${props.domainName.toLowerCase()}/domain-id`,
        CFN_ASSETS_URL_PREFIX: props.dzDataMeshCfnAssetsUrlPrefix,
        STACK_SET_ADMIN_ROLE_TEMPLATE_NAME:
          'DzDataMeshCfnStackSetAdminRole.yaml',
        MEMBER_STACK_SET_NAME: 'StackSet-DataZone-DataMesh-Member',
        GOV_STACK_NAME: 'DataZone-DataMesh-StackSet-Admin',
        NOTIFICATION_QUEUE_URL: props.dzDataMeshNotificationQueue.queueUrl,
        LOG_LEVEL: 'INFO',
      },
      handler: lambdaHandler,
      ...lambdaProperties,
    });

    const eventBridgeRule = new events.Rule(
      this,
      `${props.applicationName}-member-bootstrap-rule`,
      {
        eventPattern: {
          source: ['aws.ram'],
          detailType: ['AWS API Call via CloudTrail'],
          detail: {
            eventSource: ['ram.amazonaws.com'],
            eventName: ['AssociateResourceShare', 'CreateResourceShare'],
            awsRegion: [this.region],
          },
        },
      },
    );

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
      new targets.LambdaFunction(lambdaFunction, {
        deadLetterQueue: eventBridgeDeadLetterQueue,
        maxEventAge: Duration.hours(2),
        retryAttempts: 2,
      }),
    );

    return lambdaFunction;
  }
}
