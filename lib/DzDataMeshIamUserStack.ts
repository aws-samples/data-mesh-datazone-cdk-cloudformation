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
import { DZ_IAM_USER_ID_LIST } from '../config/Config';
import { ArnPrincipal, Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';

interface DzDataMeshIamUserStackProps extends cdk.StackProps {
  applicationName: string;
}

export class DzDataMeshIamUserStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    props: DzDataMeshIamUserStackProps,
  ) {
    super(scope, id, props);

    DZ_IAM_USER_ID_LIST.forEach((userId: string) => {
      const iamUserRole = this.createIamUserRole(userId);
    });
    NagSuppressions.addResourceSuppressions(
      this,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'Suppress AwsSolutions-IAM5 on the IAM role for DataZone access.',
          appliesTo: [
            {
              regex: '(.*)DATA_SOLUTION_USER_[A-Za-z0-9]+/Resource/g',
            },
          ],
        },
      ],
      true,
    );
  }

  private createIamUserRole(userId: string) {
    const userRolePolicy = new iam.PolicyDocument({
      statements: [
        new PolicyStatement({
          sid: 'DataZonePortalAccess',
          actions: ['datazone:ListDomains', 'datazone:GetIamPortalLoginUrl'],
          effect: Effect.ALLOW,
          resources: ['*'],
        }),
      ],
    });

    return new iam.Role(this, `DATA_SOLUTION_USER_${userId.toUpperCase()}`, {
      roleName: `DATA_SOLUTION_USER_${userId}`,
      assumedBy: new ArnPrincipal(
        `arn:aws:sts::${this.account}:assumed-role/CORP_SSO_ROLE/${userId.toUpperCase()}`,
      ),
      inlinePolicies: { userRolePolicy },
    });
  }
}
