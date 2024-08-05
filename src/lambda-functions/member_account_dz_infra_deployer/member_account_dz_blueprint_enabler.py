# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

import os
import boto3
import logging
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

GOV_ACCOUNT_ID = os.environ["GOV_ACCOUNT_ID"]
DOMAIN_ID = os.environ["DOMAIN_ID"]
SQS_QUEUE_URL = os.environ["SQS_QUEUE_URL"]
NOTIFICATION_QUEUE_URL = os.environ["NOTIFICATION_QUEUE_URL"]

sqs_client = boto3.client("sqs")
dz_client = boto3.client("datazone")


def activate_datalake_blueprint(region, member_account_id, blueprint_bucket_name):
  try:
    list_environment_blueprints_response = dz_client.list_environment_blueprints(
      domainIdentifier=DOMAIN_ID,
      managed=True,
      name="DefaultDataLake"
    )
    logger.info("DefaultDataLake blueprint information received.")
  except ClientError as err:
    logger.error(f"Exception {err}")
    raise err

  datalake_environment_blueprint_id = list_environment_blueprints_response["items"][0]["id"]

  try:
    put_environment_blueprint_configuration_response = dz_client.put_environment_blueprint_configuration(
      domainIdentifier=DOMAIN_ID,
      enabledRegions=[
        region
      ],
      environmentBlueprintIdentifier=datalake_environment_blueprint_id,
      manageAccessRoleArn=f"arn:aws:iam::{member_account_id}:role/service-role/AmazonDataZoneGlueAccess-{region}-{DOMAIN_ID}",
      provisioningRoleArn=f"arn:aws:iam::{member_account_id}:role/service-role/AmazonDataZoneProvisioning-{GOV_ACCOUNT_ID}",
      regionalParameters={
        region: {
          "S3Location": f"s3://{blueprint_bucket_name}"
        }
      }
    )
    logger.info("DefaultDataLake blueprint activated!")
  except ClientError as err:
    logger.error(f"Exception {err}")
    raise err

  return put_environment_blueprint_configuration_response


def delete_message(message):
  receipt_handle = message["receiptHandle"]
  body = message["body"]

  try:
    sqs_client.delete_message(
      QueueUrl=SQS_QUEUE_URL,
      ReceiptHandle=receipt_handle
    )
    logger.info(f"Deleting message with body: {body}")
  except ClientError as err:
    logger.error(f"Exception {err}")
    raise err

  return True


def send_message_to_notification_queue(region, account_id, blueprint_id):
  try:
    sqs_response = sqs_client.send_message(QueueUrl=NOTIFICATION_QUEUE_URL,
                                           MessageAttributes={
                                             "messageType": {
                                               "DataType": "String",
                                               "StringValue": "MemberAccountAssociation"
                                             },
                                             "status": {
                                               "DataType": "String",
                                               "StringValue": "200"
                                             },
                                             "memberBlueprintId": {
                                               "DataType": "String",
                                               "StringValue": blueprint_id
                                             },
                                             "memberAccountId": {
                                               "DataType": "String",
                                               "StringValue": account_id
                                             },
                                             "memberRegion": {
                                               "DataType": "String",
                                               "StringValue": region
                                             },
                                           },
                                           MessageBody=f"BlueprintId {blueprint_id} for member account {account_id}"
                                                       f" and region {region} has been activated."
                                           )
    logger.info(f"Message sent to notification SQS queue: {NOTIFICATION_QUEUE_URL}")
  except ClientError as err:
    logger.error(f"Error sending message to notification SQS queue {NOTIFICATION_QUEUE_URL}: {err}")
    raise err

  return sqs_response


def lambda_handler(event, context):
  current_region = context.invoked_function_arn.split(":")[3]
  current_account_id = context.invoked_function_arn.split(":")[4]
  blueprint_bucket_name = f"amazon-datazone-{current_account_id}-{current_region}-datamesh-cfn"

  logger.info("Received event")
  records = event["Records"]

  if len(records) == 1:
    logger.info("Message received.")
    activate_datalake_blueprint_response = activate_datalake_blueprint(current_region, current_account_id,
                                                                       blueprint_bucket_name)
    send_message_to_notification_queue(current_region, current_account_id, activate_datalake_blueprint_response["environmentBlueprintId"])
    delete_message_response = delete_message(records[0])
  elif len(records) > 1:
    logger.info("More than one message received!")
    return
  else:
    logger.info("No message received.")
    return

  return delete_message_response

