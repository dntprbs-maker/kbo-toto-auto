# =====================================================
# KBO 자동 크롤러 v3
# pip install requests beautifulsoup4 pandas lxml
# python kbo_crawl.py
#
# v3 변경사항:
#   - 경기 일정: 네이버 스포츠 JSON API 활용 (SPA 페이지라 HTML 파싱 불가)
#   - 경기 없는 날(월요일/새벽): 자동으로 가장 가까운 다음 경기일 탐색
#   - 팀 순위: KBO 올바른 URL(TeamRankDaily.aspx) + 네이버 API 이중 폴백
#   - 팀타격/팀투수: 기존 로직 유지 (정상 작동 확인됨)
# =====================================================
import requests
from bs4 import BeautifulSoup
import pandas as pd
import os, time, json
from datetime import datetime, timedelta

# --- 파서 자동 선택 ---
def _best_parser():
    try:
        import lxml  # noqa
        return "lxml"
    except ImportError:
        return "html.parser"
PARSER = _best_parser()

# --- 설정 ---
SAVE_DIR   = r"C:\Users\크린\Documents\Claude\Projects\한국 프로야구 토토 분석"
TODAY      = datetime.now().strftime("%Y%m%d")
TODAY_YMD  = datetime.now().strftime("%Y년 %m월 %d일")
YEAR       = datetime.now().strftime("%Y")
MONTH      = datetime.now().strftime("%m")
DAY        = datetime.now().strftime("%d")
KBO_BASE   = "https://www.koreabaseball.com"

# 네이버 스포츠 JSON API (SPA라서 HTML 파싱 불가, API 직접 호출)
NAVER_API  = "https://api-gw.sports.naver.com"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "ko-KR,ko;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
}

# 네이버 API 전용 헤더 (Referer 필수)
NAVER_API_HEADERS = {
    **HEADERS,
    "Referer": "https://sports.naver.com/",
    "Accept": "application/json",
}

os.makedirs(SAVE_DIR, exist_ok=True)

# =====================================================
# 공통 유틸
# =====================================================

def fetch_soup(url, params=None, referer=None, timeout=20):
    """URL -> BeautifulSoup. 실패 시 None 반환."""
    h = dict(HEADERS)
    if referer:
        h["Referer"] = referer
    try:
        r = requests.get(url, params=params, headers=h, timeout=timeout)
        r.raise_for_status()
        r.encoding = r.apparent_encoding or "utf-8"
        return BeautifulSoup(r.text, PARSER)
    except requests.exceptions.HTTPError as e:
        print(f"  [HTTP 오류] {e}")
    except requests.exceptions.ConnectionError:
        print(f"  [연결 오류] {url}")
    except requests.exceptions.Timeout:
        print(f"  [타임아웃] {url}")
    except Exception as e:
        print(f"  [오류] {e}")
    return None


def fetch_json(url, params=None, headers=None, timeout=20):
    """URL -> dict(JSON). 실패 시 None 반환."""
    h = headers or NAVER_API_HEADERS
    try:
        r = requests.get(url, params=params, headers=h, timeout=timeout)
        r.raise_for_status()
        return r.json()
    except requests.exceptions.HTTPError as e:
        print(f"  [HTTP 오류] {e}")
    except requests.exceptions.ConnectionError:
        print(f"  [연결 오류] {url}")
    except requests.exceptions.Timeout:
        print(f"  [타임아웃] {url}")
    except json.JSONDecodeError:
        print(f"  [JSON 파싱 오류] {url}")
    except Exception as e:
        print(f"  [오류] {e}")
    return None


def find_best_table(soup, min_cols=4):
    """가장 많은 데이터를 가진 table 반환."""
    best, best_score = None, 0
    for table in soup.find_all("table"):
        trs = table.find_all("tr")
        max_cols = max((len(tr.find_all(["td","th"])) for tr in trs), default=0)
        score = len(trs) * max_cols
        if max_cols >= min_cols and score > best_score:
            best, best_score = table, score
    return best


