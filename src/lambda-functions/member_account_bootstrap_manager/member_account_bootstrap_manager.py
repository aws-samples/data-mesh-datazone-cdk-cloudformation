"""
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: MIT-0

Permission is hereby granted, free of charge, to any person obtaining a copy of this
software and associated documentation files (the "Software"), to deal in the Software
without restriction, including without limitation the rights to use, copy, modify,
merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


This Lambda function manages the member account bootstrap process for a data solution.

Environment Variables:
    DOMAIN_NAME (str): The name of the data solution domain.
    CURRENT_REGION (str): The AWS region where the function is running.
    CFN_ASSETS_URL_PREFIX (str): The URL prefix for CloudFormation assets.
    DOMAIN_ID_PARAMETER_NAME (str): The name of the parameter that stores the domain ID.
    STACK_SET_ADMIN_ROLE_TEMPLATE_NAME (str): The name of the CloudFormation template for the StackSet admin role.
    MEMBER_STACK_SET_NAME (str): The name of the StackSet for member accounts.
    GOV_STACK_NAME (str): The name of the governance stack.
    NOTIFICATION_QUEUE_URL (str): The URL of the notification queue.
    LOG_LEVEL (str, optional): The log level for the function. Defaults to "INFO".
    TRACER_DISABLED (bool, optional): Whether to disable the AWS X-Ray tracer. Defaults to False.

Functions:
    None

Classes:
    Domain: A dataclass representing a data solution domain.
        Attributes:
            domainId (str): The ID of the domain.
            domainName (str): The name of the domain.
            domainStatus (str): The status of the domain.
            domainMembers (list): A list of Member objects representing the domain members.
"""
import os
import json
from time import sleep
from dataclasses import dataclass
from common import utils
from botocore.exceptions import ClientError

DOMAIN_NAME = os.environ["DOMAIN_NAME"]
CURRENT_REGION = os.environ["AWS_REGION"]
CFN_ASSETS_URL_PREFIX = os.environ["CFN_ASSETS_URL_PREFIX"]
DOMAIN_ID_PARAMETER_NAME = os.environ["DOMAIN_ID_PARAMETER_NAME"]
STACK_SET_ADMIN_ROLE_TEMPLATE_NAME = os.environ["STACK_SET_ADMIN_ROLE_TEMPLATE_NAME"]
MEMBER_STACK_SET_NAME = os.environ["MEMBER_STACK_SET_NAME"]
GOV_STACK_NAME = os.environ["GOV_STACK_NAME"]
NOTIFICATION_QUEUE_URL = os.environ["NOTIFICATION_QUEUE_URL"]

# Set logger, tracer, and session
log_level = os.environ.get("LOG_LEVEL", "INFO")
tracer_disabled = os.environ.get("TRACER_DISABLED", False)
logger = utils.get_logger(log_level=log_level, service_name="member_account_boostrap_manager")
tracer = utils.get_tracer(tracer_disabled=tracer_disabled, service_name="member_account_boostrap_manager")
session = utils.get_session()

# Initiate clients
ram_client = session.client("ram")
cfn_client = session.client("cloudformation")
ssm_client = session.client("ssm")
s3_client = session.client("s3")
sqs_client = session.client("sqs")


@dataclass
class Domain:
  """
  A class representing a domain in a data solution.

  Attributes:
      id (str): The unique identifier for the domain.
      name (str): The name of the domain.
  """
  id: str
  name: str


@dataclass
class ResourceShare:
  """
  Represents a resource share in AWS Resource Access Manager (AWS RAM).

  Attributes:
      name (str): The name of the resource share.
      arn (str): The Amazon Resource Name (ARN) of the resource share.
      resource_arn (str): The ARN of the resource being shared.
      principals (list): A list of principals (AWS accounts, organizations, organizational units,
          IAM roles, IAM users, or service principals) that the resource is being shared with.
  """
  name: str
  arn: str
  resource_arn: str
  principals: list


