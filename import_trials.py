"""
Excel 試験計画データを Supabase にインポートするスクリプト
対象: 嗜好試験計画＆RDC原料管理表(202406~).xlsx
"""
import openpyxl
import requests
import json
import re
import sys
from datetime import datetime, date

SUPABASE_URL = "https://lenidmfcvgpqvwobnepo.supabase.co"
SERVICE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxlbmlkbWZjdmdwcXZ3b2JuZXBvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzQ3NzI0MSwiZXhwIjoyMDkzMDUzMjQxfQ.ZrEnU40MeqPRijY-QxlWlaWsfGHgOh7RF4TejQIIHbk"
EXCEL_PATH   = "/Users/kataokaosamu/Desktop/日誌/嗜好試験計画＆RDC原料管理表(202406~).xlsx"

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}


def sb_insert(table, rows):
    r = requests.post(f"{SUPABASE_URL}/rest/v1/{table}", headers=HEADERS, json=rows, timeout=30)
    if r.status_code not in (200, 201):
        print(f"  ERROR {r.status_code}: {r.text[:200]}")
        return []
    return r.json()


def parse_date_label(val):
    """試験日ラベルから start/end/label を返す"""
    if val is None:
        return None, None, None
    if isinstance(val, (datetime, date)):
        d = val.date() if isinstance(val, datetime) else val
        label = d.strftime("%Y-%m-%d")
        return d, d, label
    s = str(val).strip()
    if not s or s in ('#VALUE!', '#N/A', 'None'):
        return None, None, None
    # "20240528-29" → 2024-05-28 ～ 2024-05-29
    m = re.match(r'(\d{4})(\d{2})(\d{2})-(\d+)([a-zA-Z]?)$', s)
    if m:
        y, mo, d1, d2, suffix = m.groups()
        try:
            start = date(int(y), int(mo), int(d1))
            end   = date(int(y), int(mo), int(d2))
            return start, end, s
        except ValueError:
            pass
    # "2025-03-17" 形式
    m2 = re.match(r'(\d{4})-(\d{2})-(\d{2})', s)
    if m2:
        try:
            d = date(int(m2.group(1)), int(m2.group(2)), int(m2.group(3)))
            return d, d, s
        except ValueError:
            pass
    return None, None, s


def clean_text(val):
    if val is None: return None
    s = str(val).strip()
    return None if s in ('', 'None', '#VALUE!', '#N/A') else s


def parse_num(val):
    if val is None: return None
    try:
        f = float(val)
        return f if f == f else None  # NaN check
    except (ValueError, TypeError):
        return None