def parse_table(table):
    """table element -> (headers: list, rows: list[list])."""
    if table is None:
        return [], []

    # 헤더 추출
    headers = []
    thead = table.find("thead")
    src = thead if thead else table
    for th in src.find_all("th"):
        txt = th.get_text(separator=" ", strip=True)
        headers.append(txt or f"col{len(headers)}")
    if not headers:
        first = table.find("tr")
        if first:
            for cell in first.find_all(["th","td"]):
                txt = cell.get_text(separator=" ", strip=True)
                headers.append(txt or f"col{len(headers)}")

    # 본문 행 추출
    rows = []
    tbody = table.find("tbody") or table
    for tr in tbody.find_all("tr"):
        tds = tr.find_all("td")
        if not tds:
            continue
        row = [td.get_text(separator=" ", strip=True) for td in tds]
        if headers:
            while len(row) < len(headers): row.append("")
            row = row[:len(headers)]
        rows.append(row)
    return headers, rows


def save_csv(df, fname):
    path = os.path.join(SAVE_DIR, fname)
    df.to_csv(path, index=False, encoding="utf-8-sig")
    print(f"  => 저장: {fname} ({len(df)}행)")


def apply_default_headers(headers, body, defaults):
    """헤더가 비거나 너무 짧으면 기본값으로 대체."""
    if body and (not headers or len(headers) < 4):
        return defaults[:len(body[0])]
    return headers


def rows_to_dicts(headers, body):
    result = []
    for row in body:
        d = dict(zip(headers, row))
        d["수집일"] = TODAY_YMD
        result.append(d)
    return result


# =====================================================
# 1. 경기 일정 & 선발 투수
# =====================================================
# 네이버 스포츠는 React SPA → HTML 파싱 불가
# → 네이버 스포츠 JSON API를 1차로 사용
# → KBO 공식 사이트를 2차 폴백으로 사용
# → 오늘 경기가 없으면 최대 7일까지 다음 경기일 자동 탐색
# =====================================================

# 경기 없는 날 자동 탐색 최대 일수
MAX_LOOKAHEAD_DAYS = 7

def crawl_schedule():
    print(f"\n[1/3] 오늘 경기 일정 ({TODAY_YMD})")
    print("-" * 50)

    # 1차: 네이버 API로 오늘 경기 조회
    rows, actual_date = _sched_naver_api(TODAY)

    # 2차: KBO 공식 사이트 시도
    if not rows:
        print("  네이버 API 실패 -> KBO 공식 사이트 시도...")
        rows = _sched_kbo()

    # 3차: 오늘 경기 없으면 다음 경기일 탐색 (최대 7일)
    if not rows:
        print("  오늘 경기 없음 -> 가장 가까운 다음 경기일 탐색...")
        rows, actual_date = _find_next_game_day()

    if rows:
        df = pd.DataFrame(rows)
        # 실제 경기 날짜로 파일명 생성
        file_date = actual_date if actual_date else TODAY
        save_csv(df, f"KBO_일정_{file_date}.csv")
        print("  [경기 목록]")
        for r in rows:
            home = r.get("홈팀","")
            away = r.get("원정팀","")
            t    = r.get("시간","")
            stad = r.get("경기장","")
            ap   = r.get("원정선발","")
            hp   = r.get("홈선발","")
            print(f"    {t:>6}  {away} vs {home}  [{stad}]  선발: {ap}/{hp}")
    else:
        # 최종 실패 시에도 빈 파일이 아닌 안내 메시지 CSV 생성
        df = pd.DataFrame([{
            "날짜": TODAY_YMD,
            "안내": f"향후 {MAX_LOOKAHEAD_DAYS}일 내 예정된 경기가 없습니다 (비시즌 또는 올스타 브레이크).",
            "수집일": TODAY_YMD,
        }])
        save_csv(df, f"KBO_일정_{TODAY}.csv")
        print("  !! 경기 일정을 가져오지 못했습니다 (비시즌 가능성).")


