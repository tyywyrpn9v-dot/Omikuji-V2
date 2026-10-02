#!/usr/bin/env python3
"""每月檢查可機器閱讀的來源，只加入標題格式符合的新御神籤。

不使用 AI。讀不到必填欄位就略過，不推測。不下載圖片。

會自動收錄：
  おみくじ図鑑    每月索引，標題「神社（都道府縣市區）名稱」
  おみくじ好き    RSS，標題「【神社】名稱」，而且分類是都道府縣
  社これくしょん  RSS，標題「名稱｜神社(都道府縣市區)｜…」，名稱含みくじ

只寫入記錄、不入庫：
  GajaLife      主 RSS 是雜誌，彙整文一頁多款

不檢查：
  Instagram、ホトカミ、ホリデーノート
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "omikuji.json"
CHANGELOG_PATH = ROOT / "updates" / "changelog.json"
LOG_PATH = ROOT / "updates" / "auto-update-log.json"
UA = "omikuji-pages-source-check/1.0 (+https://github.com/)"
HKT = timezone(timedelta(hours=8))
ATOM = {"atom": "http://www.w3.org/2005/Atom"}

PREFECTURES = [
    "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
    "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
    "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
    "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
    "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
    "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
    "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
]
SHORT_PREF = {}
for name in PREFECTURES:
    SHORT_PREF[name] = name
    if name.endswith("県"):
        SHORT_PREF[name[:-1]] = name
SHORT_PREF["東京"] = "東京都"
SHORT_PREF["京都"] = "京都府"
SHORT_PREF["大阪"] = "大阪府"
SHORT_PREF["北海道"] = "北海道"

MOTIFS = [
    ("うさぎ", ("うさぎ", "ウサギ", "兎")),
    ("ねこ", ("ねこ", "ネコ", "猫")),
    ("きつね", ("きつね", "キツネ", "狐")),
    ("へび", ("へび", "ヘビ", "蛇")),
    ("龍", ("龍", "竜", "ドラゴン")),
    ("いぬ", ("いぬ", "イヌ", "犬", "柴")),
    ("かえる", ("かえる", "カエル", "蛙")),
    ("かめ", ("かめ", "カメ", "亀")),
    ("鳥", ("鳥", "とり")),
    ("干支", ("干支", "えと")),
    ("だるま", ("だるま", "達摩")),
]


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()


def fetch_text(url: str) -> str:
    data = fetch(url)
    if data.startswith(b"\xef\xbb\xbf"):
        data = data[3:]
    return data.decode("utf-8", "replace")


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def child_text(node: ET.Element, name: str) -> str:
    for child in list(node):
        if local_name(child.tag) == name and child.text:
            return child.text.strip()
    return ""


def normalize(value: str) -> str:
    return re.sub(r"\s+", "", value or "").replace("　", "")


def split_prefecture(text: str) -> tuple[str, str] | None:
    for name in sorted(PREFECTURES, key=len, reverse=True):
        if text.startswith(name):
            return name, text[len(name):].strip()
    return None


def motifs_from(name: str) -> list[str]:
    found = []
    for label, words in MOTIFS:
        if any(word in name for word in words):
            found.append(label)
    return found


def institution_type(shrine: str) -> str:
    if shrine.endswith(("神社", "神宮", "大社")):
        return "神社"
    if shrine.endswith(("寺", "院", "堂")) or "寺" in shrine:
        return "寺院"
    return ""


def is_shrine_or_temple(shrine: str) -> bool:
    return institution_type(shrine) in {"神社", "寺院"}


def is_recent(published: str, today: datetime, days: int) -> bool:
    try:
        if len(published) == 7:
            stamp = datetime.strptime(published + "-01", "%Y-%m-%d")
        else:
            stamp = datetime.strptime(published[:10], "%Y-%m-%d")
    except ValueError:
        return False
    return stamp.date() >= (today.date() - timedelta(days=days))


def make_id(prefix: str, url: str, used: set[str]) -> str:
    digest = hashlib.sha1(url.encode("utf-8")).hexdigest()
    base = f"{prefix}-{digest[:12]}"
    if base not in used:
        return base
    return f"{prefix}-{digest[:20]}"


def entry_from(parsed: dict, today: str) -> dict:
    return {
        "institution_type": parsed["institution_type"],
        "city": parsed["city"],
        "address": parsed.get("address", ""),
        "images": [],
        "material": "",
        "notes": "由每月自動更新自公開來源收錄。價格與授予狀況未向神社核對。未知欄位留空。沒有下載圖片。",
        "source_title": parsed["source_title"],
        "source_url": parsed["source_url"],
        "source_published_date": parsed.get("published", ""),
        "data_retrieved_date": today,
        "official_url": "",
        "official_social_urls": [],
        "last_verified_date": "",
        "status": "previously_confirmed",
        "version_notes": f"{today} 自動收錄自 RSS 或月份索引。不是現場現貨確認。",
        "search_terms": [],
        "id": parsed["id"],
        "name_jp": parsed["name_jp"],
        "shrine_temple_jp": parsed["shrine_temple_jp"],
        "prefecture": parsed["prefecture"],
        "price": parsed.get("price", ""),
        "motif": parsed.get("motif", []),
        "google_maps_url": "",
    }


def parse_zukan_title(title: str) -> dict | None:
    match = re.match(r"^(.+?)（(.+?)）\s*(.+)$", title.strip())
    if not match:
        return None
    shrine, place, name = (part.strip() for part in match.groups())
    if "くじ" not in name:
        return None
    located = split_prefecture(place)
    if not located or len(shrine) < 2 or len(name) < 2:
        return None
    if not is_shrine_or_temple(shrine):
        return None
    prefecture, city = located
    return {
        "shrine_temple_jp": shrine,
        "name_jp": name,
        "prefecture": prefecture,
        "city": city,
        "institution_type": institution_type(shrine),
        "motif": motifs_from(name),
        "source_title": "おみくじ図鑑",
    }


def zukan_items(today: datetime) -> list[dict]:
    items = []
    seen = set()
    month = today.replace(day=1)
    months = [month, (month - timedelta(days=1)).replace(day=1)]
    for stamp in months:
        url = f"https://omikujizukan.cocolog-nifty.com/blog/{stamp:%Y/%m}/index.html"
        try:
            html = fetch_text(url)
        except Exception as error:
            items.append({"error": f"zukan {url}: {error}"})
            continue
        for href, title in re.findall(
            r'href="(https://omikujizukan\.cocolog-nifty\.com/blog/\d{4}/\d{2}/post-[^"]+)"[^>]*>([^<]+)',
            html,
        ):
            title = re.sub(r"\s+", " ", title).strip()
            if title in {"固定リンク", ""} or href in seen:
                continue
            if not parse_zukan_title(title):
                continue
            seen.add(href)
            items.append({
                "url": href,
                "title": title,
                "published": f"{stamp:%Y-%m}",
                "prefix": "zukan",
            })
        time.sleep(1)
    return items


def rss_items(base: str, pages: int = 4) -> list[dict]:
    items = []
    for page in range(1, pages + 1):
        url = base if page == 1 else f"{base}?paged={page}"
        try:
            root = ET.fromstring(fetch(url).lstrip(b"\xef\xbb\xbf"))
        except Exception as error:
            items.append({"error": f"{url}: {error}"})
            break
        nodes = [node for node in root.iter() if local_name(node.tag) == "item"]
        if not nodes:
            break
        for node in nodes:
            categories = [
                (child.text or "").strip()
                for child in list(node)
                if local_name(child.tag) == "category" and child.text
            ]
            items.append({
                "url": child_text(node, "link"),
                "title": child_text(node, "title"),
                "published": child_text(node, "pubDate"),
                "categories": categories,
                "description": re.sub(r"<[^>]+>", " ", child_text(node, "description")),
            })
        time.sleep(1)
    return items


def parse_suki(item: dict) -> dict | None:
    match = re.match(r"^【(.+?)】\s*(.+)$", item.get("title", "").strip())
    if not match:
        return None
    shrine, name = match.group(1).strip(), match.group(2).strip()
    if "くじ" not in name or len(shrine) < 2 or not is_shrine_or_temple(shrine):
        return None
    prefecture = ""
    for category in item.get("categories") or []:
        prefecture = SHORT_PREF.get(category, "")
        if prefecture:
            break
    if not prefecture:
        return None
    published = rfc822_date(item.get("published", ""))
    return {
        "shrine_temple_jp": shrine,
        "name_jp": name,
        "prefecture": prefecture,
        "city": "",
        "institution_type": institution_type(shrine),
        "motif": motifs_from(name),
        "source_title": "おみくじ好き",
        "published": published,
        "price": price_in(item.get("description", "")),
    }


def parse_yashiro(item: dict) -> dict | None:
    title = item.get("title", "").strip()
    parts = [part.strip() for part in title.split("｜")]
    if len(parts) < 2:
        return None
    name, shrine_place = parts[0], parts[1]
    if "くじ" not in name:
        return None
    if any(word in name for word in ("お守り", "御守", "御朱印", "清め塩")):
        return None
    match = re.match(r"^(.+?)\((.+)\)$", shrine_place)
    if not match:
        return None
    shrine, place = match.group(1).strip(), match.group(2).strip()
    located = split_prefecture(place)
    if not located or len(shrine) < 2 or not is_shrine_or_temple(shrine):
        return None
    prefecture, city = located
    return {
        "shrine_temple_jp": shrine,
        "name_jp": name,
        "prefecture": prefecture,
        "city": city,
        "institution_type": institution_type(shrine),
        "motif": motifs_from(name),
        "source_title": "社これくしょん",
        "published": rfc822_date(item.get("published", "")),
        "price": price_in(title + " " + item.get("description", "")),
    }


def price_in(text: str) -> str:
    match = re.search(r"(?:初穂料|初穂)\s*[:：]?\s*([0-9][0-9,]*)\s*円", text or "")
    if not match:
        return ""
    return f"{match.group(1)}円"


def rfc822_date(value: str) -> str:
    value = (value or "").strip()
    if not value:
        return ""
    for fmt in ("%a, %d %b %Y %H:%M:%S %z", "%a, %d %b %Y %H:%M:%S GMT"):
        try:
            return datetime.strptime(value, fmt).astimezone(HKT).date().isoformat()
        except ValueError:
            continue
    return ""


def load_json(path: Path, fallback):
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def consider(raw_items, parser, prefix, entries, known_urls, known_pairs, used_ids, added, skipped, errors, today, days):
    page_known = 0
    page_total = 0
    for item in raw_items:
        if item.get("error"):
            errors.append(item["error"])
            continue
        url = item.get("url") or ""
        if not url:
            continue
        page_total += 1
        if url in known_urls:
            page_known += 1
            continue
        if prefix != "zukan":
            published = rfc822_date(item.get("published", ""))
            if not is_recent(published, today, days):
                continue
        parsed = parse_zukan_title(item.get("title", "")) if parser is None else parser(item)
        if parser is None and parsed is not None:
            parsed["published"] = item.get("published", "")
        if not parsed:
            skipped.append({"url": url, "title": item.get("title", ""), "reason": "標題格式不符合，不入庫"})
            continue
        pair = (normalize(parsed["shrine_temple_jp"]), normalize(parsed["name_jp"]))
        if pair in known_pairs:
            skipped.append({"url": url, "title": item.get("title", ""), "reason": "同一神社與名稱已在資料庫"})
            continue
        parsed["source_url"] = url
        parsed["id"] = make_id(prefix, url, used_ids)
        used_ids.add(parsed["id"])
        known_urls.add(url)
        known_pairs.add(pair)
        entries.append(parsed)
        added.append({
            "id": parsed["id"],
            "name_jp": parsed["name_jp"],
            "shrine_temple_jp": parsed["shrine_temple_jp"],
            "prefecture": parsed["prefecture"],
            "source_url": url,
        })
    return page_total, page_known


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="只列出會新增的項目，不寫檔")
    parser.add_argument("--days", type=int, default=40, help="RSS 只看最近幾日，預設 40")
    args = parser.parse_args()

    today_dt = datetime.now(HKT)
    today = today_dt.date().isoformat()
    database = load_json(DATA_PATH, [])
    if not isinstance(database, list):
        print("data/omikuji.json 不是陣列", file=sys.stderr)
        return 1

    known_urls = {entry.get("source_url", "") for entry in database}
    known_pairs = {
        (normalize(entry.get("shrine_temple_jp", "")), normalize(entry.get("name_jp", "")))
        for entry in database
    }
    used_ids = {entry.get("id", "") for entry in database}
    found = []
    added = []
    skipped = []
    errors = []
    manual = []

    zukan = zukan_items(today_dt)
    consider(zukan, None, "zukan", found, known_urls, known_pairs, used_ids, added, skipped, errors, today_dt, args.days)

    suki = rss_items("https://omikujisuki.com/feed/", pages=2)
    consider(
        [item for item in suki if "url" in item],
        parse_suki,
        "suki",
        found,
        known_urls,
        known_pairs,
        used_ids,
        added,
        skipped,
        errors,
        today_dt,
        args.days,
    )
    errors.extend(item["error"] for item in suki if item.get("error"))

    yashiro = rss_items("https://yashirocollection.com/feed/", pages=4)
    consider(
        [item for item in yashiro if "url" in item],
        parse_yashiro,
        "yashiro",
        found,
        known_urls,
        known_pairs,
        used_ids,
        added,
        skipped,
        errors,
        today_dt,
        args.days,
    )
    errors.extend(item["error"] for item in yashiro if item.get("error"))

    gaja = rss_items("https://gajalife.com/feed/", pages=1)
    for item in gaja:
        if item.get("error"):
            errors.append(item["error"])
            continue
        title = item.get("title", "")
        if "くじ" in title and item.get("url") not in known_urls:
            manual.append({"source": "GajaLife", "title": title, "url": item.get("url", "")})

    print(f"新增 {len(added)} 筆；略過 {len(skipped)}；待人工 {len(manual)}；錯誤 {len(errors)}")
    for row in added:
        print(f"  + {row['prefecture']} {row['shrine_temple_jp']} {row['name_jp']}")
    for row in errors:
        print(f"  ! {row}", file=sys.stderr)

    report = {
        "ran_at": today_dt.isoformat(timespec="minutes"),
        "added_count": len(added),
        "added": added,
        "skipped_count": len(skipped),
        "manual_review": manual,
        "errors": errors,
        "not_checked": ["Instagram", "ホトカミ", "ホリデーノート"],
    }
    if args.dry_run:
        print("dry-run：沒有寫入")
        return 0

    if added:
        database.extend(entry_from(item, today) for item in found)
        save_json(DATA_PATH, database)
        changelog = load_json(CHANGELOG_PATH, {"format_version": "1.0", "updates": []})
        changelog.setdefault("updates", []).insert(0, {
            "date": today,
            "summary": f"自動更新新增 {len(added)} 筆（圖鑑、おみくじ好き、社これくしょん的新頁）。未核實現場，沒有圖片。資料庫共 {len(database)} 筆。",
        })
        save_json(CHANGELOG_PATH, changelog)

    previous = load_json(LOG_PATH, [])
    if not isinstance(previous, list):
        previous = []
    previous.insert(0, report)
    save_json(LOG_PATH, previous[:24])
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"更新失敗：{error}", file=sys.stderr)
        raise SystemExit(1)
