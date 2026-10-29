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

# Fixed tracking activities (Not in database)
ACTIVITY_LIST = """
[
    {
        "activity_name": "transport",
        "sub_category": true,
        "activity_category": [
            {
                "Road Transport": ["Diesel car", "Petrol car", "Electric car", "Plug-in hybrid", "Motorbike"], 
                "Air Transport": ["Short-haul flight", "Long-haul flight"], 
                "Public Transport": ["Train", "Bus"]
            }
        ]
    },
    {
        "activity_name": "diet",
        "sub_category": false,
        "activity_category": ["Vegan","Vegetarian","Flexitarian","Omnivore","Heavy Meat"]
    },
    {
        "activity_name": "shopping",
        "sub_category": true,
        "activity_category": [
            {
                "Clothing & Footwear": ["$0-$50", "$51-$150", "$151-$300", "$301+"],
                "Electronics": ["<$500", "$500-$1,000", "$1,001-$2,000", "$2,001+"]
            }
        ]
    },
    {
        "activity_name": "energy",
        "sub_category": false,
        "activity_category": ["Electricity Bill","Gas Bill"]
    }
]
"""

@app.not_found
def handle_not_found_errors(exc: NotFoundError) -> Response:
    return Response(status_code=418, content_type=content_types.TEXT_PLAIN, body="No such resource path found")

@app.get("/user/<eco_id>/tracking")
def get_tracking(eco_id: str):
    return {
        "statusCode": 200,
        "headers": { "Content-Type": "application/json" },
        "data": json.loads(ACTIVITY_LIST)
    }