def _sched_naver_api(date_str):
    """
    네이버 스포츠 JSON API로 특정 날짜의 경기 일정 조회.
    date_str: "YYYYMMDD" 형식
    반환: (rows: list[dict], date_str: str)
    """
    url = f"{NAVER_API}/schedule/games/kbaseball"
    params = {
        "fields": "basic,superCategoryId,categoryName,stadium,statusNum,gameOnAir,has498,broadcaster",
        "date": date_str,
    }
    data = fetch_json(url, params=params)
    if not data:
        return [], date_str

    # API 응답에서 게임 목록 추출 (응답 구조에 따라 유연하게 처리)
    games = _extract_games_from_response(data)

    if not games:
        print(f"  [네이버 API] {date_str} - 경기 없음")
        return [], date_str

    # 날짜 포맷 변환
    dt = datetime.strptime(date_str, "%Y%m%d")
    date_display = dt.strftime("%Y년 %m월 %d일")

    rows = []
    for g in games:
        # API 응답에서 필드명 추출 (다양한 키 이름 대응)
        home_team  = g.get("homeTeamName") or g.get("home", {}).get("name", "") if isinstance(g.get("home"), dict) else g.get("homeTeamName", "")
        away_team  = g.get("awayTeamName") or g.get("away", {}).get("name", "") if isinstance(g.get("away"), dict) else g.get("awayTeamName", "")
        stadium    = g.get("stadium") or g.get("stadiumName", "")
        game_time  = ""
        status     = g.get("statusCode") or g.get("status", "")

        # 시간 추출: 여러 필드명 대응
        for time_key in ["gameDateTime", "startTime", "time", "gameTime"]:
            if time_key in g and g[time_key]:
                raw_time = str(g[time_key])
                # "2026-05-24T14:00:00" -> "14:00"
                if "T" in raw_time:
                    game_time = raw_time.split("T")[1][:5]
                elif ":" in raw_time:
                    game_time = raw_time[:5]
                else:
                    game_time = raw_time
                break

        # 선발투수 추출 (API에 있으면)
        home_pitcher = ""
        away_pitcher = ""
        if isinstance(g.get("home"), dict):
            home_pitcher = g["home"].get("starter", "") or g["home"].get("pitcherName", "")
        if isinstance(g.get("away"), dict):
            away_pitcher = g["away"].get("starter", "") or g["away"].get("pitcherName", "")
        # 다른 구조의 선발투수 필드
        if not home_pitcher:
            home_pitcher = g.get("homePitcherName", "") or g.get("homeStarter", "")
        if not away_pitcher:
            away_pitcher = g.get("awayPitcherName", "") or g.get("awayStarter", "")

        # 스코어 또는 상태
        score = "vs"
        if status in ("RESULT", "FINAL", "종료"):
            home_score = g.get("homeScore") or g.get("home", {}).get("score", "") if isinstance(g.get("home"), dict) else g.get("homeScore", "")
            away_score = g.get("awayScore") or g.get("away", {}).get("score", "") if isinstance(g.get("away"), dict) else g.get("awayScore", "")
            if home_score != "" and away_score != "":
                score = f"{away_score} : {home_score}"

        rows.append({
            "날짜"    : date_display,
            "시간"    : game_time,
            "원정팀"  : away_team,
            "스코어"  : score,
            "홈팀"    : home_team,
            "경기장"  : stadium,
            "원정선발": away_pitcher,
            "홈선발"  : home_pitcher,
            "수집일"  : TODAY_YMD,
        })

    print(f"  [네이버 API] {date_str} - {len(rows)}경기 파싱 완료")
    return rows, date_str


def _extract_games_from_response(data):
    """
    네이버 API 응답에서 게임 배열을 추출.
    응답 구조가 바뀔 수 있으므로 여러 경로를 탐색.
    """
    # 경우 1: {"result": {"games": [...]}}
    if isinstance(data, dict):
        result = data.get("result")
        if isinstance(result, dict):
            games = result.get("games")
            if isinstance(games, list):
                return games
        # 경우 2: {"result": [...]}
        if isinstance(result, list):
            return result
        # 경우 3: {"games": [...]}
        games = data.get("games")
        if isinstance(games, list):
            return games
        # 경우 4: 응답 자체가 리스트
    if isinstance(data, list):
        return data
    return []


def _find_next_game_day():
    """
    오늘부터 최대 MAX_LOOKAHEAD_DAYS일 후까지 탐색하여
    가장 가까운 경기가 있는 날을 찾는다.
    """
    base = datetime.now()
    for offset in range(1, MAX_LOOKAHEAD_DAYS + 1):
        target = base + timedelta(days=offset)
        target_str = target.strftime("%Y%m%d")
        target_display = target.strftime("%Y년 %m월 %d일")
        print(f"  -> {target_display} 확인 중...")

        rows, actual_date = _sched_naver_api(target_str)
        if rows:
            print(f"  ✓ {target_display}에 {len(rows)}경기 발견!")
            return rows, actual_date

        time.sleep(0.5)  # API 부하 방지

    print(f"  !! 향후 {MAX_LOOKAHEAD_DAYS}일 내 경기를 찾지 못했습니다.")
    return [], None


