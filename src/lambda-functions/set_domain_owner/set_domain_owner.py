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


This Lambda function manages the domain ownership settings for a data solution.


Functions:
    lambda_handler(event, context): The entry point for the Lambda function.
"""

import os
import uuid
import json
from common import utils
from botocore.exceptions import ClientError

# Set logger, tracer, and session
log_level = os.environ.get("LOG_LEVEL", "INFO")
tracer_disabled = os.environ.get("TRACER_DISABLED", False)
logger = utils.get_logger(log_level=log_level, service_name="set_domain_owner")
tracer = utils.get_tracer(tracer_disabled=tracer_disabled, service_name="set_domain_owner")
session = utils.get_session()

# Initiate clients
dz_client = session.client("datazone")


def lambda_handler(event, context):
    # Get properties from ResourceProperties
    logger.info("Event received:", json.dumps(event, indent=2, default=str))

    # Access properties from ResourceProperties
    resource_properties = event.get('ResourceProperties', {})
    domain_identifier = resource_properties.get('domain_identifier')
    group_identifier = resource_properties.get('group_identifier')
    try:

        # Generate a unique client token
        client_token = str(uuid.uuid4())

        # Get domain information using assumed role
        logger.info(f"Getting domain information for: {domain_identifier}")
        domain_response = dz_client.get_domain(
            identifier=domain_identifier
        )
        logger.info("Domain information retrieved successfully:")
        logger.info(json.dumps(domain_response, default=str))

        # Extract rootDomainUnitId
        root_domain_unit_id = domain_response['rootDomainUnitId']

        # Add entity owner using assumed role
        owner_response = dz_client.add_entity_owner(
            clientToken=client_token,
            domainIdentifier=domain_identifier,
            entityIdentifier=root_domain_unit_id,
            entityType='DOMAIN_UNIT',
            owner={
                'group': {
                    'groupIdentifier': group_identifier
                }
            }
        )

        logger.info("Owner added successfully!")

        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Operation completed successfully',
                'domainResponse': domain_response,
                'ownerResponse': owner_response
            }, default=str)
        }

    except ClientError as e:
        error_message = e.response['Error']['Message']
        error_code = e.response['Error']['Code']
        print(f"AWS API Error: {error_code} - {error_message}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': error_message,
                'code': error_code
            })
        }
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': str(e),
                'type': type(e).__name__
            })
        }