@app.post("/user/<eco_id>/tracking")
def post_tracking(eco_id: str):
    post_data = app.current_event.json_body
    activity_name = post_data['activity_name']
    items = post_data['items']
    
    # Calculate according to activity
    transport_emission = 0.0
    diet_emission = 0.0
    shopping_emission = 0.0
    energy_emission = 0.0
    total_emission = 0.0

    match activity_name:
        case "transport":
            # Activity name corresponding domain & code
            activity_code_dict = {
                "Diesel car": ["fuel_type", "diesel"],
                "Petrol car": ["fuel_type", "petrol"],
                "Electric car": ["fuel_type", "ev"],
                "Plug-in hybrid": ["fuel_type", "hybrid"],
                "Motorbike": ["transport_type", "motorbike"],
                "Short-haul flight": ["flight_type", "short_haul"],
                "Long-haul flight": ["flight_type", "long_haul"],
                "Train": ["transport_type", "train"],
                "Bus": ["transport_type", "bus"]
            }
            transport_emission = calculate_emission(activity_code_dict, items)

        case "diet":
            # Activity name corresponding domain & code
            activity_code_dict = {
                "vegan": ["diet_style", "Vegan"],
                "vegetarian": ["diet_style", "VEG"],
                "flexitarian": ["diet_style", "FLEX"],
                "omnivore": ["diet_style", "OMNI"],
                "heavy-meat": ["diet_style", "MEAT"]
            }
            diet_emission = calculate_emission(activity_code_dict, items)

        case "shopping":
            # Activity name corresponding domain & code
            activity_code_dict = {
                "Clothing & Footwear": {
                    "$0-$50": ["clothes", "m0_50"],
                    "$51-$150": ["clothes", "m51_150"],
                    "$151-$300": ["clothes", "m151_300"],
                    "$301+": ["clothes", "m301p"]
                },
                "Electronics": {
                    "<$500": ["electronics", "ylt500"],
                    "$500-$1,000": ["electronics", "y500_1000"],
                    "$1,001-$2,000": ["electronics", "y1001_2000"],
                    "$2,001+": ["electronics", "y2001p"]
                }
            }
            shopping_emission = calculate_emission(activity_code_dict, items, layered = True) / 12

        case "energy":
            # Activity name corresponding calculation variable
            activity_code_dict = {
                "Electricity Bill": ["PRICE_KWH", "EF_GRID"],
                "Gas Bill": ["PRICE_MJ", "EF_GAS"]
            }
            energy_emission = calculate_emission(activity_code_dict, items, energy = True)

        case _:
            return {
                "statusCode": 400,
                "headers": { "Content-Type": "application/json" },
                "message": "Invalid activity name"
            }
    total_emission = transport_emission + diet_emission + shopping_emission + energy_emission

    # Reward Points
    sql = """
    SELECT points FROM verde.points_policy where category = :category
    """
    params = [
        {'name':'category', 'value':{'stringValue': activity_name}}
    ]
    reward_points = execute_statement_extract_number(sql, params)

    # Insert/Update into user daily logs
    sql = """
    INSERT INTO verde.daily_logs (user_id, log_date, energy_kg, transport_kg, diet_kg, shopping_kg) 
    VALUES (:user_id, DATE(NOW()), :energy_kg, :transport_kg, :diet_kg, :shopping_kg)
    ON DUPLICATE KEY UPDATE
        energy_kg = energy_kg + :energy_kg,
        transport_kg = transport_kg + :transport_kg,
        diet_kg = diet_kg + :diet_kg,
        shopping_kg = shopping_kg + :shopping_kg
    """
    params = [
        {'name':'user_id', 'value':{'stringValue': eco_id}},
        {'name':'energy_kg', 'value':{'doubleValue': float(energy_emission)}},
        {'name':'transport_kg', 'value':{'doubleValue': float(transport_emission)}},
        {'name':'diet_kg', 'value':{'doubleValue': float(diet_emission)}},
        {'name':'shopping_kg', 'value':{'doubleValue': float(shopping_emission)}}
    ]
    execute_statement(sql, params)

    # Update user profile
    sql = """
    UPDATE verde.users
    SET carbon_point = carbon_point + :carbon_point, 
        baseline_daily = baseline_daily + :baseline_daily, 
        baseline_yearly = baseline_yearly + :baseline_yearly,
        baseline_monthly_energy = baseline_monthly_energy + :baseline_monthly_energy,
        baseline_monthly_transport = baseline_monthly_transport + :baseline_monthly_transport,
        baseline_monthly_diet = baseline_monthly_diet + :baseline_monthly_diet
    WHERE id = :id
    """
    params = [
        {'name':'id', 'value':{'stringValue': eco_id}},
        {'name':'carbon_point', 'value':{'longValue': reward_points}},
        {'name':'baseline_daily', 'value':{'doubleValue': float(total_emission)}},
        {'name':'baseline_yearly', 'value':{'doubleValue': float(total_emission)}},
        {'name':'baseline_monthly_energy', 'value':{'doubleValue': float(energy_emission)}},
        {'name':'baseline_monthly_transport', 'value':{'doubleValue': float(transport_emission)}},
        {'name':'baseline_monthly_diet', 'value':{'doubleValue': float(diet_emission)}}
    ]

    execute_statement(sql, params)

    return {
        "statusCode": 200,
        "headers": { "Content-Type": "application/json" },
        "message": "Success"
    }

def calculate_emission(activity_code_dict, items, layered = False, energy = False):
    # Calculation helper
    total_emission = 0
    items_list = list(items.keys())

    for item in items_list:
        if layered:
            sql = """
            SELECT value FROM verde.mapping_table WHERE domain = :domain AND code = :code
            """
            params = [
                {'name':'domain', 'value':{'stringValue': activity_code_dict[item][items[item]][0]}},
                {'name':'code', 'value':{'stringValue': activity_code_dict[item][items[item]][1]}}
            ]
            value = execute_statement_extract_number(sql, params)
            total_emission += value/12

        elif energy:
            sql = """
            SELECT metric_key, value FROM verde.emission_factors
            """
            response = execute_statement(sql)

            # Getting calcuation variable value from DB
            required_variable = activity_code_dict[item]
            calculation_vatiables = []
            for record in response['records']:
                if record[0]['stringValue'] in required_variable:
                    calculation_vatiables.append(float(record[1]['stringValue']))
            
            total_emission = items[item] / calculation_vatiables[0] * calculation_vatiables[1] / 1000

        else:
            sql = """
            SELECT value FROM verde.mapping_table WHERE domain = :domain AND code = :code
            """
            params = [
                {'name':'domain', 'value':{'stringValue': activity_code_dict[item][0]}},
                {'name':'code', 'value':{'stringValue': activity_code_dict[item][1]}}
            ]
            value = execute_statement_extract_number(sql, params)
            total_emission += items[item] * value
        
    return total_emission

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
