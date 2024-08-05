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
import * as kms from 'aws-cdk-lib/aws-kms';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as iam from 'aws-cdk-lib/aws-iam';
import {
  DashboardRenderingPreference,
  DefaultDashboardFactory,
  MonitoringFacade,
  MonitoringNamingStrategy,
  SnsAlarmActionStrategy,
} from 'cdk-monitoring-constructs';
import { Construct } from 'constructs';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { DZ_ADMINISTRATOR_EMAIL } from '../config/Config';

interface DzDataMeshMonitoringStackProps extends cdk.StackProps {
  applicationName: string;
  stageName: string;
  snsKMSKey: kms.Key;
}

export class DzDataMeshMonitoringStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    props: DzDataMeshMonitoringStackProps,
  ) {
    super(scope, id, props);

    const operationsEmailNotificationTopic =
      this.createOperationsEmailNotificationTopic(props);

    const monitoringDashboard = this.createMonitoringDashboard(
      scope,
      props,
      operationsEmailNotificationTopic,
    );

    new cdk.CfnOutput(this, 'MonitoringTopicArnCfnOutput', {
      value: operationsEmailNotificationTopic.topicArn,
      description: 'The ARN of the monitoring topic',
      exportName: `${props.applicationName}-monitoringTopicArn`,
    });
  }

  private createOperationsEmailNotificationTopic(
    props: DzDataMeshMonitoringStackProps,
  ) {
    const operationsMonitoringTopic = new sns.Topic(
      this,
      `${props.applicationName}-OperationsMonitoringTopic`,
      {
        displayName: `Monitoring topic for ${props.applicationName}`,
        masterKey: props.snsKMSKey,
        enforceSSL: true,
      },
    );

    const resourcePolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      principals: [new iam.AccountPrincipal(this.account)],
      actions: ['sns:Publish'],
      resources: [operationsMonitoringTopic.topicArn],
    });

    operationsMonitoringTopic.addToResourcePolicy(resourcePolicy);
    operationsMonitoringTopic.addSubscription(
      new subscriptions.EmailSubscription(DZ_ADMINISTRATOR_EMAIL),
    );

    return operationsMonitoringTopic;
  }

  private createMonitoringDashboard(
    scope: Construct,
    props: DzDataMeshMonitoringStackProps,
    operationsEmailNotificationTopic: sns.Topic,
  ) {
    new MonitoringNamingStrategy({
      humanReadableName: props.applicationName,
    });

    const monitoring = new MonitoringFacade(
      this,
      `${props.applicationName}-MonitoringFacade`,
      {
        alarmFactoryDefaults: {
          actionsEnabled: true,
          alarmNamePrefix: `${props.applicationName}-${props.stageName}`,
          action: new SnsAlarmActionStrategy({
            onAlarmTopic: operationsEmailNotificationTopic,
          }),
          datapointsToAlarm: 1,
        },
        metricFactoryDefaults: {
          namespace: `${props.applicationName}`,
        },
        dashboardFactory: new DefaultDashboardFactory(
          this,
          `${props.applicationName}-DashboardFactory`,
          {
            dashboardNamePrefix: `${props.applicationName}-${props.stageName}`,
            createDashboard: true,
            createSummaryDashboard: false,
            createAlarmDashboard: true,
            renderingPreference: DashboardRenderingPreference.INTERACTIVE_ONLY,
          },
        ),
      },
    );

    monitoring.monitorScope(scope, {
      s3: { enabled: true },
      sqs: { enabled: true },
      lambda: {
        enabled: true,
        props: {
          alarmFriendlyName: `${props.applicationName}`,
        },
      },
    });

    return monitoring;
  }
}
