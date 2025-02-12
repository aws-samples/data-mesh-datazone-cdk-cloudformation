import boto3
import uuid
import json
import logging
from botocore.exceptions import ClientError

def assume_role(role_arn, session_name):
    """Assume an IAM role and return credentials"""
    try:
        sts_client = boto3.client('sts')
        response = sts_client.assume_role(
            RoleArn=role_arn,
            RoleSessionName=session_name
        )
        return response['Credentials']
    except ClientError as e:
        print(f"Error assuming role: {str(e)}")
        raise

def get_datazone_client_with_role(credentials):
    """Create a DataZone client with assumed role credentials"""
    return boto3.client(
        'datazone',
        aws_access_key_id=credentials['AccessKeyId'],
        aws_secret_access_key=credentials['SecretAccessKey'],
        aws_session_token=credentials['SessionToken'],
        region_name='eu-west-1'
    )

def lambda_handler(event, context):
    
  # Get properties from ResourceProperties
    print("Event received:", json.dumps(event, indent=2, default=str))
    
    # Access properties from ResourceProperties
    resource_properties = event.get('ResourceProperties', {})
    domain_identifier = resource_properties.get('domain_identifier')
    group_identifier = resource_properties.get('group_identifier')
    cfn_role_arn = resource_properties.get('cfn_role_arn')
    try:
        # Assume the role
        print(f"Attempting to assume role: {cfn_role_arn}")
        assumed_credentials = assume_role(
            cfn_role_arn,
            f"DataZoneOperation-{str(uuid.uuid4())}"
        )
        
        # Create session with assumed role
        session = boto3.Session(
            aws_access_key_id=assumed_credentials['AccessKeyId'],
            aws_secret_access_key=assumed_credentials['SecretAccessKey'],
            aws_session_token=assumed_credentials['SessionToken']
        )
        
        # Create DataZone client
        client = session.client('datazone', region_name='eu-west-1')
        
        # Verify assumed identity
        sts = session.client('sts')
        print("Assumed identity:")
        print(json.dumps(sts.get_caller_identity(), default=str))
      
        # Generate a unique client token
        client_token = str(uuid.uuid4())
        
        # Generate a unique client token
        client_token = str(uuid.uuid4())

       

        # Get domain information using assumed role
        print(f"Getting domain information for: {domain_identifier}")
        domain_response = client.get_domain(
            identifier=domain_identifier
        )
        print("Domain information retrieved successfully:")
        print(json.dumps(domain_response, default=str))

        # Extract rootDomainUnitId
        root_domain_unit_id = domain_response['rootDomainUnitId']
        print(f"Root Domain Unit ID: {root_domain_unit_id}")

        # Add entity owner using assumed role
        owner_response = client.add_entity_owner(
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
        
        print("Owner added successfully:")
        print(json.dumps(owner_response, default=str))

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
