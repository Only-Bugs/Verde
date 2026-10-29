import os
import json
import boto3
import uuid
from aws_lambda_powertools.event_handler.exceptions import NotFoundError
from aws_lambda_powertools.event_handler import (
    APIGatewayRestResolver,
    CORSConfig,
    Response,
    content_types,
)

rds_client = boto3.client('rds-data')
app = APIGatewayRestResolver(cors=CORSConfig(allow_origin="*"))

db_cluster_arn = os.environ["DB_CLUSTER_ARN"]
db_credential_secret_store_arn = os.environ["DB_SECRET_ARN"]

@app.not_found
def handle_not_found_errors(exc: NotFoundError) -> Response:
    return Response(status_code=418, content_type=content_types.TEXT_PLAIN, body="No such resource path found")

@app.get("/user/<eco_id>/challenge")
def get_challenge(eco_id: str):
    # Retrive all accepted user challenges
    # These challenges should not be send for the GET request
    sql = """
    SELECT id, user_id, challenge_id, progress_count, status FROM verde.user_challenges where user_id = :eco_id
    """
    params = [
        {'name':'eco_id', 'value':{'stringValue': eco_id}}
    ]
    response = execute_statement(sql, params)

    # Store all user accepted challenge in record
    challenge_record_dict = {}
    for record in response['records']:
        challenge_record_dict[record[2]['stringValue']] = [record[3]['longValue'],record[4]['stringValue']]

    # Get all challenge
    sql = 'SELECT challenge_id,category,challenge,challenge_difficulty,challenge_points,challenge_frequency,challenge_progress,challenge_description,challenge_benefit FROM verde.challenges'
    response = execute_statement(sql);

    rows = []
    for record in response['records']:
        accepted_by_user = True

        if record[0]['stringValue'] not in challenge_record_dict.keys():
            accepted_by_user = False

        status = 0 if not accepted_by_user else (1 if challenge_record_dict.get(record[0].get('stringValue'))[1] == "Completed" else 0)
        if status == 1:
            continue
        
        row = {
            "id": record[0]['stringValue'],
            "title": record[2]['stringValue'],
            "description": record[7]['stringValue'],
            "progress": { 
                "current": challenge_record_dict.get(record[0].get('stringValue'), [0])[0], 
                "target": record[6]['longValue'] 
            },
            "rewards": { "points": record[4]['longValue'] },
            "status": status,
            "isActive": accepted_by_user,
            "icon": None
        }
        rows.append(row)

    return {
        "statusCode": 200,
        "headers": { "Content-Type": "application/json" },
        "data": rows
    }

@app.post("/user/<eco_id>/challenge")
def post_challenge(eco_id: str):
    # Retrive all updating user challenges
    post_data = app.current_event.json_body
    challenge_id = post_data['id']
    user_progress = post_data['user_progress']
    status = post_data['status']

    # Get corresponding challenge fields data 
    sql = """
    SELECT challenge_points,challenge_progress,challenge_frequency FROM verde.challenges WHERE challenge_id = :challenge_id
    """
    params = [
        {'name':'challenge_id', 'value':{'stringValue': challenge_id}}
    ]
    response = execute_statement(sql, params)
    challenge_points = response["records"][0][0].get("longValue")
    challenge_progress = response["records"][0][1].get("longValue")
    challenge_frequency = response["records"][0][2].get("stringValue")
    
    if user_progress == challenge_progress and status == 1:
        # Update user challenge records
        sql = """
        UPDATE verde.user_challenges 
        SET progress_count = :progress_count, last_progress_at = NOW(), completed_at = NOW(), status = "Completed"
        WHERE user_id = :user_id AND challenge_id = :challenge_id
        """
        params = [
            {'name':'user_id', 'value':{'stringValue': eco_id}},
            {'name':'challenge_id', 'value':{'stringValue': challenge_id}},
            {'name':'progress_count', 'value':{'longValue': user_progress}}
        ]
        execute_statement(sql, params)

        # Update user carbon points
        sql = """
        UPDATE verde.users
        SET carbon_point = carbon_point + :carbon_point
        WHERE id = :id
        """
        params = [
            {'name':'id', 'value':{'stringValue': eco_id}},
            {'name':'carbon_point', 'value':{'longValue': challenge_points}}
        ]
        execute_statement(sql, params)

    elif user_progress == 0 and status == 0:
        sql = """
        INSERT INTO verde.user_challenges (user_id, challenge_id, frequency, period_start, target_count, progress_count, status, started_at, last_progress_at) 
        VALUES (:user_id, :challenge_id, :frequency, last_day(curdate() - interval 1 month) + interval 1 day, :target_count, :progress_count, 'In Progress', NOW(), NOW());
        """
        params = [
            {'name':'user_id', 'value':{'stringValue': eco_id}},
            {'name':'challenge_id', 'value':{'stringValue': challenge_id}},
            {'name':'frequency', 'value':{'stringValue': challenge_frequency}},
            {'name':'target_count', 'value':{'longValue': challenge_progress}},
            {'name':'progress_count', 'value':{'longValue': user_progress}},
        ]
        execute_statement(sql, params)
    
    elif user_progress < challenge_progress and status == 0:
        sql = """
        UPDATE verde.user_challenges 
        SET progress_count = :progress_count, last_progress_at = NOW()
        WHERE user_id = :user_id AND challenge_id = :challenge_id
        """
        params = [
            {'name':'user_id', 'value':{'stringValue': eco_id}},
            {'name':'challenge_id', 'value':{'stringValue': challenge_id}},
            {'name':'progress_count', 'value':{'longValue': user_progress}}
        ]
        execute_statement(sql, params)

    else:
        return {
            "statusCode": 400,
            "headers": { "Content-Type": "application/json" },
            "message": "Invalid request"
        }
    
    return {
        "statusCode": 200,
        "headers": { "Content-Type": "application/json" },
        "message": "Success"
    }