def on_create_resource_share(domain, resource_share, account_id):
  """
  Handle the creation of a resource share with PORTAL_ACCESS.
  """
  expected_resource_share_names = [f"DataZone-{DOMAIN_NAME}-PORTAL_ACCESS-{domain.id}",
                                   f"DataZone-{DOMAIN_NAME}-{domain.id}"]

  if resource_share.name in expected_resource_share_names:
    logger.info(f"Resource share name matched: {resource_share.name}")
    response = manage_stack_instances(domain, resource_share, account_id)
  else:
    logger.error(
      f"Resource share name mismatch! Expected prefix: {' or '.join(expected_resource_share_names)}, "
      f"Actual: {resource_share.name}. Exiting..."
    )
    return

  return response


def manage_stack_instances(domain, resource_share, account_id):
  """
  Manage stack instances for the resource share.
  """
  logger.info(f"Manage stack instances for {resource_share.principals}...")
  parameters = [
    {
      'ParameterKey': "GovernanceAccountID",
      'ParameterValue': account_id,
    },
    {
      'ParameterKey': "DomainIdentifier",
      'ParameterValue': domain.id,
    },
    {
      'ParameterKey': "AssociationResourceShareArn",
      'ParameterValue': resource_share.arn,
    },
    {
      'ParameterKey': 'NotificationQueueUrl',
      'ParameterValue': NOTIFICATION_QUEUE_URL,
    },
  ]

  response = create_stack_instance(parameters, resource_share.principals)

  return response


def create_stack_instance(parameters, principals):
  """
  Create stack instances for the resource share.
  """
  logger.info(f"Creating stack instance for {principals}...")

  # No waiter available for create_stack_instances()
  sleep_time = 30
  max_retries = 10
  response = {}

  for this_try in range(0, max_retries):
    try:
      response = cfn_client.create_stack_instances(
        StackSetName=MEMBER_STACK_SET_NAME,
        ParameterOverrides=parameters,
        DeploymentTargets={
          'Accounts': principals,
        },
        Regions=[
          CURRENT_REGION,
        ],
        OperationPreferences={
          'FailureToleranceCount': 5,
          'MaxConcurrentCount': 10,
          'ConcurrencyMode': 'SOFT_FAILURE_TOLERANCE'
        },
        CallAs='SELF'
      )
    except ClientError as err:
      if err.response["Error"]["Code"] == 'OperationInProgressException':
        if this_try == max_retries:
          logger.warning(f"Failed to create stack instances after {this_try} tries")
          raise RuntimeError(f"Error creating stack instances: {err}") from err

        logger.warning(f"Create stack instances operation in progress ... Sleeping for {sleep_time} seconds.")
        sleep(sleep_time)
        continue
      if err.response['Error']['Code'] == 'Throttling':
        if this_try == max_retries:
          logger.warning(f"Failed to create stack instances after {this_try} tries")
          raise RuntimeError(f"Error creating stack instances: {err}") from err

        logger.warning(
          "Throttling exception encountered while creating stack instances. Backing off and retrying..."
          f"Sleeping for {sleep_time} seconds.")
        sleep(sleep_time)
        continue
      elif err.response['Error']['Code'] == 'StackSetNotFoundException':
        raise LookupError(
          f"No StackSet matching {MEMBER_STACK_SET_NAME} found. You must create before creating stack instances.") from err
      else:
        raise RuntimeError(f"Error creating stack instances: {err}") from err

  return response


def if_stack_exist(stack_name):
  """
  Check if a stack exists.
  """
  stacks = cfn_client.list_stacks()["StackSummaries"]
  for stack in stacks:
    if stack["StackStatus"] == 'DELETE_COMPLETE':
      continue
    if stack_name == stack["StackName"]:
      return True
  return False


