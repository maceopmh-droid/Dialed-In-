#!/bin/bash
# read-only look at the server logs (counts, times, error codes; quoted values hidden): run by the diag workflow
end=$(date -u +%Y-%m-%dT%H:%M:%SZ); start=$(date -u -d "-${HOURS:-24} hours" +%Y-%m-%dT%H:%M:%SZ)
q() { curl -sS -G "https://api.supabase.com/v1/projects/$PROJECT_REF/analytics/endpoints/logs" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
        --data-urlencode "sql=$1" --data-urlencode "iso_timestamp_start=$start" --data-urlencode "iso_timestamp_end=$end" | jq -c '.result[]? // .'; }
read -r -d '' Q1 <<'SQL'
SELECT replaceRegexpAll(log_attributes['request.path'], '/[^/]*[.](jpg|jpeg|png|webp|heic)$', '/<file>') AS path,
       log_attributes['request.method'] AS m, log_attributes['response.status_code'] AS code, count() AS n,
       round(quantile(0.5)(toFloat64OrZero(log_attributes['response.origin_time']))) AS p50,
       round(quantile(0.95)(toFloat64OrZero(log_attributes['response.origin_time']))) AS p95,
       round(max(toFloat64OrZero(log_attributes['response.origin_time']))) AS mx
FROM logs WHERE source = 'edge_logs' AND log_attributes['request.method'] <> 'OPTIONS' AND (toInt32OrZero(log_attributes['response.status_code']) >= 300 OR toFloat64OrZero(log_attributes['response.origin_time']) > 1500) GROUP BY path, m, code ORDER BY code DESC, n DESC LIMIT 40
SQL
read -r -d '' Q2 <<'SQL'
SELECT log_attributes['parsed.sql_state_code'] AS code,
       left(replaceRegexpAll(replaceRegexpAll(event_message, '"[^"]*"', '<q>'), '\'[^\']*\'', '<v>'), 110) AS msg, count() AS n
FROM logs WHERE source = 'postgres_logs' AND log_attributes['parsed.error_severity'] IN ('ERROR', 'FATAL', 'PANIC')
GROUP BY code, msg ORDER BY n DESC LIMIT 30
SQL
read -r -d '' Q3 <<'SQL'
SELECT log_attributes['response.status_code'] AS code, count() AS n FROM logs WHERE source = 'function_edge_logs' GROUP BY code ORDER BY code
SQL
echo "API calls in the last ${HOURS:-24} h that failed or took over 1.5 s, by call and status (server ms p50, p95, max):"; q "$Q1"
echo "database errors in the last ${HOURS:-24} h:"; q "$Q2"
echo "edge function calls by status:"; q "$Q3"
