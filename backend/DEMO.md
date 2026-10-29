# Verde demo runbook

Backend: account `<ACCOUNT_ID>`, region **ap-southeast-2 (Sydney)**, stack `verde-backend`.
API: `https://ipg9jzatg7.execute-api.ap-southeast-2.amazonaws.com/dev`

## Start the app
```
cd Verde-dev
npx expo start --web --port 8081      # open http://localhost:8081
```
`.env` already points `API_BASE_URL` at the API above.

## AWS console tabs (open each in Sydney; the profile default region is us-east-1, so check the region selector)
| Tab | What to show |
|---|---|
| API Gateway > `verde-api` > Stages > `dev` | Routes, the `VerdeJwtAuthorizer`, public routes vs authorised routes |
| Lambda > Functions (`verde-*`) | One function per concern; open `verde-tracking` > Monitor > Logs to see live invocations |
| CloudWatch > Log groups > `/aws/lambda/verde-tracking` | Log lines appearing as you tap in the app |
| RDS > Query editor (or `verde-db` > Monitoring) | Connect with the Secrets Manager secret `rds!cluster-...`, database `verde`, then `SELECT * FROM daily_logs ORDER BY log_date DESC` to show rows landing live |
| Secrets Manager | `verde/jwt-private-key` (signs tokens) and the RDS-managed DB credential |
| CloudFormation > `verde-backend` | The whole backend as one stack (Resources / Outputs tabs) |

## Suggested flow (about 5 minutes)
1. **Onboarding**: answer the questionnaire (answer *yes* to driving to show the full path). Show `POST /baseline` and the new row in `users`.
2. **Dashboard**: baseline and snapshots load via `/token` then the authorised `/user/{id}` routes. Show the authorizer allowing the call.
3. **Tracking**: log a transport trip or a meal. Show the `daily_logs` row update in the query editor and the log line in CloudWatch.
4. **Challenges**: accept one, then complete it. Show `user_challenges` and points rising in `users.carbon_point`.
5. **Learn**: articles and the quiz (public routes, no token).
6. **Security point**: call an authorised route without a token (`curl` the API), and show the 401.

Ready-made user with a week of history (sign in with this eco id): `0f3a7c2e-6b1d-4e8a-9c55-2d7b8e1a4f60`.

## Useful queries
```sql
SELECT id, carbon_point, baseline_yearly FROM users;
SELECT user_id, log_date, transport_kg, diet_kg, shopping_kg, energy_kg, total_kg FROM daily_logs ORDER BY log_date DESC LIMIT 10;
SELECT user_id, challenge_id, progress_count, target_count, status FROM user_challenges;
```

## Known limits
- `/sendemail` fails until `verde.techtitan.cs@gmail.com` (or a new sender via the `SenderEmail` parameter) is a verified SES identity. The app does not call it.
- "Today" is the UTC date (Lambda and Aurora run in UTC), so late-evening Australian activity can land on the previous day's snapshot.
- Any signed-in user can read any `eco_id`'s data, as in the original design. Fine for a demo, not for production.

## Cost and teardown
Aurora Serverless v2 at 0.5-2 ACUs costs roughly US$2/day while it exists.
```
AWS_PROFILE=fresh-deploy AWS_REGION=ap-southeast-2 backend/scripts/teardown.sh
```
Redeploy any time with `backend/scripts/deploy.sh` (same env vars). A redeploy gives a new API id, so update `API_BASE_URL` in `.env` and the fallback in `app/(tabs)/LearningPage.js`.
