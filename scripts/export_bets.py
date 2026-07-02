import pandas as pd
import json
import io
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
file_path = "N:/개인/이미지올리기/KBO_토토_기록부_2026-1.xlsx"

try:
    xls = pd.ExcelFile(file_path)
    df = pd.read_excel(xls, sheet_name=xls.sheet_names[1])
    # The first row contains the actual headers, but the 0th row might be the title. Let's see.
    # We'll just export raw to JSON
    df.to_json('bets_out.json', orient='records', force_ascii=False)
    print("Exported bets_out.json")
except Exception as e:
    print("Error:", e)
