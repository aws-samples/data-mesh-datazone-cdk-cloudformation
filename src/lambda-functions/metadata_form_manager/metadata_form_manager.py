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

This Lambda function manages the metadata form for a data solution.

Environment Variables:
    LOG_LEVEL (str): The log level for the function (e.g., "INFO", "DEBUG", "WARNING").
    TRACER_DISABLED (bool): Whether to disable the AWS X-Ray tracer.

Functions:
    lambda_handler(event, context): The entry point for the Lambda function.

Classes:
    MetadataForm: A dataclass representing a metadata form for a data solution.
        Attributes:
            metadataFormName (str): The name of the metadata form.
            metadataFormDescription (str): The description of the metadata form.
            metadataFormModelSmithy (str): The model smithy for the metadata form.
            metadataFormModelStatus (str): The status of the metadata form model.
"""


import os
from dataclasses import dataclass
from common import utils
from botocore.exceptions import ClientError

# Set logger, tracer, and session
log_level = os.environ.get("LOG_LEVEL", "INFO")
tracer_disabled = os.environ.get("TRACER_DISABLED", False)
logger = utils.get_logger(log_level=log_level, service_name="metadata_form_manager")
tracer = utils.get_tracer(tracer_disabled=tracer_disabled, service_name="metadata_form_manager")
session = utils.get_session()

#  Initiate clients
dz_client = session.client("datazone")
ssm_client = session.client("ssm")


@dataclass
class MetadataForm:
  """
  A class representing a metadata form for a data solution.

  Attributes:
      metadataFormName (str): The name of the metadata form.
      metadataFormDescription (str): A description of the metadata form.
      metadataFormModelSmithy (str): The name or identifier of the model used to generate the metadata form.
      metadataFormModelStatus (str): The current status of the model used for the metadata form.
  """
  metadataFormName: str
  metadataFormDescription: str
  metadataFormModelSmithy: str
  metadataFormModelStatus: str


def on_create(domain_id, project_id, project_metadata_forms):
  """
  Initiate creation of glossary for the data solution.
  """
  response = create_and_update_project_metadata_forms(domain_id, project_id, project_metadata_forms, "ENABLED")

  return response


def on_update(domain_id, project_id, project_metadata_forms):
  """
  Initiate update of glossary for the data solution.
  """
  response = create_and_update_project_metadata_forms(domain_id, project_id, project_metadata_forms, "ENABLED")

  return response


def on_delete(domain_id, project_id, project_metadata_forms):
  """
  Initiate deletion of glossary for the data solution.
  """
  update_response = create_and_update_project_metadata_forms(domain_id, project_id, project_metadata_forms, "DISABLED")
  response = delete_project_metadata_forms(domain_id, project_metadata_forms)

  return response


def create_and_update_metadata_form(domain_id, project_id, metadata_form):
  """
  Create and update a metadata form.
  """
  try:
    response = dz_client.create_form_type(
      description=metadata_form.metadataFormDescription,
      domainIdentifier=domain_id,
      model={
        'smithy': metadata_form.metadataFormModelSmithy
      },
      name=metadata_form.metadataFormName,
      owningProjectIdentifier=project_id,
      status=metadata_form.metadataFormModelStatus
    )
    logger.info(f"Metadata Form {metadata_form.metadataFormName} created!")
  except ClientError as err:
    logger.error(f"Exception {err}")
    raise err

  return response


def create_and_update_project_metadata_forms(domain_id, project_id, project_metadata_forms, status):
  """
  Create and update metadata forms for a project.
  """
  for form in project_metadata_forms:
    form_name = form["FormName"]
    form_description = form["FormDescription"]
    form_smithy_model = form["FormSmithyModel"]

    metadata_form = MetadataForm(metadataFormName=form_name, metadataFormDescription=form_description,
                                 metadataFormModelSmithy=form_smithy_model, metadataFormModelStatus=status)

    metadata_form_create_response = create_and_update_metadata_form(domain_id, project_id, metadata_form)

  return {'statusCode': 200, 'body': "All metadata forms successfully created or updated!"}


def delete_project_metadata_forms(domain_id, project_metadata_forms):
  """
  Delete metadata forms for a project.
  """
  for form in project_metadata_forms:
    form_name = form["FormName"]

    metadata_form_delete_response = delete_metadata_form(domain_id, form_name)

  return {'statusCode': 200, 'body': "All metadata forms successfully deleted!"}


def delete_metadata_form(domain_id, metadata_form_name):
  """
  Delete a metadata form.
  """
  try:
    response = dz_client.delete_form_type(
      domainIdentifier=domain_id,
      formTypeIdentifier=metadata_form_name
    )
    logger.info(f"Metadata Form {metadata_form_name} deleted!")
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
  response = {}

  request_type = event["RequestType"]
  domain_id = event["ResourceProperties"]["DomainId"]
  project_id = event["ResourceProperties"]["ProjectId"]
  project_name = event["ResourceProperties"]["ProjectName"]
  metadata_form_project_name = event["ResourceProperties"]["MetadataFormProjectName"]
  project_metadata_forms = event["ResourceProperties"]["ProjectMetadataForms"]

  are_valid_parameters = utils.check_input_parameters(request_type, domain_id, project_id, project_metadata_forms)

  if are_valid_parameters and "admin" not in metadata_form_project_name.lower():
    message = "Metadata form project name must belong to the Admin Project! Check metadata form config. file"
    logger.error(message)
    raise ValueError(message)


  if are_valid_parameters and request_type == "Create":
    response = on_create(domain_id, project_id, project_metadata_forms)
  elif are_valid_parameters and request_type == "Update":
    response = on_update(domain_id, project_id, project_metadata_forms)
  elif are_valid_parameters and request_type == "Delete":
    response = on_delete(domain_id, project_id, project_metadata_forms)
  else:
    logger.error(f"Unsupported request type: {request_type}")
    raise ValueError(f"Unsupported request type: {request_type}")

  return response
