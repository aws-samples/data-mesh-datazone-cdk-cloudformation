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


This Lambda function manages the glossary for a data solution.

Environment Variables:
    LOG_LEVEL (str): The log level for the function (e.g., "INFO", "DEBUG", "WARNING").
    TRACER_DISABLED (bool): Whether to disable the AWS X-Ray tracer.

Functions:
    lambda_handler(event, context): The entry point for the Lambda function.

Classes:
    Glossary: A dataclass representing the glossary for a data solution.
        Attributes:
            projectGlossaries (dict): A dictionary containing the glossaries for the data solution.
"""

import os
import json
from uuid import uuid4
from dataclasses import dataclass
from common import utils
from botocore.exceptions import ClientError


# Set logger, tracer, and session
log_level = os.environ.get("LOG_LEVEL", "INFO")
tracer_disabled = os.environ.get("TRACER_DISABLED", False)
logger = utils.get_logger(log_level=log_level, service_name="glossary_manager")
tracer = utils.get_tracer(tracer_disabled=tracer_disabled, service_name="glossary_manager")
session = utils.get_session()

# Initiate clients
dz_client = session.client("datazone")
ssm_client = session.client("ssm")


@dataclass
class Glossary:
  """
  A class representing a glossary for a data solution.

  Attributes:
      projectGlossaries (dict): A dictionary containing glossaries for different projects.
          The keys are project IDs, and the values are dictionaries containing glossary information.
      glossaryParamStoreName (str): The name of the AWS Systems Manager Parameter Store parameter
          that stores the glossary information.
      glossaryTermParamStoreNamePrefix (str): The prefix for the names of AWS Systems Manager
          Parameter Store parameters that store glossary term information.
  """
  projectGlossaries: dict
  glossaryParamStoreName: str
  glossaryTermParamStoreNamePrefix: str


def on_create(domain_id, project_id, glossary):
  """
  Initiate creation of glossary for the data solution.
  """
  response = create_project_glossary(domain_id, project_id, glossary)

  return response


def on_delete(domain_id, glossary):
  """
  Initiate deletion of glossary for the data solution.
  """
  update_response = update_project_glossary(domain_id, glossary, glossary.projectGlossaries, "DISABLED")
  response = delete_project_glossary(domain_id, glossary)

  return response


def on_update(domain_id, glossary, old_project_glossaries, status):
  """
  Initiate update of glossary for the data solution.
  """
  response = update_project_glossary(domain_id, glossary, old_project_glossaries, status)

  return response


def create_glossary(domain_id, project_id, glossary_name, glossary_description):
  """
  Create a glossary for the data solution.
  """
  try:
    response = dz_client.create_glossary(
      clientToken=str(uuid4()),
      description=glossary_description,
      domainIdentifier=domain_id,
      name=glossary_name,
      owningProjectIdentifier=project_id,
      status='ENABLED'
    )
    logger.info(f"Glossary {glossary_name} created!")
  except ClientError as err:
    logger.error(f"Exception {err}")
    raise err

  return response


def update_glossary(domain_id, glossary_id, glossary_name, glossary_description, status):
  """
  Update a glossary for the data solution.
  """
  try:
    response = dz_client.update_glossary(
      clientToken=str(uuid4()),
      description=glossary_description,
      domainIdentifier=domain_id,
      identifier=glossary_id,
      name=glossary_name,
      status=status
    )
    logger.info(f"Glossary {glossary_name} updated!")
  except ClientError as err:
    logger.error(f"Exception {err}")
    raise err

  return response


def delete_glossary(domain_id, glossary_id, glossary_name):
  """
  Delete a glossary for the data solution.
  """
  try:
    response = dz_client.delete_glossary(
      domainIdentifier=domain_id,
      identifier=glossary_id,
    )
    logger.info(f"Glossary {glossary_name} deleted!")
  except ClientError as err:
    logger.error(f"Exception {err}")
    raise err

  return response


def create_glossary_term(domain_id, glossary_id, long_description, name, short_description):
  """
  Create a glossary term for the data solution.
  """
  try:
    response = dz_client.create_glossary_term(
      clientToken=str(uuid4()),
      domainIdentifier=domain_id,
      glossaryIdentifier=glossary_id,
      longDescription=long_description,
      name=name,
      shortDescription=short_description,
      status='ENABLED'
    )
    logger.info(f"Term {name} created!")
  except ClientError as err:
    logger.error(f"Exception {err}")
    raise err

  return response


def update_glossary_term(domain_id, glossary_id, glossary_term_id, long_description, name, short_description, status):
  """
  Update a glossary term for the data solution.
  """
  try:
    response = dz_client.update_glossary_term(
      domainIdentifier=domain_id,
      glossaryIdentifier=glossary_id,
      identifier=glossary_term_id,
      longDescription=long_description,
      name=name,
      shortDescription=short_description,
      status=status
    )
    logger.info(f"Term {name} updated!")
  except ClientError as err:
    logger.error(f"Exception {err}")
    raise err

  return response


def delete_glossary_term(domain_id, glossary_term_id, name):
  """
  Delete a glossary term for the data solution.
  """
  try:
    response = dz_client.delete_glossary_term(
      domainIdentifier=domain_id,
      identifier=glossary_term_id
    )
    logger.info(f"Term {name} deleted!")
  except ClientError as err:
    logger.error(f"Exception {err}")
    raise err

  return response


def create_project_glossary(domain_id, project_id, glossary: Glossary):
  """
  Create project glossary
  """
  glossary_param_store_value = []
  glossary_term_param_store_prefix = glossary.glossaryTermParamStoreNamePrefix
  glossary_param_store_name = glossary.glossaryParamStoreName
  for glossary in glossary.projectGlossaries:
    glossary_name = glossary["GlossaryName"]
    glossary_description = glossary["GlossaryDescription"]
    glossary_terms = glossary["GlossaryTerms"]

    glossary_create_response = create_glossary(domain_id, project_id, glossary_name, glossary_description)
    glossary_id = glossary_create_response["id"]
    glossary_param_store_value.append(f"{glossary_name}:{glossary_id}")

    glossary_term_param_store_value = []
    for term in glossary_terms:
      name = term["Name"]
      long_description = term["LongDescription"]
      short_description = term["ShortDescription"]
      glossary_term_create_response = create_glossary_term(domain_id, glossary_id, long_description, name,
                                                           short_description)
      glossary_term_id = glossary_term_create_response["id"]
      glossary_term_param_store_value.append(f"{name}:{glossary_term_id}")

    glossary_term_param_store_name = f"{glossary_term_param_store_prefix}/{glossary_id}"
    glossary_term_param_store_value = ",".join(glossary_term_param_store_value)
    update_ssm_parameter_response = put_ssm_parameter(glossary_term_param_store_name, glossary_term_param_store_value)

  glossary_param_store_value = ",".join(glossary_param_store_value)
  update_ssm_parameter_response = put_ssm_parameter(glossary_param_store_name, glossary_param_store_value)

  return {'statusCode': 200, 'body': json.dumps(glossary_param_store_value)}


def update_project_glossary(domain_id, glossary: Glossary, old_project_glossaries, status):
  """
  Update project glossary
  """
  glossary_ids = []
  glossary_term_param_store_prefix = glossary.glossaryTermParamStoreNamePrefix
  glossary_param_store_name = glossary.glossaryParamStoreName
  for (glossary, old_glossary) in zip(glossary.projectGlossaries, old_project_glossaries):
    glossary_name = glossary["GlossaryName"]
    glossary_description = glossary["GlossaryDescription"]
    glossary_terms = glossary["GlossaryTerms"]
    old_glossary_name = old_glossary["GlossaryName"]
    old_glossary_terms = old_glossary["GlossaryTerms"]
    glossary_id = get_glossary_id(old_glossary_name, glossary_param_store_name)

    glossary_update_response = update_glossary(domain_id, glossary_id, glossary_name, glossary_description, status)
    glossary_ids.append(glossary_id)
    for (term, old_term) in zip(glossary_terms, old_glossary_terms):
      name = term["Name"]
      long_description = term["LongDescription"]
      short_description = term["ShortDescription"]
      old_term_name = old_term["Name"]
      glossary_term_param_store_name = f"{glossary_term_param_store_prefix}/{glossary_id}"
      glossary_term_id = get_glossary_term_id(old_term_name, glossary_term_param_store_name)
      glossary_term_update_response = update_glossary_term(domain_id, glossary_id, glossary_term_id, long_description,
                                                           name, short_description, status)

  return {'statusCode': 200, 'body': json.dumps(glossary_ids)}


def delete_project_glossary(domain_id, glossary: Glossary):
  """
  Delete project glossary
  """
  glossary_param_store_value = []
  glossary_term_param_store_prefix = glossary.glossaryTermParamStoreNamePrefix
  glossary_param_store_name = glossary.glossaryParamStoreName
  for glossary_item in glossary.projectGlossaries:
    glossary_name = glossary_item["GlossaryName"]
    glossary_terms = glossary_item["GlossaryTerms"]
    glossary_id = get_glossary_id(glossary_name, glossary_param_store_name)

    glossary_term_param_store_name = f"{glossary_term_param_store_prefix}/{glossary_id}"
    for term in glossary_terms:
      name = term["Name"]
      glossary_term_id = get_glossary_term_id(name, glossary_term_param_store_name)
      glossary_term_delete_response = delete_glossary_term(domain_id, glossary_term_id, name)

    glossary_delete_response = delete_glossary(domain_id, glossary_id, glossary_name)
    delete_ssm_parameter_response = delete_ssm_parameter(glossary_term_param_store_name)

  delete_ssm_parameter_response = delete_ssm_parameter(glossary_param_store_name)

  return {'statusCode': 200, 'body': json.dumps(glossary_param_store_value)}


def get_glossary_id(glossary_name, glossary_param_store_name):
  """
  Get glossary id
  """
  try:
    glossary_name_id_list = ssm_client.get_parameter(
      Name=glossary_param_store_name,
    )["Parameter"]["Value"].split(",")
  except ClientError as err:
    logger.error(f"Exception {err}")
    raise err

  for item in glossary_name_id_list:
    item_list = item.split(":")
    if item_list[0] == glossary_name:
      glossary_id = item_list[1]
      break

  return glossary_id


def get_glossary_term_id(glossary_term_name, glossary_term_param_store_name):
  """
  Get glossary term id
  """
  glossary_term_id = None
  try:
    glossary_term_name_id_list = ssm_client.get_parameter(
      Name=glossary_term_param_store_name,
    )["Parameter"]["Value"].split(",")
  except ClientError as err:
    logger.error(f"Exception {err}")
    raise err

  for item in glossary_term_name_id_list:
    item_list = item.split(":")
    if item_list[0] == glossary_term_name:
      glossary_term_id = item_list[1]
      break

  return glossary_term_id


def put_ssm_parameter(parameter_name, parameter_value):
  """
  Put SSM parameter
  """
  try:
    response = ssm_client.put_parameter(
      Name=parameter_name,
      Value=parameter_value,
      Type='StringList',
      Overwrite=True
    )
    logger.info(f"SSM parameter {parameter_name} created or updated!")
  except ClientError as err:
    logger.error(f"Exception {err}")
    raise err

  return response


def delete_ssm_parameter(parameter_name):
  """
  Delete SSM parameter
  """
  try:
    response = ssm_client.delete_parameter(
      Name=parameter_name
    )
    logger.info(f"SSM parameter {parameter_name} deleted!")
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
  glossary_project_name = event["ResourceProperties"]["GlossaryProjectName"]
  project_glossaries = event["ResourceProperties"]["ProjectGlossaries"]
  glossary_param_store_name = event["ResourceProperties"]["GlossaryParameterStoreName"]
  glossary_term_param_store_name_prefix = event["ResourceProperties"]["GlossaryTermParameterStoreNamePrefix"]

  are_valid_parameters = utils.check_input_parameters(request_type, domain_id, project_id, project_name, project_glossaries,
                                                      glossary_param_store_name)

  glossary = Glossary(projectGlossaries=project_glossaries, glossaryParamStoreName=glossary_param_store_name,
                      glossaryTermParamStoreNamePrefix=glossary_term_param_store_name_prefix)

  if are_valid_parameters and "admin" not in glossary_project_name.lower():
    message = "Glossary project name must belong to the Admin Project! Check glossary config. file"
    logger.error(message)
    raise ValueError(message)

  if are_valid_parameters and request_type == "Create":
    response = on_create(domain_id, project_id, glossary)
  elif are_valid_parameters and request_type == "Update":
    old_project_glossaries = event["OldResourceProperties"]["ProjectGlossaries"]
    response = on_update(domain_id, glossary, old_project_glossaries, "ENABLED")
  elif are_valid_parameters and request_type == "Delete":
    response = on_delete(domain_id, glossary)
  else:
    logger.error(f"Unsupported request type: {request_type}")
    raise ValueError(f"Unsupported request type: {request_type}")

  return response
