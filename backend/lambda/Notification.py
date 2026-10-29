import os
import json
import boto3
from aws_lambda_powertools.event_handler.exceptions import NotFoundError
from aws_lambda_powertools.event_handler import (
    APIGatewayRestResolver,
    CORSConfig,
    Response,
    content_types,
)

app = APIGatewayRestResolver(cors=CORSConfig(allow_origin="*"))

@app.not_found
def handle_not_found_errors(exc: NotFoundError) -> Response:
    return Response(status_code=418, content_type=content_types.TEXT_PLAIN, body="No such resource path found")

@app.post("/sendemail")
def send_email():
    # Get user eco_id and email
    post_data = app.current_event.json_body
    eco_id = post_data["eco_id"]
    destination_email = post_data["email"]
    
    # Start SES
    ses_client = boto3.client("ses")
    SENDER = os.environ.get("SENDER_EMAIL", "verde.techtitan.cs@gmail.com")
    CHARSET = "UTF-8"

    # Check if eco_id or email exist in request
    if not eco_id or not destination_email:
        return Response(
            status_code=400,
            content_type=content_types.APPLICATION_JSON,
            body=json.dumps({"error": "Missing eco_id or email"})
        )

    # Construct email content
    ses_client.send_email(
        Source = SENDER,
        Destination = {
            "ToAddresses": [destination_email],
        },
        Message = {
            "Subject": {"Data": "Your Verde Eco ID", "Charset": CHARSET},
            "Body": {
                "Text": {"Data": f"Your Verde Eco ID is: {eco_id}", "Charset": CHARSET},
                "Html": {"Data": f"<h3>Your ID</h3><p>{eco_id}</p>", "Charset": CHARSET}
            },
        },
    )

def lambda_handler(event, context):
    return app.resolve(event, context)