def manage_cfn_stack(stack_name, template_file_name, parameters):
  """
  Manage CloudFormation stack.
  """
  cfn_response = {}
  try:
    if if_stack_exist(stack_name):
      logger.info(f"Updating {stack_name}")
      cfn_response = cfn_client.update_stack(
        StackName=stack_name,
        TemplateURL=f"{CFN_ASSETS_URL_PREFIX}/{template_file_name}",
        Parameters=parameters,
        Capabilities=["CAPABILITY_AUTO_EXPAND", "CAPABILITY_NAMED_IAM"]
      )
      cfn_waiter = cfn_client.get_waiter('stack_update_complete')
      logger.info("...waiting for stack to be updated...")
    else:
      cfn_response = cfn_client.create_stack(
        StackName=stack_name,
        TemplateURL=f"{CFN_ASSETS_URL_PREFIX}/{template_file_name}",
        Parameters=parameters,
        TimeoutInMinutes=5,
        Capabilities=["CAPABILITY_AUTO_EXPAND", "CAPABILITY_NAMED_IAM"],
        OnFailure="ROLLBACK"
      )
      cfn_waiter = cfn_client.get_waiter('stack_create_complete')
      logger.info("Waiting for the stack to be created...")
    cfn_waiter.wait(StackName=stack_name)
  except ClientError as err:
    message = err.response['Error']['Message']
    if message == "No updates are to be performed.":
      logger.info("No changes")
      cfn_response["ResponseMetadata"] = {}
      cfn_response["ResponseMetadata"]["HTTPStatusCode"] = "200"
    else:
      raise err

  return cfn_response


def get_application_domain_id():
  """
  Get the application domain ID.
  """
  try:
    domain_id = ssm_client.get_parameter(
      Name=DOMAIN_ID_PARAMETER_NAME,
    )["Parameter"]["Value"]
  except ClientError as err:
    logger.error(f"Exception {err}")
    raise err

  return domain_id


def get_request_domain_id_and_resource_share_name(request_type, event):
  """
  Get the domain ID and resource share name from the event.
  """
  domain_id = None
  resource_share_name = None
  if request_type == "CreateResourceShare":
    domain_id = event["detail"]["requestParameters"]["resourceArns"][0].split("/")[-1]
    resource_share_name = event["detail"]["requestParameters"]["name"]
  elif request_type == "AssociateResourceShare":
    resource_share_arn = event["detail"]["requestParameters"]["resourceShareArn"]
    try:
      response = ram_client.get_resource_shares(
        resourceShareArns=[
          resource_share_arn,
        ],
        resourceOwner='SELF',
      )
      resource_share_name = response["resourceShares"][0]["name"]
      domain_id = response["resourceShares"][0]["name"].split("-")[-1]
    except ClientError as err:
      logger.error(f"Exception {err}")
      raise err
  else:
    logger.error(f"Unsupported request type: {request_type}")
    raise ValueError(f"Unsupported request type: {request_type}")

  return domain_id, resource_share_name


def get_resource_arn(request_type, resource_share_arn, event):
  """
  Get the resource ARN from the event.
  """
  resource_arn = None
  if request_type == "CreateResourceShare":
    resource_arn = event["detail"]["requestParameters"]["resourceArns"][0]
  elif request_type == "AssociateResourceShare":
    try:
      resource_arn = ram_client.list_resources(
        resourceOwner="SELF",
        resourceShareArns=[resource_share_arn],
      )["resources"][0]["arn"]
    except ClientError as err:
      logger.error(f"Exception {err}")
      raise err
  else:
    logger.error(f"Unsupported request type: {request_type}")
    raise ValueError(f"Unsupported request type: {request_type}")

  return resource_arn


def get_resource_share_arn(domain_id, account_id):
  """
  Get the resource share ARN for the domain.
  """
  try:
    resource_share_arn = ram_client.get_resource_share_associations(
      associationType="RESOURCE",
      resourceArn=f"arn:aws:datazone:{CURRENT_REGION}:{account_id}:domain/{domain_id}",
      associationStatus="ASSOCIATED"
    )["resourceShareAssociations"][0]["resourceShareArn"]
  except ClientError as err:
    logger.error(f"Exception {err}")
    raise err

  return resource_share_arn


