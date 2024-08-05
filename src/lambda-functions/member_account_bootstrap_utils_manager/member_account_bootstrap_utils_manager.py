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


This AWS Lambda function is responsible for managing the creation of CloudFormation stacks
in member accounts using AWS CloudFormation StackSets. It is triggered by events from
another CloudFormation stack or service.

Environment Variables:
    CFN_ASSETS_URL_PREFIX (str): The URL prefix for CloudFormation templates and assets.
    STACK_SET_ADMIN_ROLE_TEMPLATE_NAME (str): The name of the CloudFormation template for the StackSet admin role.
    GOV_STACK_NAME (str): The name of the governing CloudFormation stack.
    LOG_LEVEL (str, optional): The log level for the Lambda function. Defaults to "INFO".
    TRACER_DISABLED (bool, optional): Whether to disable AWS X-Ray tracing. Defaults to False.

Functions:
    on_create(dz_member_stackset_stack_name, parameters):
        Manages the creation of a CloudFormation stack in a member account.

        Args:
            dz_member_stackset_stack_name (str): The name of the StackSet stack in the member account.
            parameters (dict): The parameters to pass to the CloudFormation stack.

        Returns:
            dict: The response from the CloudFormation stack creation or update operation.
"""

import os
from common import utils
from botocore.exceptions import ClientError

CFN_ASSETS_URL_PREFIX = os.environ["CFN_ASSETS_URL_PREFIX"]
STACK_SET_ADMIN_ROLE_TEMPLATE_NAME = os.environ["STACK_SET_ADMIN_ROLE_TEMPLATE_NAME"]
GOV_STACK_NAME = os.environ["GOV_STACK_NAME"]

# Set logger, tracer, and session
log_level = os.environ.get("LOG_LEVEL", "INFO")
tracer_disabled = os.environ.get("TRACER_DISABLED", False)
logger = utils.get_logger(log_level=log_level, service_name="member_account_bootstrap_utils_manager")
tracer = utils.get_tracer(tracer_disabled=tracer_disabled, service_name="member_account_bootstrap_utils_manager")
session = utils.get_session()


# Initiate clients
cfn_client = session.client("cloudformation")


def on_create(dz_member_stackset_stack_name, parameters):
  """
  Initiate creation of CFN stack for the data solution.
  """
  response = manage_cfn_stack(dz_member_stackset_stack_name, parameters)

  return response


def on_delete(dz_member_stackset_stack_name, parameters):
  """
  Initiate deletion of CFN stack for the data solution.
  """
  response = delete_cfn_stack(dz_member_stackset_stack_name)

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


def manage_cfn_stack(stack_name, parameters):
  """
  Manage the CloudFormation stack.
  """
  cfn_response = {}
  try:
    if if_stack_exist(stack_name):
      logger.info(f"stack {stack_name} exists....do nothing...")
      return cfn_response
    else:
      cfn_response = cfn_client.create_stack(
        StackName=stack_name,
        TemplateURL=f"{CFN_ASSETS_URL_PREFIX}/{STACK_SET_ADMIN_ROLE_TEMPLATE_NAME}",
        TimeoutInMinutes=5,
        Capabilities=["CAPABILITY_AUTO_EXPAND", "CAPABILITY_NAMED_IAM"],
        OnFailure="ROLLBACK",
        Parameters=parameters
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


def delete_cfn_stack(stack_name):
  """
  Delete the CloudFormation stack.
  """
  try:
    response = cfn_client.delete_stack(StackName=stack_name)
    logger.info(f"Deleting {stack_name}")
  except ClientError as err:
    logger.error(f"Exception {err}")
    raise err

  return response


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

  request_type = event["detail"]["status-details"]["status"]

  parameters = [
    {
      'ParameterKey': "MemberAccountIdList",
      'ParameterValue': "",
    }
  ]

  are_valid_parameters = utils.check_input_parameters(request_type, parameters)

  processes = {
    "CREATE_COMPLETE": on_create,
    "UPDATE_COMPLETE": on_create,
    "DELETE_COMPLETE": on_delete
  }

  if are_valid_parameters:
    process = processes.get(request_type, None)
    if process:
      response = process(GOV_STACK_NAME, parameters)
    else:
      error_message = f"Unsupported request type: {request_type}"
      logger.error(error_message)
      raise ValueError(error_message)
  else:
    logger.error("Invalid parameters provided.")
    raise ValueError("Invalid parameters provided.")


  return response
