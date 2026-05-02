"""
Netlify Function: 統計解析 (Python + scipy)
POST /functions/stats
Body: { "trial_id": "...", "species": "cat" }
"""
import json
import os
import math
from datetime import datetime, timezone

try:
    import requests
    from scipy import stats as scipy_stats
    import numpy as np
except ImportError as e:
    def handler(event, context):
        return {"statusCode": 500, "body": f"Import error: {e}"}


SUPABASE_URL         = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}


def sb_get(table, params=""):
    url = f"{SUPABASE_URL}/rest/v1/{table}?{params}"
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.json()


def sb_upsert(table, data):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    h = {**HEADERS, "Prefer": "resolution=merge-duplicates,return=representation"}
    r = requests.post(url, headers=h, json=data, timeout=30)
    r.raise_for_status()
    return r.json()


def sb_delete(table, params):
    url = f"{SUPABASE_URL}/rest/v1/{table}?{params}"
    r = requests.delete(url, headers=HEADERS, timeout=30)
    r.raise_for_status()


def handler(event, context):
    if event.get("httpMethod") != "POST":
        return {"statusCode": 405, "body": "Method Not Allowed"}

    try:
        body = json.loads(event.get("body") or "{}")
    except Exception:
        return {"statusCode": 400, "body": "Invalid JSON"}

    trial_id = body.get("trial_id")
    species  = body.get("species", "cat")
    if not trial_id:
        return {"statusCode": 400, "body": "trial_id required"}

    try:
        result = run_analysis(trial_id, species)
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(result),
        }
    except Exception as e:
        import traceback
        return {"statusCode": 500, "body": traceback.format_exc()}


