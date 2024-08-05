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
import { Construct } from 'constructs';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as datazone from 'aws-cdk-lib/aws-datazone';

interface DataZoneProps extends cdk.StackProps {
  domainName: string;
  domainDescription: string;
  domainTag: string;
  projectName: string;
  stageName: string;
  projectDescription: string;
  applicationName: string;
  domainKMSKey: kms.Key;
}

export class DzDataMeshGovStack extends cdk.Stack {
  public readonly domainId: string;
  constructor(scope: Construct, id: string, props: DataZoneProps) {
    super(scope, id, props);

    const domain = new datazone.CfnDomain(this, props.domainName, {
      description: props.domainDescription,
      domainExecutionRole: `arn:aws:iam::${this.account}:role/service-role/AmazonDataZoneDomainExecution`,
      kmsKeyIdentifier: props.domainKMSKey.keyArn,
      name: props.domainName,
      tags: [
        {
          key: 'DomainName',
          value: props.domainTag,
        },
      ],
    });

    this.domainId = domain.getAtt('Id').toString();
    const createParameterStore = this.createParameterStore(
      props,
      this.domainId,
    );
  }

  private createParameterStore(props: DataZoneProps, domainId: string) {
    return new cdk.aws_ssm.StringParameter(this, 'DzDataMeshParameterStore', {
      parameterName: `/${props.applicationName.toLowerCase()}/${props.stageName.toLowerCase()}/${props.domainName.toLowerCase()}/domain-id`,
      description: 'Parameter store for the domain id',
      simpleName: false,
      tier: cdk.aws_ssm.ParameterTier.STANDARD,
      stringValue: domainId,
    });
  }
}
