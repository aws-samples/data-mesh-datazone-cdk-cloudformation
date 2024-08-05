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

This Lambda function manages the project membership for a data solution.

Environment Variables:
    LOG_LEVEL (str): The log level for the function (e.g., "INFO", "DEBUG", "WARNING").
    TRACER_DISABLED (bool): Whether to disable the AWS X-Ray tracer.

Functions:
    lambda_handler(event, context): The entry point for the Lambda function.

Classes:
    Domain: A dataclass representing a data solution domain.
        Attributes:
            id (str): The ID of the domain.

    Project: A dataclass representing a project within a data solution.
        Attributes:
            name (str): The name of the project.
"""

import os
from uuid import uuid4
from dataclasses import dataclass
from common import utils
from botocore.exceptions import ClientError

# Set logger, tracer, and session
log_level = os.environ.get("LOG_LEVEL", "INFO")
tracer_disabled = os.environ.get("TRACER_DISABLED", False)
logger = utils.get_logger(log_level=log_level, service_name="project_membership_manager")
tracer = utils.get_tracer(tracer_disabled=tracer_disabled, service_name="project_membership_manager")
session = utils.get_session()

# Initiate clients
dz_client = session.client("datazone")


@dataclass
class Domain:
  """
   A class representing a domain in a data solution.

   Attributes:
       id (str): The unique identifier for the domain.

   Methods:
       None
  """
  id: str


@dataclass
class Project:
  """
  A class representing a project within a data solution.

  Attributes:
      name (str): The name of the project.
      id (str): The unique identifier for the project.

  Methods:
      None
  """
  name: str
  id: str


@dataclass
class User:
  """
  A class representing a user in a data solution.

  Attributes:
      id (str): The unique identifier for the user.
      designation : The designation of the user.

  Methods:
      None
  """
  id: str
  designation: str


def on_create(domain, project, user):
  """
  Initiate creation of project membership for the data solution.
  """
  user_profile_id = dz_create_user_profile(domain.id, user.id)
  response = dz_create_project_membership(domain, project, user, user_profile_id)

  return response


def on_delete(domain, project, user):
  """
  Initiate deletion of project membership for the data solution.
  """
  user_profile_id = dz_get_user_profile_id(domain.id, user.id)
  response = dz_delete_project_membership(domain, project, user_profile_id)

  return response


def on_update(domain, project, user):
  """
  Initiate update of project membership for the data solution.
  """
  user_profile_id = dz_get_user_profile_id(domain.id, user.id)
  delete_response = dz_delete_project_membership(domain, project, user_profile_id)

  response = dz_create_project_membership(domain, project, user, user_profile_id)

  return response


def dz_create_project_membership(domain, project, user, user_profile_id):
  """
  Create project membership for the data solution.
  """
  response = {}
  try:
    response = dz_client.create_project_membership(
      designation=user.designation,
      domainIdentifier=domain.id,
      member={
        'userIdentifier': user_profile_id
      },
      projectIdentifier=project.id
    )
    logger.info(f"Project {project.name} membership updated!")
  except ClientError as err:
    message = err.response["Error"]["Message"]
    if message == "User is already in the project.":
      logger.info(f"User is already in the project: {project.name} ")
      response["ResponseMetadata"] = {}
      response["ResponseMetadata"]["HTTPStatusCode"] = 201
    elif "Conflict with userProfile" in message:
      logger.info(f"User profile for project {project.name} already exists.")
      response["ResponseMetadata"] = {}
      response["ResponseMetadata"]["HTTPStatusCode"] = 201
    else:
      logger.error(f"Exception {err}")
      raise err

  return response


def dz_delete_project_membership(domain, project, user_profile_id):
  """
  Delete project membership for the data solution.
  """
  try:
    response = dz_client.delete_project_membership(
      domainIdentifier=domain.id,
      member={
        'userIdentifier': user_profile_id
      },
      projectIdentifier=project.id,
    )
    logger.info(f"Project {project.name} membership deleted!")
  except ClientError as err:
    logger.error(f"Exception {err}")
    raise err

  return response


def dz_create_user_profile(domain_id, user_id):
  """
  Create user profile for the data solution.
  """
  try:
    response = dz_client.create_user_profile(
      clientToken=str(uuid4()),
      domainIdentifier=domain_id,
      userIdentifier=user_id,
      userType="IAM_ROLE"
    )
    logger.info("User profile created!")
    user_profile_id = response["id"]
  except ClientError as err:
    message = err.response['Error']['Message']
    substring = "Cannot create a user profile for existing principalId"
    if substring in message:
      logger.info("User profile exists")
      user_profile_id = dz_get_user_profile_id(domain_id, user_id)
    else:
      raise err

  return user_profile_id


def dz_get_user_profile_id(domain_id, user_id):
  """
  Get user profile ID for the data solution.
  """
  try:
    response = dz_client.get_user_profile(
      domainIdentifier=domain_id,
      type='IAM',
      userIdentifier=user_id
    )
    logger.info("User profile received!")
  except ClientError as err:
    logger.error(f"Exception {err}")
    raise err

  return response["id"]


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
  request_type = event["RequestType"]
  domain_id = event["ResourceProperties"]["DomainId"]
  project_id = event["ResourceProperties"]["ProjectId"]
  project_name = event["ResourceProperties"]["ProjectName"]
  designation = event["ResourceProperties"]["Designation"]
  user_id = event["ResourceProperties"]["UserIdentifier"]

  domain = Domain(id=domain_id)
  project = Project(name=project_name, id=project_id)
  user = User(id=user_id, designation=designation)

  are_valid_parameters = utils.check_input_parameters(request_type, domain_id, project_name, project_id, user_id,
                                                      designation)

  if are_valid_parameters and request_type == "Create":
    response = on_create(domain, project, user)
  elif are_valid_parameters and request_type == "Delete":
    response = on_delete(domain, project, user)
  elif are_valid_parameters and request_type == "Update":
    response = on_update(domain, project, user)
  else:
    logger.error(f"Unsupported request type: {request_type}")
    raise ValueError(f"Unsupported request type: {request_type}")

  return response
