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

This Lambda function is responsible for managing data solution notifications.

Environment Variables:
    PARAMETER_STORE_NAME_PREFIX (str): The prefix for the parameter store names.
    NOTIFICATION_QUEUE_URL (str): The URL of the notification queue.
    DOMAIN_ID_PARAMETER_NAME (str): The name of the parameter that stores the domain ID.
    AWS_REGION (str): The AWS region in which the function is running.
    LOG_LEVEL (str, optional): The log level for the function. Defaults to "INFO".
    TRACER_DISABLED (bool, optional): Whether to disable the tracer. Defaults to False.

Functions:
    None

Classes:
    Member:
        A dataclass representing a member of a data solution.

        Attributes:
            region (str): The AWS region of the member.
            accountId (str): The AWS account ID of the member.
            blueprintId (str): The blueprint ID of the member.
"""

import os
from dataclasses import dataclass
from common import utils
from botocore.exceptions import ClientError


PARAMETER_STORE_NAME_PREFIX = os.environ["PARAMETER_STORE_NAME_PREFIX"]
NOTIFICATION_QUEUE_URL = os.environ["NOTIFICATION_QUEUE_URL"]
DOMAIN_ID_PARAMETER_NAME = os.environ["DOMAIN_ID_PARAMETER_NAME"]
CURRENT_REGION = os.environ["AWS_REGION"]

# Set logger, tracer, and session
log_level = os.environ.get("LOG_LEVEL", "INFO")
tracer_disabled = os.environ.get("TRACER_DISABLED", False)
logger = utils.get_logger(log_level=log_level, service_name="notification_manager")
tracer = utils.get_tracer(tracer_disabled=tracer_disabled, service_name="notification_manager")
session = utils.get_session()

# Initiate clients
ssm_client = session.client("ssm")
sqs_client = session.client("sqs")
sns_client = session.client("sns")
dz_client = session.client("datazone")


@dataclass
class Member:
  """
  A class representing a member account in a data solution.

  Attributes:
      region (str): The AWS region where the member account is located.
      accountId (str): The unique identifier (account ID) of the member account.
      blueprintId (str): The identifier of the blueprint associated with the member account.
  """
  region: str
  accountId: str
  blueprintId: str


@dataclass
class SubscriptionRequest:
  """
  A class representing a request for subscribing to a data product in a data solution.

  Attributes:
      dataProductName (str): The name of the data product being requested for subscription.
      dataOwnerProjectName (str): The name of the project that owns the data product.
      accessRequestorProjectName (str): The name of the project requesting access to the data product.
      userName (str): The name of the user making the subscription request.
  """
  dataProductName: str
  dataOwnerProjectName: str
  accessRequestorProjectName: str
  userName: str


def put_ssm_parameter_blueprint_id(member):
  """
  Put SSM parameter for blueprintId of a member
  """
  logger.info(f"Put SSM parameter /{PARAMETER_STORE_NAME_PREFIX}/member/{member.accountId}/{member.region}/blueprintId")
  try:
    response = ssm_client.put_parameter(
      Name=f"/{PARAMETER_STORE_NAME_PREFIX}/member/{member.accountId}/{member.region}/blueprintId",
      Value=member.blueprintId,
      Type='String',
      Overwrite=True
    )
    logger.info(
      f"SSM parameter {PARAMETER_STORE_NAME_PREFIX}/member/{member.accountId}/{member.region}/blueprintId created or updated!")
  except ClientError as err:
    logger.error(f"Exception {err}")
    raise err

  return response


def get_application_domain_id():
  """
  Get application domain ID
  """
  try:
    domain_id = ssm_client.get_parameter(
      Name=DOMAIN_ID_PARAMETER_NAME,
    )["Parameter"]["Value"]
  except ClientError as err:
    logger.error(f"Exception {err}")
    raise err

  return domain_id


def get_ssm_parameter_sns_arn(project_name):
  """
  Get SSM parameter for SNS ARN
  """
  logger.info(
    f"Get SSM parameter /{PARAMETER_STORE_NAME_PREFIX}/member/project/{project_name}/{CURRENT_REGION}/sns-arn")
  try:
    response = ssm_client.get_parameter(
      Name=f"/{PARAMETER_STORE_NAME_PREFIX}/member/project/{project_name}{CURRENT_REGION}/sns-arn",
    )
  except ClientError as err:
    logger.error(f"Exception {err}")
    raise err

  return response["Parameter"]["Value"]


def get_admin_ssm_parameter_sns_arn():
  logger.info(
    f"Get SSM parameter /{PARAMETER_STORE_NAME_PREFIX}/sns-arn")
  try:
    response = ssm_client.get_parameter(
      Name=f"/{PARAMETER_STORE_NAME_PREFIX}/sns-arn",
    )
  except ClientError as err:
    logger.error(f"Exception {err}")
    raise err

  return response["Parameter"]["Value"]


def delete_message(message):
  """
  Delete message from SQS queue
  """
  receipt_handle = message["receiptHandle"]
  body = message["body"]

  try:
    sqs_client.delete_message(
      QueueUrl=NOTIFICATION_QUEUE_URL,
      ReceiptHandle=receipt_handle
    )
    logger.info(f"Deleting message with body: {body}")
  except ClientError as err:
    logger.error(f"Exception {err}")
    raise err

  return True


def send_subscription_request_notification(subscription_request):
  try:
    subject = f"Subscription request for {subscription_request.dataProductName}"
    message = f"Subscription request for {subscription_request.dataProductName} has been received.\n\n" \
              f"Data product name: {subscription_request.dataProductName}\n" \
              f"Data owner project name: {subscription_request.dataOwnerProjectName}\n" \
              f"Data access requestor project name: {subscription_request.accessRequestorProjectName}\n" \
              f"IAM role name: {subscription_request.userName}\n"

    logger.info(f"Sending SNS notification")
    sns_arn = get_ssm_parameter_sns_arn(subscription_request.dataOwnerProjectName)

    response = sns_client.publish(
      TopicArn=sns_arn,
      Subject=subject,
      Message=message
    )

    logger.info(f"Notification sent successfully")
    return response
  except Exception as e:
    logger.error(f"Error sending SNS notification: {e}")
    return None


def send_bootstrapping_status_notification(message):
  logger.info(f"Received message: {message}")
  try:
    body = message["body"]
    member_account_id = message["messageAttributes"]["memberAccountId"]["stringValue"]
    member_region = message["messageAttributes"]["memberRegion"]["stringValue"]

    if not member_account_id or not member_region:
      logger.error("Missing required message attributes: memberAccountId or memberRegion")
      return None

    subject = f"Data Solution association request for {member_account_id} in {member_region}"

    logger.info("Sending SNS notification to DS Administrator")
    sns_arn = get_admin_ssm_parameter_sns_arn()

    logger.info(f"sns_arn = {sns_arn}")
    logger.info(f"subject = {subject}")
    logger.info(f"message_body = {body}")

    response = sns_client.publish(
      TopicArn=sns_arn,
      Subject=subject,
      Message=body
    )

    return response
  except Exception as e:
    logger.error(f"Error sending SNS notification: {e}")
    return None


def get_data_product_name(request_payload):
  """
  Get data product name
  """
  data_product_id = request_payload["subscribedListings"][0]["id"]
  data_product_name = None
  domain_id = get_application_domain_id()
  try:
    data_product_name = dz_client.get_asset(
      domainIdentifier=domain_id,
      identifier=data_product_id
    )['name']
  except ClientError as err:
    logger.error(f"Exception {err}")

  return data_product_name


def get_access_requestor_project_name(request_payload):
  """
  Get access requestor project name
  """
  access_requestor_project_id = request_payload["subscribedPrincipals"][0]["id"]
  access_requestor_project_name = get_project_name(access_requestor_project_id)

  return access_requestor_project_name


def get_data_owner_project_name(request_payload):
  """
  Get data owner project name
  """
  data_owner_project_id = request_payload["subscribedListings"][0]["ownerProjectId"]
  data_owner_project_name = get_project_name(data_owner_project_id)

  return data_owner_project_name


def get_project_name(project_id):
  """
  Get project name
  """
  project_name = None
  domain_id = get_application_domain_id()
  try:
    project_name = dz_client.get_project(
      domainIdentifier=domain_id,
      identifier=project_id
    )['name']
  except ClientError as err:
    logger.error(f"Exception {err}")

  return project_name


def get_iam_user_role_name(request_payload):
  """
  Get IAM user role name
  """
  requestor_id = request_payload["requesterId"]
  iam_role_arn = None
  domain_id = get_application_domain_id()
  try:
    iam_role_arn = dz_client.get_user_profile(
      domainIdentifier=domain_id,
      userIdentifier=requestor_id
    )['details']['iam']
  except ClientError as err:
    logger.error(f"Exception {err}")

  iam_user_role_name = iam_role_arn.split('/')[-1]

  return iam_user_role_name


def process_sqs_message(event):
  """
  Process SQS message
  """
  record = event["Records"][0]
  message_type = record["messageAttributes"]["messageType"]["stringValue"]

  if message_type == "MemberAccountAssociation":
    member_region = record["messageAttributes"]["memberRegion"]["stringValue"]
    member_account_id = record["messageAttributes"]["memberAccountId"]["stringValue"]
    member_blueprint_id = record["messageAttributes"]["memberBlueprintId"]["stringValue"]
    are_valid_parameters = utils.check_input_parameters(member_region, member_account_id, member_blueprint_id)

    if are_valid_parameters:
      member = Member(region=member_region, accountId=member_account_id, blueprintId=member_blueprint_id)
      put_ssm_parameter_blueprint_id_response = put_ssm_parameter_blueprint_id(member)
      send_bootstrapping_status_notification_response = send_bootstrapping_status_notification(record)
      delete_message_response = delete_message(record)
      return put_ssm_parameter_blueprint_id_response

  else:
    logger.error(f"Unsupported message type: {message_type}")
    raise ValueError(f"Unsupported message type: {message_type}")


def process_event_bridge_event(event):
  """
  Process EventBridge event
  """
  detail_type = event["detail-type"]
  event_domain_id = event["detail"]["metadata"]["domain"]
  domain_id = get_application_domain_id()
  if event_domain_id != domain_id:
    logger.info(f"Event domain id {event_domain_id} doesn't match! Exiting...")
    return

  if detail_type == "Subscription Request Created":
    request_payload = event["detail"]["data"]
    data_product_name = get_data_product_name(request_payload)
    data_owner_project_name = get_data_owner_project_name(request_payload)
    access_requestor_project_name = get_access_requestor_project_name(request_payload)
    iam_user_role_name = get_iam_user_role_name(request_payload)
    subscription_request = SubscriptionRequest(dataProductName=data_product_name,
                                               dataOwnerProjectName=data_owner_project_name,
                                               accessRequestorProjectName=access_requestor_project_name,
                                               userName=iam_user_role_name)

    send_subscription_request_notification(subscription_request)


@tracer.capture_lambda_handler
def lambda_handler(event, context):
  """
    The entry point for the Lambda function.

    Args:
        event (dict): The event data received by the Lambda function.
        context (LambdaContext): The Lambda context object.

    Returns:

  """
  if 'Records' in event:
    logger.info("Event source is SQS")
    return process_sqs_message(event)

  if 'detail' in event:
    logger.info("Event source is EventBridge")
    return process_event_bridge_event(event)

  else:
    logger.error(f"Unsupported event source: {event['source']}")
