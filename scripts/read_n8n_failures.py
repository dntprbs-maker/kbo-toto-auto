#!/usr/bin/env python3
"""n8n SQLite 복사본에서 최근 실패 실행을 읽어 간단한 JSON으로 출력한다."""

import argparse
import datetime as dt
import json
import sqlite3


def decode_flatted(text):
    values = json.loads(text)
    memo = {}

    def revive(value):
        if isinstance(value, str) and value.isdigit():
            index = int(value)
            if 0 <= index < len(values):
                return revive_index(index)
        if isinstance(value, list):
            return [revive(v) for v in value]
        if isinstance(value, dict):
            return {k: revive(v) for k, v in value.items()}
        return value

    def revive_index(index):
        if index in memo:
            return memo[index]
        source = values[index]
        if isinstance(source, dict):
            target = {}
            memo[index] = target
            target.update({k: revive(v) for k, v in source.items()})
            return target
        if isinstance(source, list):
            target = []
            memo[index] = target
            target.extend(revive(v) for v in source)
            return target
        memo[index] = source
        return source

    return revive_index(0)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('database')
    parser.add_argument('--minutes', type=int, default=180)
    parser.add_argument('--workflow', default='whXPf8lgqUAQpwp3')
    args = parser.parse_args()

    cutoff = (dt.datetime.now(dt.UTC) - dt.timedelta(minutes=args.minutes)).strftime('%Y-%m-%d %H:%M:%S')
    db = sqlite3.connect(args.database)
    rows = db.execute(
        """
        SELECT e.id, e.workflowId, e.status, e.startedAt, e.stoppedAt, d.data
        FROM execution_entity e
        LEFT JOIN execution_data d ON d.executionId = e.id
        WHERE e.workflowId = ? AND e.status = 'error' AND e.startedAt >= ?
        ORDER BY e.id DESC
        """,
        (args.workflow, cutoff),
    ).fetchall()

    output = []
    for execution_id, workflow_id, status, started_at, stopped_at, raw in rows:
        item = {
            'execution_id': execution_id,
            'workflow_id': workflow_id,
            'status': status,
            'started_at_utc': started_at,
            'stopped_at_utc': stopped_at,
        }
        if raw:
            try:
                decoded = decode_flatted(raw)
                result = decoded.get('resultData', {})
                error = result.get('error') or {}
                item.update(
                    {
                        'last_node': result.get('lastNodeExecuted'),
                        'message': error.get('message'),
                        'description': error.get('description'),
                        'line_number': error.get('lineNumber'),
                    }
                )
            except Exception as exc:  # 진단 도구 자체 실패는 원본 실행 목록을 숨기지 않는다.
                item['decode_error'] = str(exc)
        output.append(item)

    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