def run_analysis(trial_id, species):
    # ── 設定読み込み ──────────────────────────────────────
    settings_list = sb_get("stat_settings", f"species=eq.{species}")
    settings = settings_list[0] if settings_list else {}

    norm_alpha  = float(settings.get("normality_alpha",  0.05))
    sig_alpha   = float(settings.get("significance_alpha", 0.05))
    exc_min     = float(settings.get("exclusion_min_ratio", 10))
    exc_max     = float(settings.get("exclusion_max_ratio", 130))
    agg_method  = settings.get("aggregate_method", "average")
    ef_method   = settings.get("effect_size_method", "auto")
    ef_small    = float(settings.get("effect_small_threshold",  0.2))
    ef_medium   = float(settings.get("effect_medium_threshold", 0.5))
    ef_large    = float(settings.get("effect_large_threshold",  0.8))

    # ── 試験情報・参加個体・結果読み込み ─────────────────
    trials  = sb_get("pal_trials",        f"id=eq.{trial_id}")
    results = sb_get("pal_results",       f"trial_id=eq.{trial_id}")
    animals = sb_get("pal_trial_animals", f"trial_id=eq.{trial_id}&order=sort_order.asc")

    trial = trials[0] if trials else {}
    is_wet = trial.get("food_type") == "wet"

    # ── 個体ごとの採食比を計算 ───────────────────────────
    res_map = {}
    for r in results:
        key = r.get("animal_id") or r.get("animal_name")
        res_map[key] = r

    ratio_a_list = []  # 各個体の○採食比
    ratio_b_list = []  # 各個体の●採食比
    excluded_count = 0
    n_total = 0

    for pa in animals:
        key = pa.get("animal_id") or pa.get("animal_name")
        r   = res_map.get(key, {})
        food_g = float(pa.get("food_given_g") or 0)
        if food_g <= 0:
            continue

        n_total += 1

        if r.get("excluded"):
            excluded_count += 1
            continue

        # 残餌量から採食量を計算
        if is_wet:
            # ウェット: 採食量 = 総量 - 風袋 - 残餌量
            tare = float(pa.get("tare_g") or 0)
            def eaten_wet(total, remaining):
                if total is None or remaining is None: return None
                return max(0, float(total) - tare - float(remaining))
            ea1 = eaten_wet(r.get("total_a_1st"), r.get("remaining_a_1st"))
            eb1 = eaten_wet(r.get("total_b_1st"), r.get("remaining_b_1st"))
            ea2 = eaten_wet(r.get("total_a_2nd"), r.get("remaining_a_2nd"))
            eb2 = eaten_wet(r.get("total_b_2nd"), r.get("remaining_b_2nd"))
        else:
            # ドライ: 採食量 = 給与量 - 残餌量
            def eaten_dry(remaining):
                if remaining is None: return None
                return max(0, food_g - float(remaining))
            ea1 = eaten_dry(r.get("remaining_a_1st"))
            eb1 = eaten_dry(r.get("remaining_b_1st"))
            ea2 = eaten_dry(r.get("remaining_a_2nd"))
            eb2 = eaten_dry(r.get("remaining_b_2nd"))

        # 集計方法に応じて採食量を決定
        if agg_method == "day1":
            ea, eb = ea1, eb1
        elif agg_method == "day2":
            ea, eb = ea2, eb2
        else:  # average
            if ea1 is None or eb1 is None or ea2 is None or eb2 is None:
                ea = ea1 if ea1 is not None else ea2
                eb = eb1 if eb1 is not None else eb2
            else:
                ea = (ea1 + ea2) / 2
                eb = (eb1 + eb2) / 2

        if ea is None or eb is None:
            excluded_count += 1
            continue

        total_eaten = ea + eb
        if total_eaten <= 0:
            excluded_count += 1
            continue

        # 除外基準チェック (採食率 = 採食量 / 給与量 * 100)
        total_ratio = total_eaten / food_g * 100
        if total_ratio < exc_min:
            excluded_count += 1
            continue

        # 採食比 (○の割合) を計算
        ratio_a = ea / total_eaten * 100
        ratio_b = eb / total_eaten * 100
        ratio_a_list.append(ratio_a)
        ratio_b_list.append(ratio_b)

    n_used = len(ratio_a_list)

    if n_used < 3:
        # サンプル数不足
        analysis = {
            "trial_id": trial_id,
            "species": species,
            "n_total": n_total,
            "n_excluded": excluded_count,
            "n_used": n_used,
            "winner": "inconclusive",
            "conclusion": f"解析対象個体数が{n_used}頭と少なすぎるため統計解析を実行できません（最低3頭必要）",
        }
        sb_delete("pal_analysis", f"trial_id=eq.{trial_id}")
        sb_upsert("pal_analysis", [analysis])
        return analysis

    ra = np.array(ratio_a_list)
    rb = np.array(ratio_b_list)
    diff = ra - rb

    # ── 基本統計量 ────────────────────────────────────────
    mean_a1 = float(np.mean(ratio_a_list))
    mean_b1 = float(np.mean(ratio_b_list))
    med_a1  = float(np.median(ratio_a_list))
    med_b1  = float(np.median(ratio_b_list))

    # ── 正規性検定 (Shapiro-Wilk) ─────────────────────────
    _, p_norm_a = scipy_stats.shapiro(diff if len(diff) < 50 else diff)
    p_norm_a = float(p_norm_a)
    _, p_norm_b = scipy_stats.shapiro(rb)
    p_norm_b = float(p_norm_b)
    is_normal = bool(p_norm_a >= norm_alpha)

    # ── 有意差検定 ────────────────────────────────────────
    if is_normal:
        stat_test_used = "t-test"
        t_stat, p_value = scipy_stats.ttest_rel(ra, rb)
    else:
        stat_test_used = "wilcoxon"
        try:
            t_stat, p_value = scipy_stats.wilcoxon(diff)
        except ValueError:
            t_stat, p_value = 0.0, 1.0

    p_value = float(p_value)
    is_significant = bool(p_value < sig_alpha)
    significance_label = f"p={p_value:.4f}" + (" *" if p_value < 0.05 else "")

    # ── 効果量 ────────────────────────────────────────────
    use_method = ef_method
    if use_method == "auto":
        use_method = "cohen_dz" if is_normal else "rank_biserial"

    if use_method == "cohen_dz":
        ef_method_used = "cohen_dz"
        std_diff = float(np.std(diff, ddof=1))
        ef_value = float(np.mean(diff) / std_diff) if std_diff > 0 else 0.0
    else:
        ef_method_used = "rank_biserial"
        n = len(diff)
        # rank-biserial = 2 * W / (n*(n+1)) - 1  (Wilcoxon signed-rank)
        try:
            w_stat, _ = scipy_stats.wilcoxon(diff, alternative='two-sided')
            ef_value = float(2 * w_stat / (n * (n + 1) / 2) - 1)
        except Exception:
            ef_value = 0.0

    abs_ef = abs(ef_value)
    if abs_ef >= ef_large:
        ef_label = "large (大)"
    elif abs_ef >= ef_medium:
        ef_label = "medium (中)"
    elif abs_ef >= ef_small:
        ef_label = "small (小)"
    else:
        ef_label = "negligible (無視できる)"

    # ── 勝者判定 ─────────────────────────────────────────
    if not is_significant:
        winner = "tie"
    elif mean_a1 > mean_b1:
        winner = "A"
    else:
        winner = "B"

    # ── 結論テキスト ──────────────────────────────────────
    test_label = "T検定" if is_normal else "ウィルコクソン符号順位和検定"
    winner_text = {"A":"○フード(A)が優位", "B":"●フード(B)が優位", "tie":"差なし"}.get(winner, "判定不能")
    conclusion = (
        f"【{winner_text}】"
        f"○平均{mean_a1:.1f}% vs ●平均{mean_b1:.1f}%。"
        f"{test_label}: {significance_label}。"
        f"効果量({ef_method_used})={ef_value:.3f} ({ef_label})。"
        f"解析頭数: {n_used}/{n_total}頭。"
    )

    analysis = {
        "trial_id":           trial_id,
        "species":            species,
        "computed_at":        datetime.now(timezone.utc).isoformat(),
        "n_total":            n_total,
        "n_excluded":         excluded_count,
        "n_used":             n_used,
        "mean_a_ratio_avg":   mean_a1,
        "mean_b_ratio_avg":   mean_b1,
        "median_a_ratio_avg": med_a1,
        "median_b_ratio_avg": med_b1,
        "normality_test":     "shapiro",
        "normality_p_a":      p_norm_a,
        "normality_p_b":      p_norm_b,
        "is_normal":          is_normal,
        "stat_test_used":     stat_test_used,
        "p_value":            p_value,
        "is_significant":     is_significant,
        "significance_label": significance_label,
        "effect_size_method": ef_method_used,
        "effect_size_value":  ef_value,
        "effect_size_label":  ef_label,
        "winner":             winner,
        "conclusion":         conclusion,
        "raw_a_ratios":       ratio_a_list,
        "raw_b_ratios":       ratio_b_list,
    }

    # 既存の解析結果を削除して再保存
    sb_delete("pal_analysis", f"trial_id=eq.{trial_id}")
    sb_upsert("pal_analysis", [analysis])

    # pal_trials テーブルの選択率・検定結果を更新
    requests.patch(
        f"{SUPABASE_URL}/rest/v1/pal_trials?id=eq.{trial_id}",
        headers=HEADERS,
        json={
            "preference_rate_a": mean_a1,
            "preference_rate_b": mean_b1,
            "statistical_test":  stat_test_used,
        },
        timeout=30,
    )

    return analysis
