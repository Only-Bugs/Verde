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

rds_client = boto3.client('rds-data')
app = APIGatewayRestResolver(cors=CORSConfig(allow_origin="*"))

db_cluster_arn = os.environ["DB_CLUSTER_ARN"]
db_credential_secret_store_arn = os.environ["DB_SECRET_ARN"]

@app.not_found
def handle_not_found_errors(exc: NotFoundError) -> Response:
    return Response(status_code=418, content_type=content_types.TEXT_PLAIN, body="No such resource path found")

@app.get("/articles")
def get_articles():
    sql = "SELECT article_id,title,author,source_url,summary,reading_time_minutes,published_date,is_featured,image_url FROM verde.articles"
    response = execute_statement(sql)
    rows = []
    for record in response['records']:
        row = {
            "article_id": record[0]['stringValue'],
            "title": record[1]['stringValue'],
            "author": record[2]['stringValue'],
            "source_url": record[3]['stringValue'],
            "summary": record[4]['stringValue'],
            "reading_time_minutes": record[5]['longValue'],
            "published_date": record[6]['stringValue'],
            "is_featured": record[7]['booleanValue'],
            # image_url is nullable: the Data API returns {'isNull': True} with no stringValue
            "image_url": record[8].get('stringValue')
        }
        rows.append(row)

    return {
        "statusCode": 200,
        "headers": { "Content-Type": "application/json" },
        "data": rows
    }

@app.get("/quiz")
def get_quiz():
    sql = """
    WITH ranked_q AS (
      SELECT
        t.name,
        t.description,
        q.id AS quiz_ques_id,
        q.stem_text AS quiz_ques_text,
        ROW_NUMBER() OVER (
          PARTITION BY t.id
          ORDER BY q.bank_batch, q.seq_order, CAST(q.id AS UNSIGNED), q.id
        ) AS rn
      FROM verde.quiz_topic t
      JOIN verde.quiz_question q
        ON q.topic_id = t.id
      WHERE q.status = 'published'
    ),
    ranked_o AS (
      SELECT
        o.question_id,
        o.id AS opt_id,
        o.option_text,
        o.is_correct,
        o.explanation,
        ROW_NUMBER() OVER (
          PARTITION BY o.question_id
          ORDER BY CAST(o.id AS UNSIGNED), o.id
        ) AS rn_opt
      FROM verde.quiz_option o
    )
    SELECT
      rq.name,                 -- 0 topic name
      rq.description,          -- 1 topic description
      rq.quiz_ques_id,         -- 2 question id
      rq.quiz_ques_text,       -- 3 question text
      ro.opt_id,               -- 4 option id
      ro.option_text,          -- 5 option text
      ro.is_correct,           -- 6 is_correct
      ro.explanation           -- 7 explanation
    FROM ranked_q rq
    LEFT JOIN ranked_o ro
      ON ro.question_id = rq.quiz_ques_id AND ro.rn_opt <= 4
    WHERE rq.rn <= 10
    ORDER BY
      rq.name,
      CAST(rq.quiz_ques_id AS UNSIGNED), rq.quiz_ques_id,
      CAST(ro.opt_id AS UNSIGNED), ro.opt_id;
    """
    response_topic = execute_statement(sql)
    topics = {}
    for record in response_topic['records']:
        topic_name        = record[0]['stringValue']
        topic_description = record[1]['stringValue']
        quiz_ques_id      = record[2]['stringValue']
        quiz_ques_text    = record[3]['stringValue']

        # Ensure topic exists
        if topic_name not in topics:
            topics[topic_name] = {
                "topic_name": topic_name,
                "topic_description": topic_description,
                "questions": []
            }

        # Ensure question exists
        if "_index" not in topics[topic_name]:
            topics[topic_name]["_index"] = {}
        q_index = topics[topic_name]["_index"]

        if quiz_ques_id not in q_index:
            q_obj = {
                "quiz_ques_id": quiz_ques_id,
                "quiz_ques_text": quiz_ques_text,
                "options": []
            }
            topics[topic_name]["questions"].append(q_obj)
            q_index[quiz_ques_id] = q_obj
        else:
            q_obj = q_index[quiz_ques_id]

        # Option columns may be NULL due to LEFT JOIN
        opt_id_cell = record[4]
        if not opt_id_cell.get('isNull'):
            opt_id         = opt_id_cell['stringValue']          # opt_id is varchar
            option_text    = record[5]['stringValue'] if not record[5].get('isNull') else ""
            is_correct_cell = record[6]
            if 'longValue' in is_correct_cell:
                is_correct = int(is_correct_cell['longValue'])
            elif 'booleanValue' in is_correct_cell:
                is_correct = 1 if is_correct_cell['booleanValue'] else 0
            elif 'stringValue' in is_correct_cell:
                s = (is_correct_cell['stringValue'] or "").strip().lower()
                is_correct = 1 if s in ("1","true","t","yes","y") else 0
            else:
                is_correct = 0
            explanation    = record[7]['stringValue'] if not record[7].get('isNull') else None

            q_obj["options"].append({
                "quiz_option_id": opt_id,
                "quiz_option_text": option_text,
                "quiz_option_is_correct": is_correct,
                "quiz_option_explanation": explanation
            })

    # Strip helper indices before returning
    rows = []
    for t in topics.values():
        t.pop("_index", None)
        rows.append(t)

    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "data": rows
    }

@app.get("/rewards")
def get_rewards():
    response = execute_statement("SELECT category, action, points FROM verde.points_policy")
    rows = [
        {
            "category": r[0]['stringValue'],
            "action": r[1]['stringValue'],
            "points": r[2]['longValue']
        }
        for r in response['records']
    ]

    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "data": rows
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