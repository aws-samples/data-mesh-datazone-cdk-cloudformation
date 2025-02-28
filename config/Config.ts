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
interface memberAccountConfig {
  [key: string]: {
    PROJECT_NAME: string;
    PROJECT_DESCRIPTION: string;
    PROJECT_EMAIL: string;
  };
}
export const DZ_APPLICATION_NAME = 'dz-data-mesh';
export const DZ_STAGE_NAME = 'dev';
export const DZ_DOMAIN_NAME = 'CORP-DEV';
export const DZ_DOMAIN_DESCRIPTION = 'DataZone domain for CORP';
export const DZ_DOMAIN_TAG = 'CorpDev';
export const DZ_ADMIN_PROJECT_NAME = 'Admin';
export const DZ_ADMIN_PROJECT_DESCRIPTION = 'Project for Data Solution Administrators';

export const CDK_EXEC_ROLE_ARN = 'arn:aws:iam::686723865281:role/cdk-hnb659fds-cfn-exec-role-686723865281-us-east-1';
export const DZ_ADMIN_ROLE_ARN = 'arn:aws:iam::686723865281:role/aws-reserved/sso.amazonaws.com/eu-west-1/AWSReservedSSO_AdministratorAccess_b70db796e6768e6c';

export const DZ_DOMAIN_OWNER_GROUP_ID = 'replace with your group ID';
export const DZ_IAM_USER_ID_LIST   = ['TEST123'];  //allcaps
export const DZ_MEMBER_ACCOUNT_LIST  = [];
export const DZ_MEMBER_STACK_SET_EXEC_ROLE_LIST  = [''];
export const DZ_ADMINISTRATOR_EMAIL = 'user+dzadmin@acmecorp.domain';
export const DZ_COST_NOTIFICATION_EMAIL = 'user+dzcost@acmecorp.domain';


// Keep blank if you don't have member accounts
export const DZ_MEMBER_ACCOUNT_CONFIG: memberAccountConfig = {

};


/*
export const DZ_MEMBER_ACCOUNT_CONFIG: memberAccountConfig = {
  '123456789012' : {
    PROJECT_NAME: 'TEST-PROJECT-123456789012',
    PROJECT_DESCRIPTION: 'TEST-PROJECT-123456789012',
    PROJECT_EMAIL: 'member+project@acmecorp.domain'
  }
}*/