def import_sheet(ws, species, default_location, data_start_row, summary_col_values):
    """
    シートの行を走査して pal_trials + pal_trial_ingredients を投入する。
    summary_col_values: '概要' にマッチする値のセット (ソート列 index=4)
    """
    trials_ok = 0
    ings_ok   = 0
    current_trial_id = None
    current_ing_a    = []
    current_ing_b    = []

    def flush_ingredients(trial_id, ings_a, ings_b):
        rows = []
        for i, ing in enumerate(ings_a):
            rows.append({**ing, "trial_id": trial_id, "side": "A", "sort_order": i})
        for i, ing in enumerate(ings_b):
            rows.append({**ing, "trial_id": trial_id, "side": "B", "sort_order": i})
        if rows:
            sb_insert("pal_trial_ingredients", rows)
        return len(rows)

    for row_idx, row in enumerate(ws.iter_rows(values_only=True)):
        if row_idx < data_start_row:
            continue

        sort_val = row[4] if len(row) > 4 else None
        date_val = row[2] if len(row) > 2 else None

        is_summary    = sort_val in summary_col_values and date_val is not None
        is_ingredient = sort_val == '内訳'

        if is_summary:
            # 前の試験の内訳を flush
            if current_trial_id and (current_ing_a or current_ing_b):
                c = flush_ingredients(current_trial_id, current_ing_a, current_ing_b)
                ings_ok += c
            current_trial_id = None
            current_ing_a    = []
            current_ing_b    = []

            date_start, date_end, date_label = parse_date_label(date_val)

            # 場所
            loc_raw = clean_text(row[3]) if len(row) > 3 else None
            if species == 'cat':
                location = loc_raw if loc_raw in ('R', 'O') else default_location
            else:
                # 犬: None/'RDC' → '', 'I' → 'I'
                location = 'I' if loc_raw == 'I' else ''

            purpose = clean_text(row[5]) if len(row) > 5 else None
            notes   = clean_text(row[6]) if len(row) > 6 else None
            person  = clean_text(row[7]) if len(row) > 7 else None
            supplier= clean_text(row[8]) if len(row) > 8 else None
            recipe_a= clean_text(row[10]) if len(row) > 10 else None
            recipe_b= clean_text(row[14]) if len(row) > 14 else None
            weight_a= parse_num(row[12]) if len(row) > 12 else None
            weight_b= parse_num(row[16]) if len(row) > 16 else None
            result_date = clean_text(row[17]) if len(row) > 17 else None
            n_animals   = int(row[18]) if len(row) > 18 and row[18] and str(row[18]).isdigit() else None
            try:
                n_animals = int(float(row[18])) if len(row) > 18 and row[18] is not None else None
            except (ValueError, TypeError):
                n_animals = None

            status = '中止' if purpose == '中止' else ('完了' if result_date else '計画中')

            trial = {
                "species":              species,
                "location":             location,
                "food_type":            "dry",
                "trial_date_start":     date_start.isoformat() if date_start else None,
                "trial_date_end":       date_end.isoformat()   if date_end   else None,
                "trial_date_label":     date_label,
                "purpose":              purpose,
                "notes":                notes,
                "person_in_charge":     person,
                "supplier":             supplier,
                "food_a_overview":      recipe_a,
                "food_b_overview":      recipe_b,
                "food_a_weight_total_g": weight_a,
                "food_b_weight_total_g": weight_b,
                "animal_count":         n_animals,
                "result_date":          result_date,
                "status":               status,
            }

            result = sb_insert("pal_trials", [trial])
            if result:
                current_trial_id = result[0]["id"]
                trials_ok += 1
                print(f"  試験: {date_label} [{location}] {str(purpose or '')[:20]} → {current_trial_id[:8]}...")
            else:
                print(f"  SKIP: {date_label} [{location}] (insert failed)")

        elif is_ingredient and current_trial_id:
            no_a   = clean_text(row[9])  if len(row) > 9  else None
            name_a = clean_text(row[10]) if len(row) > 10 else None
            rate_a = parse_num(row[11])  if len(row) > 11 else None
            wt_a   = parse_num(row[12])  if len(row) > 12 else None

            no_b   = clean_text(row[13]) if len(row) > 13 else None
            name_b = clean_text(row[14]) if len(row) > 14 else None
            rate_b = parse_num(row[15])  if len(row) > 15 else None
            wt_b   = parse_num(row[16])  if len(row) > 16 else None

            if name_a or no_a:
                current_ing_a.append({"material_no": no_a, "recipe_name": name_a, "blend_rate": rate_a, "weight_g": wt_a})
            if name_b or no_b:
                current_ing_b.append({"material_no": no_b, "recipe_name": name_b, "blend_rate": rate_b, "weight_g": wt_b})

    # 最後の試験の内訳
    if current_trial_id and (current_ing_a or current_ing_b):
        c = flush_ingredients(current_trial_id, current_ing_a, current_ing_b)
        ings_ok += c

    return trials_ok, ings_ok


def main():
    print("Excel 読み込み中...")
    wb = openpyxl.load_workbook(EXCEL_PATH, read_only=True, data_only=True)

    # ── 猫用 ──────────────────────────────────────────────
    print("\n=== 試験計画_猫用 ===")
    ws_cat = wb['試験計画_猫用']
    t, i = import_sheet(
        ws_cat, 'cat', 'R',
        data_start_row=5,
        summary_col_values={'概要', '概要（1日目）', '概要（2日目）'}
    )
    print(f"  → 試験 {t} 件、内訳 {i} 行 投入完了")

    # ── 犬用 ──────────────────────────────────────────────
    print("\n=== 試験計画_犬用 ===")
    ws_dog = wb['試験計画_犬用']
    t, i = import_sheet(
        ws_dog, 'dog', '',
        data_start_row=9,
        summary_col_values={'概要', '概要（1日目）', '概要（2日目）'}
    )
    print(f"  → 試験 {t} 件、内訳 {i} 行 投入完了")

    print("\n完了！")


if __name__ == "__main__":
    main()