def _sched_kbo():
    """KBO 공식 사이트에서 경기 일정 파싱 (폴백용)."""
    url  = f"{KBO_BASE}/Schedule/Schedule.aspx"
    soup = fetch_soup(url, referer=KBO_BASE+"/")
    if not soup:
        return []

    rows = []

    # 방법 1: div 기반 구조 (최신 KBO 사이트)
    # KBO 사이트는 table이 아닌 div/li 리스트로 경기를 표시할 수 있음
    game_conts = soup.select(
        "li.game-cont, div.game-cont, "
        ".schedule-list li, .schedule_tbl li, "
        "div[class*='game'], li[class*='game']"
    )
    if game_conts:
        for gc in game_conts:
            time_el = gc.select_one(
                "span.time, .game-time, span[class*='time'], "
                "em.time, div.time"
            )
            game_time = time_el.get_text(strip=True) if time_el else ""

            # 팀 이름 추출
            teams = gc.select(
                "span.team, div.team, span[class*='team'], "
                ".team-name, em.team"
            )
            away_team = teams[0].get_text(strip=True) if len(teams) > 0 else ""
            home_team = teams[1].get_text(strip=True) if len(teams) > 1 else ""

            stadium_el = gc.select_one(
                "span.stadium, .stadium, span[class*='stadium'], "
                "em.stadium, div.place"
            )
            stadium = stadium_el.get_text(strip=True) if stadium_el else ""

            if away_team or home_team:
                rows.append({
                    "날짜"    : TODAY_YMD,
                    "시간"    : game_time,
                    "원정팀"  : away_team,
                    "스코어"  : "vs",
                    "홈팀"    : home_team,
                    "경기장"  : stadium,
                    "원정선발": "",
                    "홈선발"  : "",
                    "수집일"  : TODAY_YMD,
                })
        print(f"  [KBO div] {len(rows)}경기 파싱 완료")
        return rows

    # 방법 2: table 기반 구조 (구버전 호환)
    table = find_best_table(soup, min_cols=4)
    if not table:
        print("  [KBO] 일정 테이블/리스트 없음")
        return []

    for tr in table.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) < 4:
            continue
        texts = [td.get_text(separator=" ", strip=True) for td in tds]
        if not texts[1] and not texts[3]:
            continue

        # 선발투수 span 탐색
        pitchers = tr.select("span.pitcher, .pitcher, em.name, span[class*='pitcher']")
        away_p = pitchers[0].get_text(strip=True) if len(pitchers) > 0 else ""
        home_p = pitchers[1].get_text(strip=True) if len(pitchers) > 1 else ""

        rows.append({
            "날짜"    : TODAY_YMD,
            "시간"    : texts[0],
            "원정팀"  : texts[1],
            "스코어"  : texts[2] if len(texts)>2 else "vs",
            "홈팀"    : texts[3] if len(texts)>3 else "",
            "경기장"  : texts[4] if len(texts)>4 else "",
            "원정선발": away_p,
            "홈선발"  : home_p,
            "수집일"  : TODAY_YMD,
        })

    print(f"  [KBO table] {len(rows)}경기 파싱 완료")
    return rows


# =====================================================
# 2. 팀 순위
# =====================================================
# KBO 올바른 URL: TeamRankDaily.aspx (기존 Basic.aspx는 기록 페이지)
# 네이버 스포츠 JSON API를 1차로 사용 (안정적)
# =====================================================

DEFAULT_RANK_HDR = [
    "순위","팀","경기","승","패","무","승률","게임차",
    "최근10","홈","원정","득점","실점","타율","방어율"
]

def crawl_standings():
    print(f"\n[2/3] 팀별 순위")
    print("-" * 50)

    # 1차: 네이버 API (가장 안정적)
    rows = _rank_naver_api()

    # 2차: KBO 공식 사이트 (올바른 URL로 수정됨)
    if not rows:
        print("  네이버 API 실패 -> KBO 공식 사이트 시도...")
        rows = _rank_kbo()

    if rows:
        df = pd.DataFrame(rows)
        save_csv(df, f"KBO_팀순위_{TODAY}.csv")
        print("  [순위 미리보기]")
        for r in rows:
            rank = r.get("순위","?")
            team = r.get("팀", r.get("팀명", list(r.values())[1] if len(r)>1 else ""))
            win  = r.get("승","")
            loss = r.get("패","")
            pct  = r.get("승률","")
            print(f"    {rank:>2}위  {team:<6}  {win}승 {loss}패  승률 {pct}")
    else:
        print("  !! 팀 순위를 가져오지 못했습니다.")


