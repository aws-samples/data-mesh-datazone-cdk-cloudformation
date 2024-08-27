#!/usr/bin/env node
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
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';

import {
  DZ_ADMIN_PROJECT_DESCRIPTION,
  DZ_ADMIN_PROJECT_NAME,
  DZ_APPLICATION_NAME,
  DZ_DOMAIN_DESCRIPTION,
  DZ_DOMAIN_NAME,
  DZ_DOMAIN_TAG,
  DZ_STAGE_NAME,
} from '../config/Config';
import { DzDataMeshGovStack } from '../lib/DzDataMeshGovStack';
import { DzDataMeshHelperStack } from '../lib/DzDataMeshHelperStack';
import { DzDataMeshIamUserStack } from '../lib/DzDataMeshIamUserStack';
import { DzDataMeshMemberStack } from '../lib/DzDataMeshMemberStack';
import { DzDataMeshNotificationStack } from '../lib/DzDataMeshNotificationStack';
import { DzDataMeshGovInfraStack } from '../lib/DzDataMeshGovInfraStack';
import { DzDataMeshEncryptionStack } from '../lib/DzDataMeshEncryptionStack';
import { DzDataMeshMonitoringStack } from '../lib/DzDataMeshMonitoringStack';
import { Aspects, Tags } from 'aws-cdk-lib';
import { DzDataMeshMemberEnvStack } from '../lib/DzDataMeshMemberEnvStack';

const app = new cdk.App();
Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

Tags.of(app).add('ApplicationName', DZ_APPLICATION_NAME);
Tags.of(app).add('ApplicationId', 'acmecorp-app-1234');
Tags.of(app).add('PersonalData', 'false');

const dzDataMeshHelperStack = new DzDataMeshHelperStack(
  app,
  'DzDataMeshHelperStack',
  {
    applicationName: DZ_APPLICATION_NAME,
    stageName: DZ_STAGE_NAME,
    description: 'DataZone based Data Mesh Helper stack',
  },
);

const dzDataMeshEncryptionStack = new DzDataMeshEncryptionStack(
  app,
  'DzDataMeshEncryptionStack',
  {
    applicationName: DZ_APPLICATION_NAME,
    description: 'DataZone based Data Mesh Encryption stack',
  },
);

const dzDataMeshNotificationStack = new DzDataMeshNotificationStack(
  app,
  'DzDataMeshNotificationStack',
  {
    stageName: DZ_STAGE_NAME,
    domainName: DZ_DOMAIN_NAME,
    applicationName: DZ_APPLICATION_NAME,
    snsKMSKey: dzDataMeshEncryptionStack.snsEncryptionKey,
    lambdaLayerVersionArnParameterName:
      dzDataMeshHelperStack.lambdaLayerVersionArnParameterName,
    description: 'DataZone based Data Mesh Notification stack',
  },
);

const dzDataMeshGovStack = new DzDataMeshGovStack(app, 'DzDataMeshGovStack', {
  applicationName: DZ_APPLICATION_NAME,
  domainDescription: DZ_DOMAIN_DESCRIPTION,
  domainName: DZ_DOMAIN_NAME,
  domainTag: DZ_DOMAIN_TAG,
  projectName: DZ_ADMIN_PROJECT_NAME,
  stageName: DZ_STAGE_NAME,
  projectDescription: DZ_ADMIN_PROJECT_DESCRIPTION,
  domainKMSKey: dzDataMeshEncryptionStack.encryptionKey,
  description: 'DataZone based Data Mesh Governance stack',
});

const dzDataMeshGovInfraStack = new DzDataMeshGovInfraStack(
  app,
  'DzDataMeshGovInfraStack',
  {
    applicationName: DZ_APPLICATION_NAME,
    domainDescription: DZ_DOMAIN_DESCRIPTION,
    domainName: DZ_DOMAIN_NAME,
    domainId: dzDataMeshGovStack.domainId,
    domainTag: DZ_DOMAIN_TAG,
    projectName: DZ_ADMIN_PROJECT_NAME,
    stageName: DZ_STAGE_NAME,
    projectDescription: DZ_ADMIN_PROJECT_DESCRIPTION,
    domainKMSKey: dzDataMeshHelperStack.encryptionKey,
    rootDomainDzProvisioningRoleArn:
      dzDataMeshHelperStack.rootDomainDzProvisioningRoleArn,
    rootDomainBlueprintBucketName:
      dzDataMeshHelperStack.rootDomainBlueprintBucketName,
    manageProjectMembershipCustomResource:
      dzDataMeshHelperStack.manageProjectMembershipCustomResource,
    manageGlossaryCustomResource:
      dzDataMeshHelperStack.manageGlossaryCustomResource,
    manageMetadataFormCustomResource:
      dzDataMeshHelperStack.manageMetadataFormCustomResource,
    description: 'DataZone based Data Mesh Governance Infrastructure stack',
  },
);
dzDataMeshGovInfraStack.addDependency(dzDataMeshGovStack);

const dzDataMeshIamUserStack = new DzDataMeshIamUserStack(
  app,
  'DzDataMeshIamUserStack',
  {
    applicationName: DZ_APPLICATION_NAME,
    description: 'DataZone based Data Mesh IAM User stack',
  },
);
dzDataMeshIamUserStack.addDependency(dzDataMeshGovStack);

const dzDataMeshMemberStack = new DzDataMeshMemberStack(
  app,
  'DzDataMeshMemberStack',
  {
    stageName: DZ_STAGE_NAME,
    applicationName: DZ_APPLICATION_NAME,
    domainName: DZ_DOMAIN_NAME,
    dzDataMeshCfnAssetsUrlPrefix:
      dzDataMeshHelperStack.dzDataMeshCfnAssetsUrlPrefix,
    dzDataMeshNotificationQueue:
      dzDataMeshNotificationStack.dzDataMeshNotificationQueue,
    dzDatameshAssetsUploader: dzDataMeshHelperStack.dzDatameshAssetsUploader,
    domainId: dzDataMeshGovStack.domainId,
    manageProjectMembershipCustomResource:
      dzDataMeshHelperStack.manageProjectMembershipCustomResource,
    lambdaLayerVersionArnParameterName:
      dzDataMeshHelperStack.lambdaLayerVersionArnParameterName,
    description: 'DataZone based Data Mesh Member stack',
  },
);
dzDataMeshMemberStack.addDependency(dzDataMeshGovStack);

const dzDataMeshMemberEnvStack = new DzDataMeshMemberEnvStack(
  app,
  'DzDataMeshMemberEnvStack',
  {
    stageName: DZ_STAGE_NAME,
    applicationName: DZ_APPLICATION_NAME,
    domainName: DZ_DOMAIN_NAME,
    domainId: dzDataMeshGovStack.domainId,
    manageProjectMembershipCustomResource:
      dzDataMeshHelperStack.manageProjectMembershipCustomResource,
    description: 'DataZone based Data Mesh Member Environment stack',
  },
);
dzDataMeshMemberEnvStack.addDependency(dzDataMeshMemberStack);

const dzDataMeshMonitoringStack = new DzDataMeshMonitoringStack(
  app,
  'DzDataMeshMonitoringStack',
  {
    stageName: DZ_STAGE_NAME,
    applicationName: DZ_APPLICATION_NAME,
    snsKMSKey: dzDataMeshEncryptionStack.snsEncryptionKey,
    description: 'DataZone based Data Mesh Monitoring stack',
  },
);