@app.post("/user/<eco_id>/activate-challenge")
def post_activate_challenge(eco_id: str):
    # Retrive activiating user challenges
    post_data = app.current_event.json_body
    challenge_id = post_data['id']
    isActive = post_data['isActive']

    # Get corresponding challenge fields data 
    sql = """
    SELECT challenge_points,challenge_progress,challenge_frequency FROM verde.challenges WHERE challenge_id = :challenge_id
    """
    params = [
        {'name':'challenge_id', 'value':{'stringValue': challenge_id}}
    ]
    response = execute_statement(sql, params)
    challenge_points = response["records"][0][0].get("longValue")
    challenge_progress = response["records"][0][1].get("longValue")
    challenge_frequency = response["records"][0][2].get("stringValue")

    if isActive:
        # Accepting new challenge
        sql = """
        INSERT INTO verde.user_challenges (user_id, challenge_id, frequency, period_start, target_count, progress_count, status, started_at, last_progress_at) 
        VALUES (:user_id, :challenge_id, :frequency, last_day(curdate() - interval 1 month) + interval 1 day, :target_count, :progress_count, 'In Progress', NOW(), NOW());
        """
        params = [
            {'name':'user_id', 'value':{'stringValue': eco_id}},
            {'name':'challenge_id', 'value':{'stringValue': challenge_id}},
            {'name':'frequency', 'value':{'stringValue': challenge_frequency}},
            {'name':'target_count', 'value':{'longValue': challenge_progress}},
            {'name':'progress_count', 'value':{'longValue': 0}},
        ]
        execute_statement(sql, params)
    else:
        # Unaccepting challenge
        sql = """
        DELETE FROM verde.user_challenges WHERE user_id = :user_id AND challenge_id = :challenge_id
        """
        params = [
            {'name':'user_id', 'value':{'stringValue': eco_id}},
            {'name':'challenge_id', 'value':{'stringValue': challenge_id}},
        ]
        execute_statement(sql, params)

    return {
        "statusCode": 200,
        "headers": { "Content-Type": "application/json" },
        "message": "Success"
    }


def execute_statement(sql, params=None):
    response = rds_client.execute_statement(
        secretArn = db_credential_secret_store_arn,
        resourceArn = db_cluster_arn,
        sql = sql,
        parameters=params or []
    )
    return response;

def execute_statement_extract_number(sql, params=None):
    response = execute_statement(sql, params)
    field = response["records"][0][0]
    return field.get("doubleValue") or field.get("longValue") or float(field.get("stringValue"));

def execute_statement_extract_string(sql, params=None):
    response = execute_statement(sql, params)
    return response['records'][0][0]['stringValue']

def lambda_handler(event, context):
    return app.resolve(event, context)