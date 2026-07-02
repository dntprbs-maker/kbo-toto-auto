import pandas as pd
import json
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
file_path = "N:/개인/이미지올리기/KBO_토토_기록부_2026-1.xlsx"

try:
    xls = pd.ExcelFile(file_path)
    print("Sheets:", xls.sheet_names)
    
    if len(xls.sheet_names) > 1:
        df = pd.read_excel(xls, sheet_name=xls.sheet_names[1])
        print("Columns:", list(df.columns))
        print(df.head(10).to_string())
except Exception as e:
    print(e)
