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
import { CustomResource } from 'aws-cdk-lib';
import * as datazone from 'aws-cdk-lib/aws-datazone';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { DZ_MEMBER_ACCOUNT_CONFIG } from '../config/Config';
import * as AppConfig from '../config/Config';

interface DzDataMeshMemberEnvStackProps extends cdk.StackProps {
  domainId: string;
  stageName: string;
  applicationName: string;
  domainName: string;
  manageProjectMembershipCustomResource: Provider;
}

export class DzDataMeshMemberEnvStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    props: DzDataMeshMemberEnvStackProps,
  ) {
    super(scope, id, props);

    const memberAccountIdList = Object.keys(DZ_MEMBER_ACCOUNT_CONFIG).map(
      String,
    );
    memberAccountIdList.forEach((memberAccountId: string) => {
      const memberProject = this.createMemberProject(props, memberAccountId);
      const memberProjectId = memberProject.getAtt('Id').toString();
      const memberProjectEnvironment = this.createMemberEnvironment(
        props,
        memberAccountId,
        memberProjectId,
      );
    });
  }

  private createMemberProject(
    props: DzDataMeshMemberEnvStackProps,
    memberAccountId: string,
  ) {
    const memberAccountConfig =
      AppConfig.DZ_MEMBER_ACCOUNT_CONFIG[memberAccountId];
    const projectName = memberAccountConfig.PROJECT_NAME;
    const projectDescription = memberAccountConfig.PROJECT_DESCRIPTION;

    const memberProject = new datazone.CfnProject(this, projectName, {
      description: projectDescription,
      domainIdentifier: props.domainId,
      name: projectName,
    });

    const memberProjectMembershipCustomResource =
      props.manageProjectMembershipCustomResource;

    const memberProjectMembership = new CustomResource(
      this,
      `${projectName}-AdminProjectMembership`,
      {
        serviceToken: memberProjectMembershipCustomResource.serviceToken,
        properties: {
          DomainId: props.domainId,
          ProjectId: memberProject.getAtt('Id').toString(),
          ProjectName: projectName,
          Designation: 'PROJECT_OWNER',
          UserIdentifier: AppConfig.DZ_ADMIN_ROLE_ARN,
        },
      },
    );

    memberProjectMembership.node.addDependency(memberProject);

    return memberProject;
  }

  private createMemberEnvironment(
    props: DzDataMeshMemberEnvStackProps,
    memberAccountId: string,
    memberProjectId: string,
  ) {
    const memberAccountConfig =
      AppConfig.DZ_MEMBER_ACCOUNT_CONFIG[memberAccountId];
    const projectName = memberAccountConfig.PROJECT_NAME;
    const blueprintIdParameterName = `/${props.applicationName.toLowerCase()}/${props.stageName.toLowerCase()}/${props.domainName.toLowerCase()}/member/${memberAccountId}/${this.region}/blueprintId`;

    const datalakeBlueprintId: string =
      ssm.StringParameter.fromStringParameterAttributes(
        this,
        `${props.applicationName.toLowerCase()}-${props.stageName.toLowerCase()}-${props.domainName.toLowerCase()}-member-${memberAccountId}-blueprintId`,
        {
          parameterName: blueprintIdParameterName,
          simpleName: false,
          forceDynamicReference: true,
          valueType: ssm.ParameterValueType.STRING,
        },
      ).stringValue.toString();

    const memberProjectEnvironmentProfile = new datazone.CfnEnvironmentProfile(
      this,
      `${projectName}-DataLakeEnvironmentProfile`,
      {
        awsAccountId: memberAccountId,
        awsAccountRegion: this.region,
        domainIdentifier: props.domainId,
        environmentBlueprintIdentifier: datalakeBlueprintId,
        name: `${projectName}-DataLakeEnvironmentProfile`,
        projectIdentifier: memberProjectId,
        description: `DataLake environment profile for project ${projectName}`,
      },
    );

    return new datazone.CfnEnvironment(
      this,
      `${projectName}-DataLakeEnvironment`,
      {
        domainIdentifier: props.domainId,
        environmentProfileIdentifier: memberProjectEnvironmentProfile.attrId,
        name: `${projectName}-DataLakeEnvironment`,
        projectIdentifier: memberProjectId,
        description: `DataLake environment for project ${projectName}`,
      },
    );
  }
}
