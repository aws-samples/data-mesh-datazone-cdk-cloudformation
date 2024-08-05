# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

import os
import logging
import boto3
from botocore.exceptions import ClientError
import cfnresponse

logger = logging.getLogger()
logger.setLevel(logging.INFO)

gov_account_id = os.environ["GOV_ACCOUNT_ID"]
domain_id = os.environ["DOMAIN_ID"]
sqs_queue_url = os.environ["SQS_QUEUE_URL"]
ram_client = boto3.client("ram")
sqs_client = boto3.client("sqs")


def send_message_to_sqs(resource_share_arn, event, context):
  try:
    sqs_response = sqs_client.send_message(QueueUrl=sqs_queue_url,
                                           MessageBody=f"Resource share {resource_share_arn} accepted!")
  except ClientError as err:
    logger.error(f"Error sending message to SQS queue {sqs_queue_url}: {err}")
    cfnresponse.send(event, context, cfnresponse.FAILED, {"status": "Error sending message to SQS queue"},
                     "CustomResourcePhysicalID")
    raise err

  return sqs_response


def on_create(association_resource_share_status, association_resource_share_arn, event, context):
  ram_response = {}

  if association_resource_share_status == "PENDING":
    ram_response = accept_resource_share_invite(association_resource_share_arn, event, context)
    logger.info(f"Resource share invitation accepted")
    sqs_response = send_message_to_sqs(association_resource_share_arn, event, context)
  elif association_resource_share_status == "ACCEPTED":
    logger.info(f"Resource share invitation already accepted!")
  else:
    logger.error(f"Resource share status {association_resource_share_status} not recognized!")
    cfnresponse.send(event, context, cfnresponse.FAILED, {"status": association_resource_share_status},
                     "CustomResourcePhysicalID")
    raise AttributeError(f"Resource share status {association_resource_share_status} not recognized!")

  return ram_response


def on_update(association_resource_share_status, association_resource_share_arn, event, context):
  ram_response = {}

  if association_resource_share_status == "PENDING":
    ram_response = accept_resource_share_invite(association_resource_share_arn, event, context)
    logger.info(f"Resource share invitation accepted")
    sqs_response = send_message_to_sqs(association_resource_share_arn, event, context)
  elif association_resource_share_status == "ACCEPTED":
    logger.info(f"Resource share invitation already accepted!")
  else:
    logger.error(f"Resource share status {association_resource_share_status} not recognized!")
    cfnresponse.send(event, context, cfnresponse.FAILED, {"status": association_resource_share_status},
                     "CustomResourcePhysicalID")
    raise AttributeError(f"Resource share status {association_resource_share_status} not recognized!")

  return ram_response


def accept_resource_share_invite(resource_share_arn, event, context):
  try:
    response = ram_client.get_resource_share_invitations(
      resourceShareArns=[resource_share_arn]
    )
    invitations = response.get("resourceShareInvitations", None)
    if invitations:
      resource_share_invite_arn = invitations[0]["resourceShareInvitationArn"]
      logger.info("Resource share invitation information received.")
    else:
      logger.error("No resource share invitations found.")
      cfnresponse.send(event, context, cfnresponse.SUCCESS, "No resource share invitations found.", "CustomResourcePhysicalID")
      return

    accept_response = ram_client.accept_resource_share_invitation(
      resourceShareInvitationArn=resource_share_invite_arn
    )
    logger.info("Resource share invitation accepted.")
    return accept_response

  except ClientError as err:
    error_message = err.response.get("Error", {}).get("Message", str(err))
    logger.error(f"Exception: {error_message}")
    cfnresponse.send(event, context, cfnresponse.FAILED, {"Error": error_message}, "CustomResourcePhysicalID")
    raise



def get_resource_share_status(resource_share_arn, event, context):
  try:
    response = ram_client.get_resource_share_invitations(
      resourceShareArns=[resource_share_arn]
    )
    invitations = response.get("resourceShareInvitations", None)
    if invitations:
      resource_share_status = invitations[0]["status"]
      logger.info("Resource share status information received.")
      return resource_share_status
    else:
      logger.error("No resource share invitations found.")
      cfnresponse.send(event, context, cfnresponse.SUCCESS, "No resource share invitations found.", "CustomResourcePhysicalID")
  except ClientError as err:
    error_message = err.response.get("Error", {}).get("Message", str(err))
    logger.error(f"Exception: {error_message}")
    cfnresponse.send(event, context, cfnresponse.FAILED, {"Error": error_message}, "CustomResourcePhysicalID")
    raise



def check_input_parameters(*parameters):
  for parameter in parameters:
    if not parameter:
      message = f"Invalid parameter value: {parameter}!"
      logger.error(message)
      return False

  return True


def lambda_handler(event, context):
  response = {}
  request_type = event["RequestType"]

  # TODO: Generalize for Update and Delete
  are_valid_parameters = None
  association_resource_share_status = None
  association_resource_share_arn = None
  if request_type == "Create":
    association_resource_share_arn = event["ResourceProperties"]["AssociationResourceShareArn"]
    association_resource_share_status = get_resource_share_status(association_resource_share_arn, event, context)

    are_valid_parameters = check_input_parameters(request_type, association_resource_share_arn)

  if are_valid_parameters and request_type == "Create":
    on_create_response = on_create(association_resource_share_status, association_resource_share_arn, event, context)
    response = {
      'RequestType': 'Create',
      'HTTPStatusCode': on_create_response.get("ResponseMetadata", {}).get("HTTPStatusCode", "202"),
      'status': on_create_response.get("resourceShareInvitation", {}).get("status", ""),
      'resourceShareArn': on_create_response.get("resourceShareInvitation", {}).get("resourceShareArn", ""),
      'resourceShareName': on_create_response.get("resourceShareInvitation", {}).get("resourceShareName", ""),
      'receiverAccountId': on_create_response.get("resourceShareInvitation", {}).get("receiverAccountId", ""),
      'senderAccountId': on_create_response.get("resourceShareInvitation", {}).get("senderAccountId", "")
    }
    cfnresponse.send(event, context, cfnresponse.SUCCESS, response, "CustomResourcePhysicalID")
  elif request_type == "Delete":
    logger.info("Delete method not implemented yet. Manually delete the resources.")
    response = {
      'RequestType': 'Delete',
      'HTTPStatusCode': '200',
    }
    cfnresponse.send(event, context, cfnresponse.SUCCESS, response, "CustomResourcePhysicalID")
  elif request_type == "Update":
    logger.info("Update method not implemented yet.")
    response = {
      'RequestType': 'Update',
      'HTTPStatusCode': '200',
    }
    cfnresponse.send(event, context, cfnresponse.SUCCESS, response, "CustomResourcePhysicalID")

  return response
