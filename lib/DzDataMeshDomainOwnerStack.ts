import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { aws_logs as logs } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { CommonUtils } from './utils/CommonUtils';
import {NagSuppressions} from "cdk-nag";

interface DataZoneProps extends cdk.StackProps {
  applicationName: string;
  domainId: string;
  lambdaLayerVersionArnParameterName: string;
  CDKExecRoleARN : string;
  dzDomainUnitOwnerGroup: string;
  stageName: string;
}
export class DzDataMeshDomainOwnerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DataZoneProps) {
    super(scope, id, props);

    const domainId = props.domainId;
    const cfnRoleArn = props.CDKExecRoleARN;
    const dzDomainUnitOwnerGroup = props.CDKExecRoleARN;

    const lambdaName = 'SetDomainOwner';
    const lambdaHandler = 'set_domain_owner.lambda_handler';
    const lambdaProperties = CommonUtils.getLambdaCoreProperties();

    const lambdaPolicy = new iam.Policy(this, `${lambdaName}-Policy`, {
      statements: [
        new iam.PolicyStatement({
          actions: ['datazone:GetDomain', 'datazone:AddEntityOwner'],
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

    const lambdaRole = CommonUtils.getLambdaExecutionRole(
        this,
        lambdaName,
        lambdaPolicy,
    );

    // Add permission to assume CFN execution role
    lambdaRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['sts:AssumeRole'],
      resources: [cfnRoleArn],
    }));


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


    const setOwnerFunction = new lambda.Function(this, lambdaName, {
      code: lambda.Code.fromAsset(
        path.join(
          __dirname,
          '../src/lambda-functions/set_domain_owner',
        ),
      ),
      role: lambdaRole,
      environment: {
        LOG_LEVEL: 'INFO',
      },
      layers: [
        lambda.LayerVersion.fromLayerVersionArn(
          this,
          `${lambdaName}-utils`,
          utilsLambdaLayerArn,
        ),
      ],
      handler: lambdaHandler,
      ...lambdaProperties,
    });

    // Create Custom Resource Provider
    const provider = new cr.Provider(this, lambdaName + 'CustomResourceProvider', {
      onEventHandler: setOwnerFunction,
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    const customResource = new cdk.CustomResource(this, lambdaName + 'CustomResource', {
      serviceToken: provider.serviceToken,
      properties: {
        domain_identifier: domainId,
        group_identifier: dzDomainUnitOwnerGroup,
        cfn_role_arn: cfnRoleArn,
      },
    });


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

    NagSuppressions.addResourceSuppressionsByPath(
        this,
        `${this.node.path}/SetDomainOwner-Policy/Resource`,
        [
          {
            id: 'AwsSolutions-IAM5',
            reason: 'Wildcard permissions are required for solution',
          },
        ],
    );
    NagSuppressions.addResourceSuppressionsByPath(
        this,
        `${this.node.path}/SetDomainOwnerCustomResourceProvider/framework-onEvent/ServiceRole/Resource`,
        [
          {
            id: 'AwsSolutions-IAM5',
            reason: 'Wildcard permissions are required for solution',
          },
          {
            id: 'AwsSolutions-IAM4',
            reason: 'Does not use managed policy',
          },
        ],
    );
    NagSuppressions.addResourceSuppressionsByPath(
        this,
        `${this.node.path}/SetDomainOwnerCustomResourceProvider/framework-onEvent/ServiceRole/DefaultPolicy/Resource`,
        [
          {
            id: 'AwsSolutions-IAM5',
            reason: 'Wildcard permissions are required for solution',
          },
        ],
    );
    NagSuppressions.addResourceSuppressionsByPath(
        this,
        `${this.node.path}/SetDomainOwnerCustomResourceProvider/framework-onEvent/ServiceRole/DefaultPolicy/Resource`,
        [
          {
            id: 'AwsSolutions-IAM5',
            reason: 'Wildcard permissions are required for solution',
          },
        ],
    );
    NagSuppressions.addResourceSuppressionsByPath(
        this,
        `${this.node.path}/LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8a/ServiceRole/Resource`,
        [
          {
            id: 'AwsSolutions-IAM4',
            reason: 'Wildcard permissions are required for solution',
          },
        ],
    );
    NagSuppressions.addResourceSuppressionsByPath(
        this,
        `${this.node.path}/LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8a/ServiceRole/DefaultPolicy/Resource`,
        [
          {
            id: 'AwsSolutions-IAM5',
            reason: 'Wildcard permissions are required for solution',
          },
        ],
    );
  }
}