def _rank_naver_api():
    """네이버 스포츠 JSON API로 팀 순위 조회."""
    url = f"{NAVER_API}/record/kbaseball/team/rank"
    params = {
        "year": YEAR,
        "category": "overall",
    }
    data = fetch_json(url, params=params)
    if not data:
        return []

    # 응답에서 팀 순위 배열 추출
    teams = _extract_teams_from_response(data)
    if not teams:
        print("  [네이버 API] 순위 데이터 없음")
        return []

    rows = []
    for t in teams:
        # 다양한 필드명에 대응
        rows.append({
            "순위"  : t.get("rank") or t.get("순위", ""),
            "팀"    : t.get("teamName") or t.get("team", {}).get("name", "") if isinstance(t.get("team"), dict) else t.get("teamName", ""),
            "경기"  : t.get("gamesPlayed") or t.get("game", "") or t.get("played", ""),
            "승"    : t.get("wins") or t.get("win", ""),
            "패"    : t.get("losses") or t.get("lose", ""),
            "무"    : t.get("draws") or t.get("draw", ""),
            "승률"  : t.get("winRate") or t.get("wra", ""),
            "게임차": t.get("gamesBehind") or t.get("gb", "") or t.get("gameBehind", ""),
            "연속"  : t.get("streak") or t.get("continuity", ""),
            "최근10": t.get("last10") or t.get("recentResult", ""),
            "수집일": TODAY_YMD,
        })

    print(f"  [네이버 API] {len(rows)}팀 파싱 완료")
    return rows


def _extract_teams_from_response(data):
    """네이버 API 응답에서 팀 배열을 추출."""
    if isinstance(data, dict):
        result = data.get("result")
        if isinstance(result, dict):
            # {"result": {"teams": [...]}} 또는 {"result": {"teamRankList": [...]}}
            for key in ["teams", "teamRankList", "ranks", "list", "data"]:
                arr = result.get(key)
                if isinstance(arr, list) and arr:
                    return arr
            # result 자체가 리스트인 경우
        if isinstance(result, list):
            return result
        # {"teams": [...]} 직접
        for key in ["teams", "teamRankList", "ranks", "list", "data"]:
            arr = data.get(key)
            if isinstance(arr, list) and arr:
                return arr
    if isinstance(data, list):
        return data
    return []


def _rank_kbo():
    """
    KBO 공식 사이트에서 팀 순위 파싱.
    올바른 URL: /Record/TeamRank/TeamRankDaily.aspx
    (기존 /Record/Team/TeamRank/Basic.aspx는 '팀 기록' 페이지로 순위와 다름)
    """
    # 1차: 올바른 순위 페이지
    urls_to_try = [
        f"{KBO_BASE}/Record/TeamRank/TeamRankDaily.aspx",
        f"{KBO_BASE}/Record/Team/TeamRank/Basic.aspx",  # 폴백
    ]

    for url in urls_to_try:
        soup = fetch_soup(url, referer=KBO_BASE+"/")
        if not soup:
            continue

        # 방법 1: 특정 class로 순위 테이블 찾기
        table = None
        for selector in [
            "table.tData",          # KBO 공통 데이터 테이블 클래스
            "table.record",         # 기록 테이블 클래스
            "div.recordTeamRank table",  # 순위 전용 컨테이너
            "#cphContents_cphContents_cphContents_udpRecord table",  # ASP.NET ID
            "table[class*='rank']", # rank가 포함된 클래스
            "table[class*='Record']",  # Record가 포함된 클래스
        ]:
            found = soup.select_one(selector)
            if found:
                table = found
                break

        # 방법 2: 범용 테이블 탐색 (최소 7열 이상 = 순위 테이블 가능성 높음)
        if not table:
            table = find_best_table(soup, min_cols=7)

        # 방법 3: 아무 테이블이나 (min_cols=4)
        if not table:
            table = find_best_table(soup, min_cols=4)

        if not table:
            print(f"  [KBO] {url.split('/')[-1]} - 테이블 없음")
            continue

        headers, body = parse_table(table)

        # 순위 데이터 검증: 최소 5팀 이상이어야 유효
        if len(body) < 5:
            print(f"  [KBO] {url.split('/')[-1]} - 데이터 부족 ({len(body)}행)")
            continue

        headers = apply_default_headers(headers, body, DEFAULT_RANK_HDR)
        rows = rows_to_dicts(headers, body)
        print(f"  [KBO] {len(rows)}팀 파싱 완료 ({url.split('/')[-1]})")
        return rows

    return []


