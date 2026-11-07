#!/usr/bin/env bash
# End-to-end check against a running stack (docker compose up).
# Verifies: simulator -> OPC UA -> collector -> DB -> rules -> API -> assistant.
set -euo pipefail
BASE="${BASE_URL:-http://localhost:3000}"

wait_for() {  # wait_for <description> <seconds> <command...>
  local what=$1 secs=$2; shift 2
  for _ in $(seq "$secs"); do
    if "$@" >/dev/null 2>&1; then echo "ok  - $what"; return 0; fi
    sleep 1
  done
  echo "FAIL - $what"; return 1
}

# Small checks used with wait_for.
all_live()      { [ "$(curl -fsS "$BASE/api/machines" | jq '[.[] | select(.status=="RUNNING" or .status=="FAULTED")] | length')" = 3 ]; }
open_alert()    { curl -fsS "$BASE/api/alerts?open=true" | jq -e --arg m "$1" --arg t "$2" '.[] | select(.machineId==$m and .type==$t)'; }
machine_is()    { curl -fsS "$BASE/api/machines/$1" | jq -e --arg s "$2" '.status==$s'; }
history_ok()    { curl -fsS "$BASE/api/machines/SRT-02/readings?minutes=5" | jq -e 'length > 10'; }
stats_ok()      { curl -fsS "$BASE/api/stats?hours=1" | jq -e '.machines | length == 3'; }
fault_code_is() { curl -fsS "$BASE/api/alerts?open=true" | jq -e --arg m "$1" --arg c "$2" '.[] | select(.machineId==$m and .type=="FAULT" and .faultCode==$c)'; }

wait_for "API is up" "${API_WAIT_SECONDS:-120}" curl -fsS "$BASE/api/machines"
wait_for "all 3 machines streaming live data over OPC UA" 90 all_live

curl -fsS -X POST "$BASE/api/demo/inject/INS-01/jam" | jq -c .
wait_for "jam on INS-01 opens a FAULT alert with code E-042" 20 fault_code_is INS-01 E-042
wait_for "INS-01 shows as FAULTED" 10 machine_is INS-01 FAULTED

curl -fsS -X POST "$BASE/api/demo/inject/LBL-03/dropout" >/dev/null
wait_for "sensor dropout on LBL-03 opens SENSOR_FAILURE" 20 open_alert LBL-03 SENSOR_FAILURE

ANSWER=$(curl -fsS -X POST "$BASE/api/assistant/ask" -H 'Content-Type: application/json' \
  -d '{"question":"What should I check?","machineId":"INS-01"}')
if echo "$ANSWER" | jq -e '.sources[0].heading | test("E-042")' >/dev/null; then
  echo "ok  - assistant uses the live fault code to find the E-042 procedure"
else
  echo "FAIL - assistant did not return the E-042 procedure: $ANSWER"; exit 1
fi

wait_for "readings history available" 30 history_ok
wait_for "stats endpoint reports availability" 5 stats_ok
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
ID=$(curl -fsS -X POST "$BASE/api/fault-log" -H 'Content-Type: application/json' \
  -d "{\"machineName\":\"E2E Inserter\",\"fault\":\"Jam\",\"occurredAt\":\"$NOW\",\"minutesDown\":7}" | jq -r .id)
if curl -fsS "$BASE/api/fault-log/summary?days=1" | jq -e '.byMachine[] | select(.name=="E2E Inserter" and .minutesDown==7)' >/dev/null; then
  echo "ok  - manual fault logged and counted in downtime"
else
  echo "FAIL - logged fault missing from summary"; exit 1
fi
curl -fsS -X DELETE "$BASE/api/fault-log/$ID" && echo "ok  - logged fault deleted"
echo "All end-to-end checks passed."
