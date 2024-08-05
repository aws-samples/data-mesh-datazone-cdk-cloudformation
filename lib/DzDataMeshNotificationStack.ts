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
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import {
  DZ_ADMINISTRATOR_EMAIL,
  DZ_MEMBER_ACCOUNT_CONFIG,
  DZ_MEMBER_STACK_SET_EXEC_ROLE_LIST,
} from '../config/Config';
import { Duration } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as AppConfig from '../config/Config';
import { CommonUtils } from './utils/CommonUtils';
import { ArnPrincipal, Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';

interface DzDataMeshNotificationStackProps extends cdk.StackProps {
  stageName: string;
  applicationName: string;
  domainName: string;
  snsKMSKey: kms.Key;
  lambdaLayerVersionArnParameterName: string;
}

export class DzDataMeshNotificationStack extends cdk.Stack {
  public readonly dzDataMeshNotificationQueue: sqs.Queue;
  constructor(
    scope: Construct,
    id: string,
    props: DzDataMeshNotificationStackProps,
  ) {
    super(scope, id, props);

    this.dzDataMeshNotificationQueue =
      this.createDzDataMeshNotificationQueue(props);
    const dataSolutionNotificationManager =
      this.manageDataSolutionNotification(props);
    const dataSolutionAdministratorTopic =
      this.createAdministratorEmailNotificationTopic(props);

    const memberAccountIdList = Object.keys(DZ_MEMBER_ACCOUNT_CONFIG).map(
      String,
    );
    memberAccountIdList.forEach((memberAccountId: string) => {
      const memberEmailNotificationTopic =
        this.createMemberEmailNotificationTopic(props, memberAccountId);
    });

    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.node.path}/DataSolutionMemberAccountNotificationManager-Policy/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Wildcard permissions are required for solution',
        },
      ],
    );
  }

  private createDzDataMeshNotificationQueue(
    props: DzDataMeshNotificationStackProps,
  ) {
    const deadLetterQueue = new sqs.Queue(
      this,
      `${props.applicationName}-DzDataMeshNotificationQueue-DLQ`,
      {
        visibilityTimeout: Duration.seconds(700),
        retentionPeriod: Duration.days(7),
        enforceSSL: true,
        encryption: sqs.QueueEncryption.SQS_MANAGED,
      },
    );

    const notificationQueue = new sqs.Queue(
      this,
      'DzDataMeshNotificationQueue',
      {
        visibilityTimeout: Duration.seconds(700),
        retentionPeriod: Duration.days(7),
        encryption: sqs.QueueEncryption.SQS_MANAGED,
        enforceSSL: true,
        deadLetterQueue: {
          maxReceiveCount: 5,
          queue: deadLetterQueue,
        },
      },
    );

    if (DZ_MEMBER_STACK_SET_EXEC_ROLE_LIST.length > 0) {
      const arnPrincipalList = DZ_MEMBER_STACK_SET_EXEC_ROLE_LIST.map(
        (roleArn) => new ArnPrincipal(roleArn),
      );

      notificationQueue.addToResourcePolicy(
        new PolicyStatement({
          sid: 'Allow members to send messages',
          actions: ['sqs:SendMessage'],
          effect: Effect.ALLOW,
          principals: arnPrincipalList,
          resources: ['*'],
        }),
      );
    }

    return notificationQueue;
  }

  private getManageDataSolutionNotificationPolicy(
    props: DzDataMeshNotificationStackProps,
    lambdaName: string,
  ) {
    return new iam.Policy(this, `${lambdaName}-Policy`, {
      statements: [
        new iam.PolicyStatement({
          actions: ['kms:Decrypt', 'kms:GenerateDataKey'],
          resources: [props.snsKMSKey.keyArn],
        }),
        new iam.PolicyStatement({
          actions: ['sqs:DeleteMessage'],
          resources: [this.dzDataMeshNotificationQueue.queueArn],
        }),
        new iam.PolicyStatement({
          actions: ['sns:Publish'],
          resources: [`arn:aws:sns:${this.region}:${this.account}:*`],
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
          actions: ['datazone:GetProject', 'datazone:GetAsset'],
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

  private manageDataSolutionNotification(
    props: DzDataMeshNotificationStackProps,
  ) {
    const lambdaName = 'DataSolutionMemberAccountNotificationManager';
    const lambdaHandler = 'data_solution_notification_manager.lambda_handler';
    const lambdaProperties = CommonUtils.getLambdaCoreProperties();
    const lambdaPolicy = this.getManageDataSolutionNotificationPolicy(
      props,
      lambdaName,
    );
    const lambdaRole = CommonUtils.getLambdaExecutionRole(
      this,
      lambdaName,
      lambdaPolicy,
    );

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
          '../src/lambda-functions/data_solution_notification_manager',
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
        LOG_LEVEL: 'INFO',
        NOTIFICATION_QUEUE_URL: this.dzDataMeshNotificationQueue.queueUrl,
        PARAMETER_STORE_NAME_PREFIX: `${props.applicationName.toLowerCase()}/${props.stageName.toLowerCase()}/${props.domainName.toLowerCase()}`,
        DOMAIN_ID_PARAMETER_NAME: `/${props.applicationName.toLowerCase()}/${props.stageName.toLowerCase()}/${props.domainName.toLowerCase()}/domain-id`,
        CURRENT_REGION: this.region,
      },
      handler: lambdaHandler,
      ...lambdaProperties,
    });

    const eventSource = new lambdaEventSources.SqsEventSource(
      this.dzDataMeshNotificationQueue,
    );
    lambdaFunction.addEventSource(eventSource);

    return lambdaFunction;
  }

  private createAdministratorEmailNotificationTopic(
    props: DzDataMeshNotificationStackProps,
  ) {
    const emailNotificationTopic = new sns.Topic(
      this,
      `${props.applicationName}-AdministratorEmailNotificationTopic`,
      {
        displayName: `Administrator email notification topic for ${props.applicationName}`,
        enforceSSL: true,
        masterKey: props.snsKMSKey,
      },
    );

    emailNotificationTopic.addSubscription(
      new subscriptions.EmailSubscription(DZ_ADMINISTRATOR_EMAIL),
    );

    const dzDataMeshSNSParameter = new cdk.aws_ssm.StringParameter(
      this,
      'DzDataMeshSNSParameter',
      {
        parameterName: `/${props.applicationName.toLowerCase()}/${props.stageName.toLowerCase()}/${props.domainName.toLowerCase()}/sns-arn`,
        description: 'Parameter store for the ARN of the sns topic',
        simpleName: false,
        tier: cdk.aws_ssm.ParameterTier.STANDARD,
        stringValue: emailNotificationTopic.topicArn,
      },
    );

    return emailNotificationTopic;
  }

  private createMemberEmailNotificationTopic(
    props: DzDataMeshNotificationStackProps,
    memberAccountId: string,
  ) {
    const memberAccountConfig =
      AppConfig.DZ_MEMBER_ACCOUNT_CONFIG[memberAccountId];
    const projectName = memberAccountConfig.PROJECT_NAME;
    const projectEmail = memberAccountConfig.PROJECT_EMAIL;

    const emailNotificationTopic = new sns.Topic(
      this,
      `${props.applicationName}-${projectName}-EmailNotificationTopic`,
      {
        displayName: `Member email notification topic for ${props.applicationName} in project ${projectName}`,
        enforceSSL: true,
      },
    );

    emailNotificationTopic.addSubscription(
      new subscriptions.EmailSubscription(projectEmail),
    );

    const dzDataMeshSNSParameter = new cdk.aws_ssm.StringParameter(
      this,
      `DzDataMeshSNSParameter-${projectName}`,
      {
        parameterName: `/${props.applicationName.toLowerCase()}/${props.stageName.toLowerCase()}/${props.domainName.toLowerCase()}/member/project/${projectName.toLowerCase()}/${this.region}/sns-arn`,
        description: 'Parameter store for the ARN of the SNS topic',
        simpleName: false,
        tier: cdk.aws_ssm.ParameterTier.STANDARD,
        stringValue: emailNotificationTopic.topicArn,
      },
    );

    return emailNotificationTopic;
  }
}
