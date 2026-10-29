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
import random

rds_client = boto3.client('rds-data')
app = APIGatewayRestResolver(cors=CORSConfig(allow_origin="*"))

db_cluster_arn = os.environ["DB_CLUSTER_ARN"]
db_credential_secret_store_arn = os.environ["DB_SECRET_ARN"]

@app.not_found
def handle_not_found_errors(exc: NotFoundError) -> Response:
    return Response(status_code=418, content_type=content_types.TEXT_PLAIN, body="No such resource path found")

@app.get("/baseline")
def get_baseline():
    response = execute_statement('SELECT id,question_code,text_en,hint,category,input_type,options,default_option FROM verde.questions where is_active = true');
    rows = []
    for record in response['records']:
        row = {
            "question_id": record[0]['longValue'],
            "question_code": record[1]['stringValue'],
            "text_en": record[2]['stringValue'],
            "question_hint": record[3]['stringValue'],
            "category": record[4]['stringValue'],
            "input_type": record[5]['stringValue'],
            "options": json.loads(record[6]['stringValue']) if 'stringValue' in record[6] else None,
            "default_option": record[7]['stringValue'] if 'stringValue' in record[7] else None
        }
        rows.append(row)

    return {
        "statusCode": 200,
        "headers": { "Content-Type": "application/json" },
        "data": rows
    }

@app.post("/baseline")
def post_baseline():
    eco_id = str(uuid.uuid4())
    
    post_data = app.current_event.json_body
    household_size = post_data['responses'][1]['question_response']
    personal_vehicle = post_data['responses'][3]['question_response']
    baseline_monthly_energy = 0
    baseline_monthly_transport = 0
    baseline_monthly_diet = 0
    index_minus = 0

    # [question id = 1] Electricity (elec_t) (Monthly bill ÷ PRICE_KWH) × EF_GRID ÷ 1000 ÷ household_size
    # variable_1 = PRICE_KWH ; variable_2 = EF_GRID
    response = float(post_data['responses'][0]['question_response'])
    variable_1 = execute_statement_extract_number('SELECT value FROM verde.emission_factors where metric_key = "PRICE_KWH"');
    variable_2 = execute_statement_extract_number('SELECT value FROM verde.emission_factors where metric_key = "EF_GRID"');
    result = (response/variable_1) * variable_2 / 1000 / household_size
    baseline_monthly_energy += result
    # ====================================================================================================================== #

    # [question id = 3] Gas (gas_t) (Monthly bill ÷ Gas unit price) × EF_GAS ÷ 1000 ÷ household_size
    # variable_1 = PRICE_MJ ; variable_2 = EF_GAS
    response = float(post_data['responses'][2]['question_response'])
    variable_1 = execute_statement_extract_number("SELECT value FROM verde.emission_factors where metric_key = 'PRICE_MJ'")
    variable_2 = execute_statement_extract_number("SELECT value FROM verde.emission_factors where metric_key = 'EF_GAS'")
    result = (response/variable_1) * variable_2 / 1000 / household_size
    baseline_monthly_energy += result
    # ====================================================================================================================== #

    # [question id = 5 & 6] (Weekly km × 4) × EF_KM ÷ 1000
    # variable_1 = WEEKLY_KM ; variable_2 = EF_KM
    if personal_vehicle == True:
        option_1 = post_data['responses'][4]['question_response'] # How many kilometers do you drive per week? 
        option_2 = post_data['responses'][5]['question_response'] # What is your vehicle's fuel type?
        sql = """
            SELECT value FROM verde.mapping_table where label = :lb
        """

        # Get WEEKLY_KM
        params = [
            {'name':'lb', 'value':{'stringValue': option_1}}
        ]
        variable_1 = execute_statement_extract_number(sql, params)

        # Get EF_KM
        params = [
            {'name':'lb', 'value':{'stringValue': option_2}}
        ]
        variable_2 = execute_statement_extract_number(sql, params)

        # Get Result
        result = variable_1 * 4 * variable_2 / 1000
        baseline_monthly_transport += result

    else:
        # Fix index if questions are skipped
        index_minus += 2 if len(post_data['responses']) < 9 else 0
    # ====================================================================================================================== #

    # [question id = 9]  (pkm/week × 4 × EF_PKM) ÷ 1000
    # variable_1 = PKM_WEEK ; variable_2 = EF_PKM
    option_1 = post_data['responses'][6-index_minus]['question_response'] # How often do you use public transport?
    sql = """
        SELECT value FROM verde.mapping_table where code = :lb AND domain = 'pt_freq'
    """

    # Get PKM_WEEK
    params = [
        {'name':'lb', 'value':{'stringValue': option_1}}
    ]
    variable_1 = execute_statement_extract_number(sql, params)

    # Get EF_PKM (not in db)
    variable_2 = 0.0 if variable_1 == 'none' else (0.061 if variable_1 == 'occasional' else (0.153 if variable_1 == 'regular' else 0.3))

    # Get Result
    result = variable_1 * 4 * variable_2 / 1000
    baseline_monthly_transport += result
    # ====================================================================================================================== #

    # [question id = 12 & 13] (Weekly spend ÷ household_size × 4 × EF_DOLLAR) ÷ 1000
    # variable_1 = WEEKLY_SPEND ; variable_2 = EF_DOLLAR
    variable_1 = float(post_data['responses'][7-index_minus]['question_response']) # How much is your weekly spend on groceries?
    option_1 = post_data['responses'][8-index_minus]['question_response'] # Type of Diet
    sql = """
        SELECT value FROM verde.mapping_table where label = :lb AND domain = 'diet_style'
    """

    # Get EF_DOLLAR
    params = [
        {'name':'lb', 'value':{'stringValue': option_1}}
    ]
    variable_2 = execute_statement_extract_number(sql, params)

    # Get Result
    result = variable_1 / household_size * 4 * variable_2 / 1000
    baseline_monthly_diet += result
    # ====================================================================================================================== #

    # Rounding sum of monthly baseline to 3 decimal places
    baseline_monthly = round(sum([baseline_monthly_energy, baseline_monthly_transport, baseline_monthly_diet]), 3)

    # Create User & Store into table verde.users
    sql = """
        INSERT INTO verde.users (id, baseline_daily, baseline_monthly_energy, baseline_monthly_transport, baseline_monthly_diet, baseline_yearly, created_at, updated_at, carbon_point)
        VALUES (:id, :bd, :bm_e, :bm_t, :bm_d, :by, NOW(), NOW(), :pt)
    """
    params = [
        {'name': 'id', 'value': {'stringValue': eco_id}},
        {'name': 'bd', 'value': {'doubleValue': float(0.0)}},
        {'name': 'bm_e', 'value': {'doubleValue': float(baseline_monthly_energy)}},
        {'name': 'bm_t', 'value': {'doubleValue': float(baseline_monthly_transport)}},
        {'name': 'bm_d', 'value': {'doubleValue': float(baseline_monthly_diet)}},
        {'name': 'by', 'value': {'doubleValue': float(baseline_monthly)}},
        {'name': 'pt', 'value': {'longValue': 0}}
    ]
    execute_statement(sql, params)

    return {
        "statusCode": 201,
        "headers": { "Content-Type": "application/json" },
        "data": {
            "eco_id": eco_id,
            "Baseline": baseline_monthly
        }
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

def execute_statement_extract_string(sql):
    response = execute_statement(sql)
    return response['records'][0][0]['stringValue']

def lambda_handler(event, context):
    return app.resolve(event, context)