def get_resource_share_principals(resource_share_arn):
  """
  Get the resource share principals.
  """
  try:
    resource_share_response = ram_client.get_resource_share_associations(
      associationType="PRINCIPAL",
      resourceShareArns=[resource_share_arn]
    )
  except ClientError as err:
    logger.error(f"Exception {err}")
    raise err

  principals = []
  for item in resource_share_response["resourceShareAssociations"]:
    if len(item) > 0 and (item["status"] == "ASSOCIATING" or item["status"] == "ASSOCIATED"):
      principals.append(item["associatedEntity"])
    else:
      logger.info("Resource share is not associated. Exiting..")

  return principals


def update_notification_queue_access_policy(principals, notification_queue_arn):
  """Function to update notification queue policy"""
  queue_policy = {}
  policy_list = []

  for principal in principals:
    policy_send_message_queue = {
      "Effect": "Allow",
      "Principal": {
        "AWS": f"arn:aws:iam::{principal}:role/DzDataMeshCfnStackSetExecutionRole"
      },
      "Action": "sqs:SendMessage",
      "Resource": notification_queue_arn
    }

    policy_list.append(policy_send_message_queue)

  queue_policy["Version"] = "2008-10-17"
  queue_policy["Statement"] = policy_list

  try:
    sqs_response = sqs_client.set_queue_attributes(
      QueueUrl=NOTIFICATION_QUEUE_URL,
      Attributes={
        'Policy': json.dumps(queue_policy)
      }
    )
  except ClientError as err:
    logger.error(f"Exception {err}")
    raise err

  return sqs_response


@tracer.capture_lambda_handler
def lambda_handler(event, context):
  """
  The entry point for the Lambda function.

  Args:
      event (dict): The event data received by the Lambda function.
      context (LambdaContext): The Lambda context object.

  Returns:
      dict: The response from the Lambda function.
  """

  account_id = event["account"]
  request_type = event["detail"]["eventName"]

  app_domain_id = get_application_domain_id()
  request_domain_id, resource_share_name = get_request_domain_id_and_resource_share_name(request_type, event)
  if app_domain_id != request_domain_id:
    message = f"Event domain id {request_domain_id} doesn't match application domain id {app_domain_id}! Exiting..."
    logger.info(message)
    return message

  resource_share_arn = get_resource_share_arn(app_domain_id, account_id)
  principals = get_resource_share_principals(resource_share_arn)
  if not principals:
    logger.info("No principals found. Exiting...")
    return
  resource_arn = get_resource_arn(request_type, resource_share_arn, event)

  domain = Domain(id=app_domain_id, name=DOMAIN_NAME)
  resource_share = ResourceShare(name=resource_share_name, arn=resource_share_arn,
                                 resource_arn=resource_arn, principals=principals)

  if request_type in ("CreateResourceShare", "AssociateResourceShare"):
    logger.info(f"{request_type} event received.")
    principals_comma_delimited = ",".join(principals)
    update_admin_role_parameters = [
      {
        "ParameterKey": "MemberAccountIdList",
        "ParameterValue": principals_comma_delimited
      },
    ]
    update_admin_role_response = manage_cfn_stack(GOV_STACK_NAME, STACK_SET_ADMIN_ROLE_TEMPLATE_NAME,
                                                  update_admin_role_parameters)
    logger.info(f"Update admin role response: {update_admin_role_response}")

    response = on_create_resource_share(domain, resource_share, account_id)

    notification_queue_name = NOTIFICATION_QUEUE_URL.split("/")[-1]
    notification_queue_arn = f"arn:aws:sqs:{CURRENT_REGION}:{account_id}:{notification_queue_name}"
    update_sqs_access_policy_response = update_notification_queue_access_policy(principals, notification_queue_arn)

    logger.info(f"Update SQS access policy response: {update_sqs_access_policy_response}")
  else:
    logger.error(f"Unsupported request type: {request_type}")
    raise ValueError(f"Unsupported request type: {request_type}")

  return response
