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
from datetime import datetime, date 
from zoneinfo import ZoneInfo

rds_client = boto3.client('rds-data')
app = APIGatewayRestResolver(cors=CORSConfig(allow_origin="*"))

db_cluster_arn = os.environ["DB_CLUSTER_ARN"]
db_credential_secret_store_arn = os.environ["DB_SECRET_ARN"]

@app.not_found
def handle_not_found_errors(exc: NotFoundError) -> Response:
    return Response(status_code=418, content_type=content_types.TEXT_PLAIN, body="No such resource path found")

@app.get("/user")
def get_all_user():
    sql = """
    SELECT id FROM verde.users
    """
    response = execute_statement(sql)
    return {
        "statusCode": 200,
        "headers": { "Content-Type": "application/json" },
        "data": { 
            "eco_id": [item[0]['stringValue'] for item in response['records']]
        }
    }

@app.get("/user/<eco_id>")
def get_user(eco_id: str):
    TZ = ZoneInfo("Australia/Melbourne")

    sql = """
    SELECT id, baseline_daily, baseline_monthly_energy, baseline_monthly_transport, baseline_monthly_diet, baseline_yearly, carbon_point, CAST(created_at AS DATE) FROM verde.users where id = :eco_id
    """
    params = [
        {'name':'eco_id', 'value':{'stringValue': eco_id}}
    ]
    response = execute_statement(sql, params)

    #Get all user active challenges
    sql = """
    SELECT id, user_id, challenge_id, status FROM verde.user_challenges where user_id = :eco_id AND status = 'In Progress'
    """
    params = [
        {'name':'eco_id', 'value':{'stringValue': eco_id}}
    ]
    active_challenge_response = execute_statement(sql, params)
    active_challenge_list = []
    for challenge in active_challenge_response['records']:
        active_challenge_list.append(challenge[2]['stringValue'])

    #Get user daily tracking emissions
    sql = """
    SELECT COALESCE(SUM(total_kg),0) FROM verde.daily_logs WHERE user_id = :eco_id AND log_date = CURDATE()
    """
    params = [
        {'name':'eco_id', 'value':{'stringValue': eco_id}}
    ]
    daily_emissions_response = execute_statement(sql, params)

    # Get user weekly tracking emissions (Last 7 days)
    sql = """
    SELECT COALESCE(SUM(total_kg), 0) AS week_total
    FROM verde.daily_logs
    WHERE user_id = :eco_id
    AND log_date BETWEEN DATE_SUB(CURDATE(), INTERVAL 6 DAY) AND CURDATE()
    """
    params = [{'name':'eco_id', 'value':{'stringValue': eco_id}}]
    weekly_emissions_response = execute_statement(sql, params)

    #Get user monthly tracking emissions
    sql = """
    SELECT COALESCE(SUM(total_kg), 0) AS month_total FROM verde.daily_logs WHERE user_id = :eco_id AND log_date BETWEEN DATE_FORMAT(CURDATE(), '%Y-%m-01') AND LAST_DAY(CURDATE())
    """
    params = [
        {'name':'eco_id', 'value':{'stringValue': eco_id}}
    ]
    monthly_emissions_response = execute_statement(sql, params)

    #Get user yearly tracking emissions
    sql = """
    SELECT COALESCE(SUM(total_kg), 0) AS year_total FROM verde.daily_logs WHERE user_id = :eco_id AND log_date BETWEEN DATE_FORMAT(CURDATE(), '%Y-01-01') AND LAST_DAY(DATE_FORMAT(CURDATE(), '%Y-12-01'))
    """
    params = [
        {'name':'eco_id', 'value':{'stringValue': eco_id}}
    ]
    yearly_emissions_response = execute_statement(sql, params)
    
    if len(response['records']) == 0:
        return {
            "statusCode": 200,
            "headers": { "Content-Type": "application/json" },
            "message": "User does not exist."
        }

    # Baseline emission returns if same month
    user_created_at = response['records'][0][7]['stringValue']
    user_created_dt  = datetime.strptime(user_created_at, "%Y-%m-%d").date()
    now_local = datetime.now(TZ).date()
    return_baseline_flag = (user_created_dt.year == now_local.year and user_created_dt.month == now_local.month)

    # Calculate monthly emission
    if return_baseline_flag:
        user_baseline_monthly = round(sum([float(response['records'][0][2]['stringValue']),float(response['records'][0][3]['stringValue']),float(response['records'][0][4]['stringValue']),float(monthly_emissions_response['records'][0][0]['stringValue'])]),3)
    else:
        user_baseline_monthly = round(float(monthly_emissions_response['records'][0][0]['stringValue']),3)

    # Calculate yearly emission
    user_baseline_yearly = round(sum([float(response['records'][0][2]['stringValue']),float(response['records'][0][3]['stringValue']),float(response['records'][0][4]['stringValue']),float(yearly_emissions_response['records'][0][0]['stringValue'])]),3)

    return {
        "statusCode": 200,
        "headers": { "Content-Type": "application/json" },
        "data": {
            "eco_id": response['records'][0][0]['stringValue'],
            "user_baseline_daily": round(float(daily_emissions_response['records'][0][0]['stringValue']),3),
            "user_baseline_weekly": round(float(weekly_emissions_response['records'][0][0]['stringValue']), 3),
            "user_baseline_monthly": user_baseline_monthly,
            "user_baseline_yearly": user_baseline_yearly,
            "user_carbon_point": int(response['records'][0][6]['longValue']),
            "user_active_challenge": active_challenge_list
        }
    }

