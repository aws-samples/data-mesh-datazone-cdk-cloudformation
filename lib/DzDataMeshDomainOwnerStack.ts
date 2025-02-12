import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import * as path from 'path';
import { Stack } from 'aws-cdk-lib';
import { aws_logs as logs } from 'aws-cdk-lib';

interface DataZoneProps extends cdk.StackProps {
  applicationName: string;
  domainId: string;
  CDKExecRoleARN : string;
  dzDomainUnitownerGroup: string;
  stageName: string;
}
export class DzDataMeshDomainOwnerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DataZoneProps) {
    super(scope, id, props);

    const domainId = props.domainId;
    const region = Stack.of(this).region;
    const account = Stack.of(this).account;
    const cfnRoleArn = props.CDKExecRoleARN;
    const dzDomainUnitownerGroup = props.CDKExecRoleARN;

  // Create Lambda execution role
   const lambdaRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });
    
   // Add permission to assume CFN execution role
   lambdaRole.addToPolicy(new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: ['sts:AssumeRole'],
    resources: [cfnRoleArn],
  }));

  // Create Lambda function
  const setOwnerFunction = new lambda.Function(this, 'SetDomainOwnerFunction', {
    runtime: lambda.Runtime.PYTHON_3_9,
    handler: 'index.lambda_handler',
    code: lambda.Code.fromAsset(path.join(__dirname, '../src/lambda-functions/set-domain-owner'), {
      bundling: {
        image: lambda.Runtime.PYTHON_3_9.bundlingImage,
        command: [
          'bash', '-c',
          'pip install -r requirements.txt -t /asset-output && cp -au . /asset-output'
        ],
      },
    }),
    role: lambdaRole,
    timeout: cdk.Duration.minutes(5),
    environment: {
      REGION: region,
      ACCOUNT_ID: account
    }
  });

  // Create Custom Resource Provider
  const provider = new cr.Provider(this, 'CustomResourceProvider', {
    onEventHandler: setOwnerFunction,
    logRetention: logs.RetentionDays.ONE_WEEK
  });

  // Create Custom Resource
  const customResource = new cdk.CustomResource(this, 'TriggerLambda', {
    serviceToken: provider.serviceToken,
    properties: {
      domain_identifier: domainId,
      group_identifier: dzDomainUnitownerGroup,
      cfn_role_arn: cfnRoleArn
    }
  });

  // Outputs
  new cdk.CfnOutput(this, 'SetOwnerFunctionArn', {
    value: setOwnerFunction.functionArn,
    description: 'Set Owner Lambda Function ARN',
    exportName: `${props.stageName}-set-owner-function-arn`,
  });

  new cdk.CfnOutput(this, 'DomainId', {
    value: domainId,
    description: 'DataZone Domain ID',
    exportName: `${props.stageName}-datazone-domain-id`,
  });
}
}