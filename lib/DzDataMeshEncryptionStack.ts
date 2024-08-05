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
import {
  AnyPrincipal,
  ArnPrincipal,
  Effect,
  PolicyStatement,
  ServicePrincipal,
} from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';
import {
  DZ_ADMIN_ROLE_ARN,
  DZ_MEMBER_STACK_SET_EXEC_ROLE_LIST,
} from '../config/Config';

interface EncryptionStackProps extends cdk.StackProps {
  applicationName: string;
}

export class DzDataMeshEncryptionStack extends cdk.Stack {
  public readonly encryptionKey: kms.Key;
  public readonly snsEncryptionKey: kms.Key;
  constructor(scope: Construct, id: string, props: EncryptionStackProps) {
    super(scope, id, props);

    this.encryptionKey = this.createDataMeshEncryptionKey(props);
    this.snsEncryptionKey = this.createSNSEncryptionKey(props);
  }

  private createDataMeshEncryptionKey(props: EncryptionStackProps) {
    const dMeshEncryptionKey = new kms.Key(
      this,
      `${props.applicationName}DataMeshEncryptionKey`,
      {
        enableKeyRotation: true,
      },
    );

    const encryptionKeyAdminRoleArn = DZ_ADMIN_ROLE_ARN;

    const aliasName = `${props.applicationName}-DataZone-key`;
    dMeshEncryptionKey.addAlias(aliasName);
    dMeshEncryptionKey.grantAdmin(new ArnPrincipal(encryptionKeyAdminRoleArn));
    dMeshEncryptionKey.addToResourcePolicy(
      new PolicyStatement({
        sid: 'Allow access to principals authorized to manage Amazon DataZone',
        actions: [
          'kms:Decrypt',
          'kms:GenerateDataKey*',
          'kms:DescribeKey',
          'kms:CreateGrant',
        ],
        effect: Effect.ALLOW,
        principals: [new AnyPrincipal()],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'kms:CallerAccount': this.account,
          },
        },
      }),
    );

    if (DZ_MEMBER_STACK_SET_EXEC_ROLE_LIST.length > 0) {
      const arnPrincipalList = DZ_MEMBER_STACK_SET_EXEC_ROLE_LIST.map(
        (roleArn) => new ArnPrincipal(roleArn),
      );
      dMeshEncryptionKey.addToResourcePolicy(
        new PolicyStatement({
          sid: 'Allow members to decrypt amazon datazone metadata',
          actions: ['kms:Decrypt', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
          effect: Effect.ALLOW,
          principals: arnPrincipalList,
          resources: ['*'],
        }),
      );
    }

    return dMeshEncryptionKey;
  }

  private createSNSEncryptionKey(props: EncryptionStackProps) {
    const snsEncryptionKey = new kms.Key(
      this,
      `${props.applicationName}SNSEncryptionKey`,
      {
        enableKeyRotation: true,
      },
    );

    const encryptionKeyAdminRoleArn = DZ_ADMIN_ROLE_ARN;

    const aliasName = `${props.applicationName}-SNS-key`;
    snsEncryptionKey.addAlias(aliasName);
    snsEncryptionKey.grantAdmin(new ArnPrincipal(encryptionKeyAdminRoleArn));
    snsEncryptionKey.addToResourcePolicy(
      new PolicyStatement({
        sid: 'Allow sns to use the key',
        actions: [
          'kms:Decrypt',
          'kms:Encrypt',
          'kms:GenerateDataKey*',
          'kms:ReEncrypt*',
        ],
        effect: Effect.ALLOW,
        principals: [new ServicePrincipal('sns.amazonaws.com')],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'kms:CallerAccount': this.account,
          },
        },
      }),
    );
    snsEncryptionKey.addToResourcePolicy(
      new PolicyStatement({
        sid: 'Allow access to principals authorized to manage SNS',
        actions: [
          'kms:Decrypt',
          'kms:GenerateDataKey*',
          'kms:DescribeKey',
          'kms:CreateGrant',
        ],
        effect: Effect.ALLOW,
        principals: [new ArnPrincipal(`arn:aws:iam::${this.account}:root`)],
        resources: ['*'],
      }),
    );

    return snsEncryptionKey;
  }
}
