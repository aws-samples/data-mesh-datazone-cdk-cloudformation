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

This code provides various utilities for Data Mesh Solution
"""
from aws_lambda_powertools import Logger
from aws_lambda_powertools import Tracer
from boto3.session import Session


def get_logger(log_level: str = "INFO", service_name: str = "") -> Logger:
  """Initialize Logger"""
  logger = Logger(level=log_level, service=f"ds_{service_name}")
  logger.info("Logger started...")
  return logger


def get_tracer(tracer_disabled: bool = False, service_name: str = "") -> Tracer:
  """Initialize Tracer"""
  tracer = Tracer(service=f"cls_{service_name}", disabled=tracer_disabled)
  return tracer


def get_session() -> Session:
  """Return boto3 execution session"""
  boto3_session = Session()
  return boto3_session


def get_region() -> str:
  """Return the current region"""
  return get_session().region_name


def check_input_parameters(*parameters):
  """Check if all parameters are not empty"""
  logger = get_logger(log_level="INFO", service_name="utils_check_input_parameters")

  for parameter in parameters:
    if not parameter:
      message = f"Invalid parameter value: {parameter}!"
      logger.error(message)
      return False

  return True