@app.get("/user/<eco_id>/dailysnapshot")
def get_dailysnapshot(eco_id: str):
    sql = """
    SELECT
      COALESCE(SUM(transport_kg), 0) AS transport,
      COALESCE(SUM(diet_kg), 0)      AS meals,
      COALESCE(SUM(shopping_kg), 0)  AS shopping,
      COALESCE(SUM(energy_kg), 0)    AS energy
    FROM verde.daily_logs
    WHERE user_id = :eco_id
      AND log_date = CURDATE()
    """
    params = [{'name':'eco_id', 'value':{'stringValue': eco_id}}]
    res = execute_statement(sql, params)

    def _num(cell, default=0.0):
        if not cell: return default
        return cell.get("doubleValue") or cell.get("longValue") or float(cell.get("stringValue", default))

    row = res["records"][0] if res.get("records") else []
    totals = {
        "transport": _num(row[0], 0.0),
        "meals":     _num(row[1], 0.0),
        "shopping":  _num(row[2], 0.0),
        "energy":    _num(row[3], 0.0),
    }

    return {
        "statusCode": 200,
        "headers": { "Content-Type": "application/json" },
        "data": {
            "date": date.today().strftime("%Y-%m-%d"),
            "totals_kg": {k: round(v, 3) for k, v in totals.items()}
        }
    }

@app.get("/user/<eco_id>/weeklysnapshot")
def get_weeklysnapshot(eco_id: str):
    sql = """
    WITH RECURSIVE d AS (
      SELECT CURDATE() AS dt
      UNION ALL
      SELECT dt - INTERVAL 1 DAY FROM d
      WHERE dt > CURDATE() - INTERVAL 6 DAY
    )
    SELECT
      d.dt AS log_date,
      COALESCE(SUM(dl.energy_kg + dl.transport_kg + dl.diet_kg + dl.shopping_kg), 0) AS total_kg
    FROM d
    LEFT JOIN verde.daily_logs dl
      ON dl.user_id = :eco_id
     AND dl.log_date = d.dt
    GROUP BY d.dt
    ORDER BY d.dt;
    """
    params = [{'name': 'eco_id', 'value': {'stringValue': eco_id}}]
    response = execute_statement(sql, params)

    series = []
    for record in response.get('records', []):
        total_cell = record[1]
        total = (total_cell.get('doubleValue')
                 or total_cell.get('longValue')
                 or float(total_cell.get('stringValue')))
        series.append(round(float(total), 3))

    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "data": series
    }

    
@app.get("/user/<eco_id>/monthlysnapshot")
def get_monthlysnapshot(eco_id: str):
    sql = """
    SELECT id, baseline_monthly_energy, baseline_monthly_transport, baseline_monthly_diet FROM verde.users where id = :eco_id
    """
    params = [
        {'name':'eco_id', 'value':{'stringValue': eco_id}}
    ]

    response = execute_statement(sql, params)
    if len(response['records']) == 0:
        return {
            "statusCode": 200,
            "headers": { "Content-Type": "application/json" },
            "message": "User does not exist."
        }
    else:
        return {
            "statusCode": 200,
            "headers": { "Content-Type": "application/json" },
            "data": {
                "eco_id": response['records'][0][0]['stringValue'],
                "user_baseline_monthly_energy": round(float(response['records'][0][1]['stringValue']),3),
                "user_baseline_monthly_transport": round(float(response['records'][0][2]['stringValue']),3),
                "user_baseline_monthly_diet": round(float(response['records'][0][3]['stringValue']),3)
            }
        }

@app.get("/tips")
def get_tips():
    response = execute_statement_extract_string('SELECT body FROM verde.tips ORDER BY RAND() LIMIT 1');
    return {
        "statusCode": 200,
        "headers": { "Content-Type": "application/json" },
        "data": {
            "tip": response
        }
    }

def cell_to_float(cell, default=0.0):
    if not cell or cell.get('isNull'): return default
    if 'doubleValue' in cell: return float(cell['doubleValue'])
    if 'longValue' in cell: return float(cell['longValue'])
    if 'stringValue' in cell and cell['stringValue'] is not None:
        try: return float(cell['stringValue'])
        except ValueError: return default
    return default

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