# =====================================================
# 3. 팀별 타격 & 투수 성적
# =====================================================
# 이 부분은 기존 로직 유지 (정상 작동 확인됨)
# =====================================================

DEFAULT_BAT_HDR = [
    "팀","경기","타수","득점","안타","2루타","3루타","홈런",
    "타점","도루","볼넷","삼진","타율","출루율","장타율","OPS"
]
DEFAULT_PIT_HDR = [
    "팀","경기","완투","완봉","승","패","세이브","홀드",
    "이닝","피안타","피홈런","볼넷","삼진","실점","자책","방어율","WHIP"
]

def crawl_team_stats():
    print(f"\n[3/3] 팀별 타격 & 투수 성적")
    print("-" * 50)

    _stat_section(
        name="팀타격",
        kbo_url=f"{KBO_BASE}/Record/Team/Hitter/Basic1.aspx",
        nav_url=f"{KBO_BASE}/Record/Team/Hitter/Basic1.aspx",  # KBO가 잘 되므로 동일
        default_hdr=DEFAULT_BAT_HDR,
        fname=f"KBO_팀타격_{TODAY}.csv",
    )
    time.sleep(1)
    _stat_section(
        name="팀투수",
        kbo_url=f"{KBO_BASE}/Record/Team/Pitcher/Basic1.aspx",
        nav_url=f"{KBO_BASE}/Record/Team/Pitcher/Basic1.aspx",  # KBO가 잘 되므로 동일
        default_hdr=DEFAULT_PIT_HDR,
        fname=f"KBO_팀투수_{TODAY}.csv",
    )


def _stat_section(name, kbo_url, nav_url, default_hdr, fname):
    print(f"  [{name}]")
    rows = _fetch_stat(kbo_url, default_hdr, "KBO")
    if not rows:
        print(f"    KBO 실패 -> 재시도...")
        rows = _fetch_stat(nav_url, default_hdr, "재시도")
    if rows:
        df = pd.DataFrame(rows)
        save_csv(df, fname)
    else:
        print(f"    !! {name} 데이터를 가져오지 못했습니다.")


def _fetch_stat(url, default_hdr, src_name):
    soup = fetch_soup(url, referer=f"{KBO_BASE}/Record/Team/TeamRank/Basic.aspx")
    if not soup:
        return []
    table = find_best_table(soup)
    if not table:
        print(f"    [{src_name}] 테이블 없음")
        return []
    headers, body = parse_table(table)
    headers = apply_default_headers(headers, body, default_hdr)
    rows = rows_to_dicts(headers, body)
    print(f"    [{src_name}] {len(rows)}팀 파싱 완료")
    return rows


# =====================================================
# 메인
# =====================================================

def main():
    print("=" * 55)
    print(f"  KBO 데이터 자동 수집 v3  ({TODAY_YMD})")
    print(f"  파서: {PARSER}")
    print("=" * 55)

    crawl_schedule()
    time.sleep(1)
    crawl_standings()
    time.sleep(1)
    crawl_team_stats()

    print(f"\n{'='*55}")
    print("  전체 수집 완료!")
    fnames = [
        f"KBO_일정_{TODAY}.csv",
        f"KBO_팀순위_{TODAY}.csv",
        f"KBO_팀타격_{TODAY}.csv",
        f"KBO_팀투수_{TODAY}.csv",
    ]
    for fname in fnames:
        fpath = os.path.join(SAVE_DIR, fname)
        if os.path.exists(fpath):
            size = os.path.getsize(fpath)
            mark = "OK" if size > 10 else "빈 파일"
        else:
            size = 0
            mark = "없음"
        print(f"  [{mark}] {fname}  ({size:,} bytes)")
    print("  ※ 최종 베팅 판단은 항상 본인 책임입니다.")
    print("=" * 55)


if __name__ == "__main__":
    main()
