"""AniLab2 streaming middleware for Hanabi.

Proxies AniLab2/AniDB metadata and exposes an HLS relay that rewrites manifest
URIs so the browser can play protected streams without CORS/Referer failures.

Run locally:  python server.py
Production:   uvicorn server:app --host 0.0.0.0 --port $PORT
"""

from __future__ import annotations

import base64
import ipaddress
import json
import math
import os
import re
import socket
import sys
import threading
import time
from collections import OrderedDict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, urljoin, urlparse
from xml.sax.saxutils import escape as xml_escape

import requests
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles

try:  # Optional Cloudflare-impersonating client for stubborn embeds.
    from curl_cffi import requests as cffi_requests
except Exception:  # pragma: no cover - optional dependency
    cffi_requests = None


ANILAB_BASE = "https://anilab2.amdapi.click"
ANIDB_BASE = "https://play.anidb.app"
KYOTO_BASE = "https://app.kyotoplayer.com"
ANISKIP_BASE = "https://api.aniskip.com"
ANILIST_GRAPHQL = "https://graphql.anilist.co"
ANIZIP_API = "https://api.ani.zip"
KITSU_API = "https://kitsu.io/api/edge"

APP_HEADERS = {
    "Accept": "application/json",
    "os-version": "33",
    "app-id": "com.kyotoplayer",
    "app-version": "126",
    "User-Agent": "okhttp/5.3.2",
    "Accept-Encoding": "gzip",
}

BROWSER_HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
}

STREAM_HEADERS = {
    "User-Agent": BROWSER_HEADERS["User-Agent"],
    "Referer": f"{ANIDB_BASE}/",
    "Origin": ANIDB_BASE,
    "Accept": "*/*",
}

M3U8_PATTERNS = (
    re.compile(r"""file\s*:\s*["'](https?://[^"']+?\.m3u8[^"']*)["']""", re.IGNORECASE),
    re.compile(r"""["']file["']\s*:\s*["'](https?://[^"']+?\.m3u8[^"']*)["']""", re.IGNORECASE),
    re.compile(r"""(https?://[^\s"'<>]+?\.m3u8[^\s"'<>]*)""", re.IGNORECASE),
)

HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "content-encoding",
}

DIST_DIR = Path(__file__).resolve().parent / "dist"
SKIP_TIMES_FILE = Path(
    os.environ.get("HANABI_SKIP_TIMES_FILE")
    or Path(__file__).resolve().with_name("skip_times.json")
)

app = FastAPI(title="Hanabi AniLab Gateway", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "HEAD", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["X-Image-Source"],
)


# ---------------------------------------------------------------------------
# Tiny TTL cache (upstream metadata only; streams are never cached forever)
# ---------------------------------------------------------------------------

_cache_lock = threading.Lock()
_cache: dict[str, tuple[float, object]] = {}


def cache_get(key: str):
    with _cache_lock:
        entry = _cache.get(key)
        if not entry:
            return None
        expires_at, value = entry
        if expires_at < time.time():
            _cache.pop(key, None)
            return None
        return value


def cache_set(key: str, value, ttl: float) -> None:
    with _cache_lock:
        if len(_cache) > 512:
            now = time.time()
            for k in [k for k, (exp, _) in _cache.items() if exp < now]:
                _cache.pop(k, None)
        _cache[key] = (time.time() + ttl, value)


# ---------------------------------------------------------------------------
# Upstream helpers
# ---------------------------------------------------------------------------


def _error_detail(exc: Exception) -> str:
    if isinstance(exc, requests.HTTPError) and exc.response is not None:
        return f"upstream returned HTTP {exc.response.status_code}"
    if isinstance(exc, requests.Timeout):
        return "upstream request timed out"
    return "upstream request failed"


def get_json(url: str, headers: dict | None = None, timeout: float = 12.0, ttl: float = 180.0):
    cached = cache_get(url)
    if cached is not None:
        return cached
    merged = {**APP_HEADERS, **(headers or {})}
    try:
        response = requests.get(url, headers=merged, timeout=timeout)
        response.raise_for_status()
        data = response.json()
    except Exception as exc:  # noqa: BLE001 - surfaced as a clean 502
        print(f"[anilab] error for {url}: {exc}", file=sys.stderr)
        raise HTTPException(status_code=502, detail=_error_detail(exc)) from exc
    cache_set(url, data, ttl)
    return data


def fetch_embed_html(embed_url: str) -> str:
    headers = {
        **BROWSER_HEADERS,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer": f"{ANIDB_BASE}/",
    }
    try:
        response = requests.get(embed_url, headers=headers, timeout=15, allow_redirects=True)
        response.raise_for_status()
        return response.text
    except Exception as exc:  # noqa: BLE001
        if cffi_requests is None:
            raise HTTPException(status_code=502, detail=_error_detail(exc)) from exc
        try:
            response = cffi_requests.get(embed_url, headers=headers, impersonate="chrome124", timeout=20)
            response.raise_for_status()
            return response.text
        except Exception as fallback_exc:  # noqa: BLE001
            raise HTTPException(status_code=502, detail=_error_detail(fallback_exc)) from fallback_exc


def extract_m3u8(html: str) -> str | None:
    for pattern in M3U8_PATTERNS:
        match = pattern.search(html)
        if match:
            return match.group(1).replace("\\/", "/")
    return None


# ---------------------------------------------------------------------------
# AniLab2 catalogue proxy
# ---------------------------------------------------------------------------


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "hanabi-anilab-gateway"}


@app.get("/api/kyoto/post")
def kyoto_post(id: str | None = None):
    if not id:
        raise HTTPException(status_code=400, detail="Missing id")
    return get_json(f"{KYOTO_BASE}/api/v4/post?id={quote(id)}")


@app.get("/api/anilab/home")
def anilab_home():
    return get_json(f"{ANILAB_BASE}/api/home", ttl=300)


@app.get("/api/anilab/search")
def anilab_search(keyword: str | None = None, page: int = 1):
    if not keyword:
        raise HTTPException(status_code=400, detail="Missing keyword")
    return get_json(
        f"{ANILAB_BASE}/api/search?query={quote(keyword)}&page={page}",
        ttl=600,
    )


@app.get("/api/anilab/post")
def anilab_post(id: str | None = None):
    if not id:
        raise HTTPException(status_code=400, detail="Missing id")
    return get_json(f"{ANILAB_BASE}/api/post?id={quote(id)}", ttl=600)


@app.get("/api/anilab/categories")
def anilab_categories():
    return get_json(f"{ANILAB_BASE}/api/categories", ttl=3600)


@app.get("/api/anilab/category")
def anilab_category(id: str | None = None, page: int = 1):
    if not id:
        raise HTTPException(status_code=400, detail="Missing id")
    return get_json(
        f"{ANILAB_BASE}/api/category?id={quote(id)}&page={page}",
        ttl=300,
    )


@app.get("/api/anilab/episodes")
def anilab_episodes(id: str | None = None):
    if not id:
        raise HTTPException(status_code=400, detail="Missing id")
    return get_json(
        f"{ANIDB_BASE}/api/anime/{quote(id)}/episodes",
        headers=BROWSER_HEADERS,
        ttl=600,
    )


@app.get("/api/anilab/servers")
def anilab_servers(id: str | None = None):
    if not id:
        raise HTTPException(status_code=400, detail="Missing episode id")
    return get_json(
        f"{ANIDB_BASE}/api/episode/{quote(id)}/servers",
        headers=BROWSER_HEADERS,
        ttl=300,
    )


@app.get("/api/anilab/iframe")
def anilab_iframe(id: str | None = None):
    if not id:
        raise HTTPException(status_code=400, detail="Missing server id")
    return get_json(
        f"{ANIDB_BASE}/api/episode/{quote(id)}/iframe",
        headers={
            **BROWSER_HEADERS,
            "X-Requested-With": "PLAY",
            "Referer": f"{ANIDB_BASE}/",
        },
        ttl=300,
    )


@app.get("/api/anilab/embed")
def anilab_embed(url: str | None = None):
    if not url:
        raise HTTPException(status_code=400, detail="Missing url")
    html = fetch_embed_html(url)
    return HTMLResponse(html)


@app.get("/api/anilab/stream")
def anilab_stream(id: str | None = None):
    if not id:
        raise HTTPException(status_code=400, detail="Missing server id")

    cache_key = f"stream:{id}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    iframe = get_json(
        f"{ANIDB_BASE}/api/episode/{quote(id)}/iframe",
        headers={
            **BROWSER_HEADERS,
            "X-Requested-With": "PLAY",
            "Referer": f"{ANIDB_BASE}/",
        },
        ttl=300,
    )
    embed_url = iframe.get("link") or iframe.get("url")
    if not embed_url:
        raise HTTPException(status_code=502, detail="Embed link missing in iframe response")

    html = fetch_embed_html(embed_url)
    stream_url = extract_m3u8(html)
    if not stream_url:
        raise HTTPException(status_code=502, detail="No m3u8 source found in embed page")

    payload = {"url": stream_url, "embedUrl": embed_url}
    cache_set(cache_key, payload, 300)
    return payload


_local_skip_lock = threading.Lock()
_local_skip_cache: tuple[float, dict] | None = None


class SkipLookupError(RuntimeError):
    pass


def _finite_float(value) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _skip_segment(start, end, duration: float | None = None) -> dict | None:
    start_value = _finite_float(start)
    end_value = _finite_float(end)
    if start_value is None or end_value is None:
        return None
    if start_value < 0:
        start_value = 0.0
    if end_value <= start_value:
        return None
    if duration and duration > 0:
        if start_value >= duration:
            return None
        end_value = min(end_value, duration)
        if end_value <= start_value:
            return None
    return {"start": round(start_value, 3), "end": round(end_value, 3)}


def _skip_segment_from_value(value, duration: float | None):
    if isinstance(value, (list, tuple)) and len(value) >= 2:
        return _skip_segment(value[0], value[1], duration)
    if isinstance(value, dict):
        start = value.get("start", value.get("startSec", value.get("start_sec")))
        end = value.get("end", value.get("endSec", value.get("end_sec")))
        return _skip_segment(start, end, duration)
    return None


def _local_skip_data() -> dict:
    global _local_skip_cache
    try:
        mtime = SKIP_TIMES_FILE.stat().st_mtime
    except OSError:
        return {}
    with _local_skip_lock:
        if _local_skip_cache and _local_skip_cache[0] == mtime:
            return _local_skip_cache[1]
    try:
        data = json.loads(SKIP_TIMES_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        print(f"[skip] ignoring {SKIP_TIMES_FILE}: {exc}", file=sys.stderr)
        data = {}
    if not isinstance(data, dict):
        data = {}
    with _local_skip_lock:
        _local_skip_cache = (mtime, data)
    return data


def _local_skip_segments(keys: list[str], episode: int, duration: float | None):
    data = _local_skip_data()
    for key in keys:
        anime = data.get(key)
        if not isinstance(anime, dict):
            continue
        entry = anime.get(str(episode))
        if not isinstance(entry, dict):
            continue
        intro = _skip_segment_from_value(entry.get("intro"), duration)
        outro = _skip_segment_from_value(entry.get("outro"), duration)
        if not intro and not outro:
            continue
        return {
            "intro": intro,
            "outro": outro,
            "episodeLength": _finite_float(entry.get("episodeLength")),
        }
    return None


def _anilist_mal_id(anilist_id: int) -> int | None:
    cache_key = f"anilist:mal:{anilist_id}"
    cached = cache_get(cache_key)
    if isinstance(cached, dict):
        return cached.get("malId")
    query = "query ($id: Int) { Media(id: $id, type: ANIME) { idMal } }"
    try:
        response = requests.post(
            ANILIST_GRAPHQL,
            json={"query": query, "variables": {"id": anilist_id}},
            headers={"Accept": "application/json"},
            timeout=8,
        )
        response.raise_for_status()
        media = (response.json().get("data") or {}).get("Media") or {}
        mal_id = media.get("idMal")
        mal_id = int(mal_id) if mal_id else None
    except Exception as exc:
        print(f"[skip] AniList lookup failed for {anilist_id}: {exc}", file=sys.stderr)
        raise SkipLookupError("anilist_unavailable") from exc
    cache_set(cache_key, {"malId": mal_id}, 7 * 24 * 3600 if mal_id else 24 * 3600)
    return mal_id


def _aniskip_segments(mal_id: int, episode: int, duration: float | None) -> dict:
    bucket = int((duration or 0) // 5) * 5
    cache_key = f"aniskip:{mal_id}:{episode}:{bucket}"
    cached = cache_get(cache_key)
    if isinstance(cached, dict):
        return cached
    params = [
        ("types[]", "op"),
        ("types[]", "ed"),
        ("episodeLength", str(duration or 0)),
    ]
    try:
        response = None
        last_error = None
        for attempt in range(2):
            try:
                response = requests.get(
                    f"{ANISKIP_BASE}/v2/skip-times/{mal_id}/{episode}",
                    params=params,
                    headers={"Accept": "application/json"},
                    timeout=6,
                )
            except requests.RequestException as exc:
                last_error = exc
                if attempt == 0:
                    time.sleep(0.6)
                    continue
                response = None
                break
            if response.status_code in (429, 500, 502, 503, 504) and attempt == 0:
                response.close()
                time.sleep(0.6)
                continue
            break
        if response is None:
            print(
                f"[skip] AniSkip request failed for {mal_id}/{episode}: {last_error}",
                file=sys.stderr,
            )
            result = {"status": "unavailable", "results": []}
            cache_set(cache_key, result, 60)
            return result
    except Exception as exc:
        print(f"[skip] AniSkip request failed for {mal_id}/{episode}: {exc}", file=sys.stderr)
        result = {"status": "unavailable", "results": []}
        cache_set(cache_key, result, 60)
        return result
    if response.status_code == 404:
        response.close()
        result = {"status": "not_found", "results": []}
        cache_set(cache_key, result, 3600)
        return result
    if response.status_code != 200:
        print(
            f"[skip] AniSkip returned HTTP {response.status_code} for {mal_id}/{episode}",
            file=sys.stderr,
        )
        response.close()
        result = {"status": "unavailable", "results": []}
        cache_set(cache_key, result, 60)
        return result
    try:
        body = response.json()
    except ValueError:
        result = {"status": "unavailable", "results": []}
        cache_set(cache_key, result, 60)
        return result
    results = body.get("results") if isinstance(body, dict) and body.get("found") else []
    if not isinstance(results, list):
        results = []
    result = {"status": "ok" if results else "not_found", "results": results}
    cache_set(cache_key, result, 6 * 3600 if results else 3600)
    return result


def _best_aniskip_segment(results: list, skip_type: str, duration: float | None):
    candidates = []
    for item in results:
        if not isinstance(item, dict) or item.get("skipType") != skip_type:
            continue
        interval = item.get("interval")
        if not isinstance(interval, dict):
            continue
        segment = _skip_segment(interval.get("startTime"), interval.get("endTime"), duration)
        if segment:
            candidates.append((item, segment))
    if not candidates:
        return None, None
    if duration and duration > 0:
        candidates.sort(
            key=lambda pair: abs(
                (_finite_float(pair[0].get("episodeLength")) or 1e9) - duration
            )
        )
    item, segment = candidates[0]
    return segment, _finite_float(item.get("episodeLength"))


def _skip_confidence(episode_length: float | None, duration: float | None, local_used: bool) -> str:
    if local_used:
        return "high"
    if not episode_length or not duration:
        return "high"
    delta = abs(episode_length - duration)
    if delta <= 15:
        return "high"
    if delta <= 60:
        return "medium"
    return "low"


@app.get("/api/skip-times")
def skip_times(
    anilistId: int | None = None,
    malId: int | None = None,
    episode: int = 1,
    duration: float | None = None,
):
    if anilistId is None and malId is None:
        raise HTTPException(status_code=400, detail="anilistId or malId is required")
    if anilistId is not None and not (1 <= anilistId <= 1_000_000_000):
        raise HTTPException(status_code=400, detail="anilistId is out of range")
    if malId is not None and not (1 <= malId <= 100_000_000):
        raise HTTPException(status_code=400, detail="malId is out of range")
    if not (1 <= episode <= 10_000):
        raise HTTPException(status_code=400, detail="episode is out of range")
    if duration is not None:
        duration = _finite_float(duration)
        if duration is not None and not (30 <= duration <= 6 * 3600):
            duration = None

    resolved_mal = malId
    lookup_error = False
    if resolved_mal is None and anilistId is not None:
        try:
            resolved_mal = _anilist_mal_id(anilistId)
        except SkipLookupError:
            lookup_error = True

    local_keys = []
    if anilistId is not None:
        local_keys.append(str(anilistId))
    if resolved_mal is not None:
        local_keys.append(f"mal:{resolved_mal}")
    local = _local_skip_segments(local_keys, episode, duration)

    intro = local["intro"] if local else None
    outro = local["outro"] if local else None
    episode_length = local["episodeLength"] if local else None
    sources = ["local"] if local else []

    if (not intro or not outro) and resolved_mal is not None:
        upstream = _aniskip_segments(resolved_mal, episode, duration)
        if upstream["status"] == "ok":
            best_intro, intro_length = _best_aniskip_segment(upstream["results"], "op", duration)
            best_outro, outro_length = _best_aniskip_segment(upstream["results"], "ed", duration)
            added = False
            if intro is None and best_intro:
                intro = best_intro
                added = True
            if outro is None and best_outro:
                outro = best_outro
                added = True
            if episode_length is None:
                episode_length = intro_length or outro_length
            if added:
                sources.append("aniskip")
        elif upstream["status"] == "unavailable":
            lookup_error = True

    if intro or outro:
        return {
            "available": True,
            "anilistId": anilistId,
            "malId": resolved_mal,
            "episode": episode,
            "intro": intro,
            "outro": outro,
            "episodeLength": round(episode_length, 3) if episode_length else None,
            "confidence": _skip_confidence(episode_length, duration, bool(local)),
            "sources": sources,
        }

    reason = "not_found"
    if resolved_mal is None:
        reason = "upstream_unavailable" if lookup_error else "no_mal_id"
    elif lookup_error:
        reason = "upstream_unavailable"
    return {
        "available": False,
        "anilistId": anilistId,
        "malId": resolved_mal,
        "episode": episode,
        "intro": None,
        "outro": None,
        "reason": reason,
        "sources": sources,
    }


_art_lock = threading.Lock()
_art_cache: OrderedDict[str, tuple[float, dict]] = OrderedDict()
_ART_CACHE_MAX = 96
_ART_TTL = 24 * 3600
_ART_PLACEHOLDER_TTL = 60


def _art_get(key: str):
    with _art_lock:
        entry = _art_cache.get(key)
        if not entry:
            return None
        expires_at, value = entry
        if expires_at < time.time():
            _art_cache.pop(key, None)
            return None
        _art_cache.move_to_end(key)
        return value


def _art_set(key: str, value: dict, ttl: float = _ART_TTL) -> None:
    with _art_lock:
        _art_cache[key] = (time.time() + ttl, value)
        _art_cache.move_to_end(key)
        while len(_art_cache) > _ART_CACHE_MAX:
            _art_cache.popitem(last=False)


def _sniff_image_type(data: bytes, declared: str) -> str | None:
    if declared == "image/jpg":
        declared = "image/jpeg"
    if declared.startswith("image/") and declared != "image/svg+xml":
        return declared
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"GIF8"):
        return "image/gif"
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def _fetch_image(url: str) -> dict | None:
    if not url:
        return None
    current = url
    data = b""
    declared = ""
    for _ in range(4):
        try:
            _assert_public_url(current)
        except HTTPException:
            return None
        try:
            response = requests.get(
                current,
                headers={
                    **BROWSER_HEADERS,
                    "Accept": "image/jpeg,image/png,image/webp,image/*;q=0.8",
                },
                timeout=8,
                stream=True,
                allow_redirects=False,
            )
        except requests.RequestException as exc:
            print(f"[art] image fetch failed for {current}: {exc}", file=sys.stderr)
            return None
        try:
            if response.is_redirect:
                location = response.headers.get("Location")
                if not location:
                    return None
                current = urljoin(current, location)
                continue
            response.raise_for_status()
            declared = (
                (response.headers.get("Content-Type") or "")
                .split(";", 1)[0]
                .strip()
                .lower()
            )
            chunks = []
            total = 0
            for chunk in response.iter_content(64 * 1024):
                if not chunk:
                    continue
                total += len(chunk)
                if total > 4 * 1024 * 1024:
                    return None
                chunks.append(chunk)
            data = b"".join(chunks)
            break
        except requests.RequestException as exc:
            print(f"[art] image fetch failed for {current}: {exc}", file=sys.stderr)
            return None
        finally:
            response.close()
    else:
        return None
    content_type = _sniff_image_type(data, declared)
    if not content_type or not data:
        return None
    return {"bytes": data, "content_type": content_type}


def _episode_number_from_title(value, fallback: int) -> int:
    text = str(value or "")
    match = re.search(r"(?:episode|ep\.?)\s*#?\s*(\d+)", text, re.IGNORECASE)
    if not match:
        match = re.match(r"\s*(\d+)\s*[-–—:.]", text)
    if match:
        try:
            return int(match.group(1))
        except ValueError:
            pass
    return fallback


def _clean_episode_title(value, number: int | None = None) -> str:
    text = " ".join(str(value or "").split()).strip()
    if not text:
        return ""
    text = re.sub(
        r"^\s*(?:episode|ep\.?)\s*#?\s*\d+\s*[-–—:.]?\s*",
        "",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r"^\s*\d+\s*[-–—:.]\s*", "", text)
    if not text:
        return ""
    if re.fullmatch(r"(?:episode|ep\.?)\s*#?\s*\d+", text, flags=re.IGNORECASE):
        return ""
    if number is not None:
        normalized = re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()
        if normalized in {f"episode {number}", f"ep {number}"}:
            return ""
    return text[:200]


def _anilist_art_media(anilist_id: int) -> dict:
    cache_key = f"anilist:art:{anilist_id}"
    cached = cache_get(cache_key)
    if isinstance(cached, dict):
        return cached
    query = (
        "query ($id: Int) { Media(id: $id, type: ANIME) { id idMal "
        "title { romaji english } "
        "coverImage { extraLarge large medium color } "
        "streamingEpisodes { title thumbnail site } } }"
    )
    try:
        response = requests.post(
            ANILIST_GRAPHQL,
            json={"query": query, "variables": {"id": anilist_id}},
            headers={"Accept": "application/json"},
            timeout=8,
        )
        response.raise_for_status()
        media = (response.json().get("data") or {}).get("Media") or {}
    except Exception as exc:
        print(f"[art] AniList lookup failed for {anilist_id}: {exc}", file=sys.stderr)
        cache_set(cache_key, {}, _ART_PLACEHOLDER_TTL)
        return {}
    titles = media.get("title") or {}
    cover = media.get("coverImage") or {}
    streaming = []
    raw_episodes = media.get("streamingEpisodes") or []
    if isinstance(raw_episodes, list):
        for index, item in enumerate(raw_episodes, start=1):
            if not isinstance(item, dict):
                continue
            thumbnail = item.get("thumbnail")
            if not thumbnail:
                continue
            streaming.append(
                {
                    "number": _episode_number_from_title(item.get("title"), index),
                    "url": thumbnail,
                    "title": item.get("title") or "",
                    "site": item.get("site") or "",
                    "source": "anilist",
                }
            )
    mal_id = media.get("idMal")
    try:
        mal_id = int(mal_id) if mal_id else None
    except (TypeError, ValueError):
        mal_id = None
    result = {
        "id": media.get("id") or anilist_id,
        "idMal": mal_id,
        "title": titles.get("english") or titles.get("romaji") or "",
        "cover": cover.get("medium") or cover.get("large") or cover.get("extraLarge") or "",
        "coverLarge": cover.get("large") or cover.get("extraLarge") or cover.get("medium") or "",
        "color": cover.get("color") or "",
        "streaming": streaming,
    }
    cache_set(cache_key, result, 6 * 3600)
    return result


def _kitsu_anime_id(mal_id: int) -> int | None:
    cache_key = f"kitsu:anime:{mal_id}"
    cached = cache_get(cache_key)
    if isinstance(cached, dict):
        return cached.get("id")
    try:
        response = requests.get(
            f"{KITSU_API}/mappings",
            params={
                "filter[externalSite]": "myanimelist/anime",
                "filter[externalId]": str(mal_id),
                "include": "item",
            },
            headers={
                "Accept": "application/vnd.api+json",
                "User-Agent": BROWSER_HEADERS["User-Agent"],
            },
            timeout=8,
        )
        response.raise_for_status()
        rows = response.json().get("data") or []
        item = {}
        if rows:
            item = ((rows[0].get("relationships") or {}).get("item") or {}).get("data") or {}
        kitsu_id = int(item.get("id")) if item.get("id") else None
    except Exception as exc:
        print(f"[art] Kitsu mapping failed for MAL {mal_id}: {exc}", file=sys.stderr)
        return None
    cache_set(cache_key, {"id": kitsu_id}, 7 * 24 * 3600 if kitsu_id else 24 * 3600)
    return kitsu_id


def _kitsu_episodes(kitsu_id: int) -> dict:
    cache_key = f"kitsu:episodes:v2:{kitsu_id}"
    cached = cache_get(cache_key)
    if isinstance(cached, dict):
        return cached
    episodes = {}
    url = f"{KITSU_API}/anime/{kitsu_id}/episodes"
    params = {"page[limit]": "20", "sort": "number"}
    for _ in range(10):
        try:
            response = requests.get(
                url,
                params=params,
                headers={
                    "Accept": "application/vnd.api+json",
                    "User-Agent": BROWSER_HEADERS["User-Agent"],
                },
                timeout=8,
            )
            response.raise_for_status()
            body = response.json()
        except Exception as exc:
            print(f"[art] Kitsu episodes failed for {kitsu_id}: {exc}", file=sys.stderr)
            break
        for item in body.get("data") or []:
            attributes = item.get("attributes") or {}
            try:
                number = int(attributes.get("number"))
            except (TypeError, ValueError):
                continue
            thumbnail = attributes.get("thumbnail") or {}
            image = (
                thumbnail.get("large")
                or thumbnail.get("medium")
                or thumbnail.get("original")
            )
            titles = attributes.get("titles")
            title = attributes.get("canonicalTitle") or (
                titles.get("en") if isinstance(titles, dict) else ""
            )
            episodes[number] = {
                "number": number,
                "url": image or "",
                "title": title or "",
                "site": "Kitsu",
                "source": "kitsu",
            }
        next_url = (body.get("links") or {}).get("next")
        if not next_url:
            break
        url, params = next_url, None
    cache_set(cache_key, episodes, 6 * 3600)
    return episodes


def _kitsu_episode_stills(kitsu_id: int) -> dict:
    return {
        number: item
        for number, item in _kitsu_episodes(kitsu_id).items()
        if item.get("url")
    }


def _clean_text(value) -> str:
    return " ".join(str(value or "").split()).strip()


def _as_int(value, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _as_float(value, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _parse_date(value):
    text = _clean_text(value)
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _anizip_mapping(anilist_id: int) -> dict:
    cache_key = f"anizip:mapping:{anilist_id}"
    cached = cache_get(cache_key)
    if isinstance(cached, dict):
        return cached
    try:
        response = requests.get(
            f"{ANIZIP_API}/mappings",
            params={"anilist_id": anilist_id},
            headers={
                "Accept": "application/json",
                "User-Agent": BROWSER_HEADERS["User-Agent"],
            },
            timeout=10,
        )
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict):
            raise ValueError("unexpected payload")
    except Exception as exc:
        print(f"[fallback] ani.zip mapping failed for {anilist_id}: {exc}", file=sys.stderr)
        return {}
    cache_set(cache_key, payload, 6 * 3600)
    return payload


def _kitsu_anime(kitsu_id: int) -> dict:
    cache_key = f"kitsu:anime:meta:{kitsu_id}"
    cached = cache_get(cache_key)
    if isinstance(cached, dict):
        return cached
    try:
        response = requests.get(
            f"{KITSU_API}/anime/{kitsu_id}",
            params={"include": "categories,productions"},
            headers={
                "Accept": "application/vnd.api+json",
                "User-Agent": BROWSER_HEADERS["User-Agent"],
            },
            timeout=8,
        )
        response.raise_for_status()
        body = response.json()
        data = body.get("data") or {}
        result = {
            "attributes": data.get("attributes") or {},
            "included": body.get("included") or [],
        }
    except Exception as exc:
        print(f"[fallback] Kitsu metadata failed for {kitsu_id}: {exc}", file=sys.stderr)
        return {}
    cache_set(cache_key, result, 6 * 3600)
    return result


def _image_url(value) -> str:
    if not isinstance(value, dict):
        return ""
    for key in ("large", "original", "medium", "small"):
        url = _clean_text(value.get(key))
        if url:
            return url
    return ""


def _mapping_image(images, cover_type: str) -> str:
    if not isinstance(images, list):
        return ""
    for item in images:
        if not isinstance(item, dict):
            continue
        if str(item.get("coverType") or "").lower() != cover_type.lower():
            continue
        url = _clean_text(item.get("url"))
        if url:
            return url
    return ""


def _fallback_genres(included) -> list[str]:
    genres: list[str] = []
    aliases = {"science-fiction": "sci-fi", "science fiction": "sci-fi"}
    for item in included or []:
        if not isinstance(item, dict) or item.get("type") not in ("categories", "genres"):
            continue
        attributes = item.get("attributes") or {}
        value = attributes.get("slug") or attributes.get("title") or ""
        slug = _clean_text(value).lower().replace("_", "-").replace(" ", "-")
        slug = aliases.get(slug, slug)
        if slug and slug not in genres:
            genres.append(slug)
    return genres[:8]


def _fallback_status(attributes: dict, mapping: dict) -> str:
    raw = str(attributes.get("status") or "").lower()
    if raw in {"current", "airing", "releasing"}:
        return "airing"
    if raw in {"finished", "complete"}:
        return "finished"
    if raw in {"tba", "unreleased", "upcoming", "not_yet_released"}:
        return "upcoming"

    dates = []
    raw_episodes = mapping.get("episodes")
    if isinstance(raw_episodes, dict):
        for item in raw_episodes.values():
            if not isinstance(item, dict):
                continue
            parsed = _parse_date(item.get("airDateUtc") or item.get("airDate"))
            if parsed:
                dates.append(parsed)
    if dates:
        now = datetime.now(timezone.utc)
        if all(value > now for value in dates):
            return "upcoming"
        if any(value > now for value in dates):
            return "airing"
    return "finished"


def _fallback_season(attributes: dict, mapping: dict) -> str:
    parsed = _parse_date(attributes.get("startDate"))
    if not parsed:
        raw_episodes = mapping.get("episodes")
        if isinstance(raw_episodes, dict):
            for item in raw_episodes.values():
                if isinstance(item, dict):
                    parsed = _parse_date(item.get("airDateUtc") or item.get("airDate"))
                    if parsed:
                        break
    if not parsed:
        return "Winter"
    month = parsed.month
    if month <= 3:
        return "Winter"
    if month <= 6:
        return "Spring"
    if month <= 9:
        return "Summer"
    return "Fall"


def _fallback_episodes(
    mapping: dict,
    kitsu_id: int,
    anime_id: str,
    anime_title: str,
    episode_count: int,
    default_duration: int,
) -> list[dict]:
    episodes: list[dict] = []
    seen: set[int] = set()
    raw_episodes = mapping.get("episodes")

    if isinstance(raw_episodes, dict):
        for key, item in raw_episodes.items():
            if not isinstance(item, dict):
                continue
            number = _as_int(
                item.get("episodeNumber") or item.get("episode") or key,
                0,
            )
            if number <= 0 or number in seen:
                continue
            seen.add(number)
            title = item.get("title")
            if isinstance(title, dict):
                title = title.get("en") or title.get("x-jat") or title.get("ja")
            title = _clean_episode_title(title, number) or f"Episode {number}"
            synopsis = _clean_text(item.get("overview")) or f"Episode {number} of {anime_title}."
            episodes.append(
                {
                    "id": f"{anime_id}-s1-e{number}",
                    "seasonId": f"{anime_id}-season-1",
                    "animeId": anime_id,
                    "number": number,
                    "title": title,
                    "synopsis": synopsis,
                    "durationMinutes": _as_int(item.get("runtime") or item.get("length"), default_duration),
                    "thumbnail": _clean_text(item.get("image")) or None,
                }
            )

    if not episodes and kitsu_id:
        for number, item in _kitsu_episodes(kitsu_id).items():
            if number <= 0 or number in seen:
                continue
            seen.add(number)
            title = _clean_episode_title(item.get("title"), number) or f"Episode {number}"
            episodes.append(
                {
                    "id": f"{anime_id}-s1-e{number}",
                    "seasonId": f"{anime_id}-season-1",
                    "animeId": anime_id,
                    "number": number,
                    "title": title,
                    "synopsis": f"Episode {number} of {anime_title}.",
                    "durationMinutes": default_duration,
                    "thumbnail": _clean_text(item.get("url")) or None,
                }
            )

    if not episodes:
        for number in range(1, min(max(episode_count, 0), 200) + 1):
            episodes.append(
                {
                    "id": f"{anime_id}-s1-e{number}",
                    "seasonId": f"{anime_id}-season-1",
                    "animeId": anime_id,
                    "number": number,
                    "title": f"Episode {number}",
                    "synopsis": f"Episode {number} of {anime_title}.",
                    "durationMinutes": default_duration,
                    "thumbnail": None,
                }
            )

    episodes.sort(key=lambda item: item["number"])
    return episodes


def _anime_detail_fallback(anilist_id: int) -> dict:
    mapping = _anizip_mapping(anilist_id)
    if not mapping:
        raise HTTPException(status_code=503, detail="Metadata fallback sources are unavailable")

    raw_mappings = mapping.get("mappings")
    mappings = raw_mappings if isinstance(raw_mappings, dict) else {}
    kitsu_id = _as_int(mappings.get("kitsu_id"), 0)
    if not kitsu_id:
        mal_id = _as_int(mappings.get("mal_id"), 0)
        if mal_id:
            kitsu_id = _kitsu_anime_id(mal_id) or 0

    kitsu = _kitsu_anime(kitsu_id) if kitsu_id else {}
    attributes = kitsu.get("attributes") or {}
    included = kitsu.get("included") or []

    titles = mapping.get("titles") if isinstance(mapping.get("titles"), dict) else {}
    kitsu_titles = attributes.get("titles") if isinstance(attributes.get("titles"), dict) else {}
    title = (
        _clean_text(titles.get("en"))
        or _clean_text(attributes.get("canonicalTitle"))
        or _clean_text(kitsu_titles.get("en"))
        or _clean_text(kitsu_titles.get("en_jp"))
        or _clean_text(titles.get("x-jat"))
        or _clean_text(titles.get("ja"))
    )
    if not title:
        raise HTTPException(status_code=503, detail="Metadata fallback has no title")

    native_title = (
        _clean_text(titles.get("ja"))
        or _clean_text(kitsu_titles.get("ja_jp"))
        or title
    )
    synonyms: list[str] = []
    for value in (
        kitsu_titles.get("en_jp"),
        kitsu_titles.get("ja_jp"),
        titles.get("x-jat"),
        titles.get("ja"),
        *(attributes.get("abbreviatedTitles") or []),
    ):
        text = _clean_text(value)
        if text and text.lower() != title.lower() and text not in synonyms:
            synonyms.append(text)

    anime_id = f"anilist-{anilist_id}"
    slug_text = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-") or "anime"
    episode_count = _as_int(mapping.get("episodeCount") or attributes.get("episodeCount"), 0)
    duration = _as_int(attributes.get("episodeLength"), 0)
    episodes = _fallback_episodes(mapping, kitsu_id, anime_id, title, episode_count, duration)
    episode_count = max(episode_count, len(episodes))

    format_map = {
        "tv": "TV",
        "movie": "Movie",
        "ona": "ONA",
        "ova": "OVA",
        "special": "Special",
        "music": "Special",
    }
    raw_format = str(attributes.get("subtype") or "").lower()
    anime_format = format_map.get(raw_format, "TV")

    rating = _as_float(attributes.get("averageRating")) / 10
    if rating <= 0:
        ratings = []
        raw_episodes = mapping.get("episodes")
        if isinstance(raw_episodes, dict):
            for item in raw_episodes.values():
                if isinstance(item, dict):
                    value = _as_float(item.get("rating"))
                    if value > 0:
                        ratings.append(value)
        if ratings:
            rating = sum(ratings) / len(ratings)

    start_date = _parse_date(attributes.get("startDate"))
    year = start_date.year if start_date else 0
    if not year:
        raw_episodes = mapping.get("episodes")
        if isinstance(raw_episodes, dict):
            for item in raw_episodes.values():
                if isinstance(item, dict):
                    parsed = _parse_date(item.get("airDateUtc") or item.get("airDate"))
                    if parsed:
                        year = parsed.year
                        break

    youtube_id = _clean_text(attributes.get("youtubeVideoId"))
    poster = (
        _image_url(attributes.get("posterImage"))
        or _mapping_image(mapping.get("images"), "Poster")
    )
    cover = (
        _image_url(attributes.get("coverImage"))
        or _mapping_image(mapping.get("images"), "Banner")
        or _mapping_image(mapping.get("images"), "Fanart")
    )

    status = _fallback_status(attributes, mapping)
    anime = {
        "id": anime_id,
        "slug": f"{anilist_id}-{slug_text}",
        "title": title,
        "nativeTitle": native_title,
        "synonyms": synonyms,
        "synopsis": (
            _clean_text(attributes.get("synopsis"))
            or _clean_text(attributes.get("description"))
            or "No synopsis available for this title yet."
        ),
        "status": status,
        "format": anime_format,
        "year": year,
        "season": _fallback_season(attributes, mapping),
        "rating": round(rating, 1),
        "popularity": _as_int(attributes.get("userCount"), 0),
        "episodeCount": episode_count,
        "poster": poster,
        "cover": cover or poster,
        "genres": _fallback_genres(included),
        "studio": "Unknown studio",
        "upcoming": status == "upcoming",
    }

    sources = ["anizip"]
    if attributes:
        sources.append("kitsu")

    return {
        "anilistId": anilist_id,
        "anime": anime,
        "episodes": episodes,
        "externalLinks": [],
        "related": [],
        "trailerUrl": f"https://www.youtube.com/embed/{youtube_id}" if youtube_id else "",
        "sources": sources,
    }


def _anizip_art_media(anilist_id: int) -> dict:
    mapping = _anizip_mapping(anilist_id)
    if not mapping:
        return {}
    mappings = mapping.get("mappings") or {}
    titles = mapping.get("titles") or {}
    title = titles.get("en") or titles.get("x-jat") or titles.get("ja") or ""
    poster = _mapping_image(mapping.get("images"), "Poster")
    episodes = _fallback_episodes(mapping, 0, f"anilist-{anilist_id}", title, 0, 0)
    return {
        "id": anilist_id,
        "idMal": _as_int(mappings.get("mal_id")) or None,
        "kitsuId": _as_int(mappings.get("kitsu_id")) or None,
        "title": title,
        "cover": poster,
        "coverLarge": poster,
        "streaming": [
            {
                "number": item["number"],
                "url": item["thumbnail"],
                "title": item["title"],
                "source": "anizip",
            }
            for item in episodes
            if item.get("thumbnail")
        ],
    }


def _episode_still_candidates(media: dict, episode: int):
    for item in media.get("streaming") or []:
        if item.get("number") == episode and item.get("url"):
            yield item
            break
    kitsu_id = media.get("kitsuId")
    mal_id = media.get("idMal")
    if not kitsu_id and mal_id:
        kitsu_id = _kitsu_anime_id(int(mal_id))
    if not kitsu_id:
        return
    still = _kitsu_episode_stills(kitsu_id).get(episode)
    if still:
        yield still


def _safe_color(value: str) -> str:
    return value if re.fullmatch(r"#[0-9a-fA-F]{6}", value or "") else "#E5E9ED"


def _episode_placeholder(media: dict, episode: int, width: int) -> dict:
    height = max(90, round(width * 9 / 16))
    title = " ".join(str(media.get("title") or f"Episode {episode}").split())[
        : max(10, round(width / 12))
    ]
    accent = _safe_color(str(media.get("color") or ""))
    poster = _fetch_image(
        (media.get("coverLarge") if width > 480 else media.get("cover"))
        or media.get("cover")
        or ""
    )
    zoom = 1.02 + ((episode * 7) % 6) * 0.05
    position_x = ((episode * 23) % 100) / 100
    position_y = ((episode * 41) % 100) / 100
    image_width = width * zoom
    image_height = height * zoom
    offset_x = -(image_width - width) * position_x
    offset_y = -(image_height - height) * position_y
    if poster:
        encoded = base64.b64encode(poster["bytes"]).decode("ascii")
        background = (
            f'<image href="data:{poster["content_type"]};base64,{encoded}" '
            f'x="{offset_x:.2f}" y="{offset_y:.2f}" '
            f'width="{image_width:.2f}" height="{image_height:.2f}" '
            'preserveAspectRatio="xMidYMid slice" clip-path="url(#clip)"/>'
        )
        defs = (
            '<defs><clipPath id="clip"><rect width="100%" height="100%"/></clipPath>'
            '<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">'
            '<stop offset="0.35" stop-color="#000" stop-opacity="0"/>'
            '<stop offset="1" stop-color="#000" stop-opacity="0.9"/>'
            "</linearGradient></defs>"
        )
    else:
        background = '<rect width="100%" height="100%" fill="#16191D"/>'
        defs = (
            '<defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">'
            '<stop offset="0.3" stop-color="#000" stop-opacity="0.1"/>'
            '<stop offset="1" stop-color="#000" stop-opacity="0.9"/>'
            "</linearGradient></defs>"
        )
    title_size = max(11, round(width * 0.026))
    number_size = max(28, round(width * 0.1))
    label_size = max(9, round(width * 0.021))
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}" role="img" aria-label="Episode {episode}">'
        f"{defs}{background}"
        '<rect width="100%" height="100%" fill="url(#fade)"/>'
        f'<rect x="{round(width * 0.05)}" y="{height - 68}" '
        f'width="{round(width * 0.09)}" height="3" fill="{accent}"/>'
        f'<text x="{round(width * 0.05)}" y="{height - 48}" fill="{accent}" '
        'font-family="Arial, Helvetica, sans-serif" '
        f'font-size="{label_size}" font-weight="700" letter-spacing="3">EPISODE</text>'
        f'<text x="{round(width * 0.045)}" y="{height - 12}" fill="#FFFFFF" '
        'font-family="Arial, Helvetica, sans-serif" '
        f'font-size="{number_size}" font-weight="700">{episode:02d}</text>'
        f'<text x="{width - round(width * 0.05)}" y="{height - 20}" fill="#FFFFFF" '
        'fill-opacity="0.88" text-anchor="end" '
        'font-family="Arial, Helvetica, sans-serif" '
        f'font-size="{title_size}" font-weight="600">{xml_escape(title)}</text>'
        "</svg>"
    )
    return {
        "bytes": svg.encode("utf-8"),
        "content_type": "image/svg+xml; charset=utf-8",
        "source": "generated",
    }


def _image_response(payload: dict) -> Response:
    source = payload.get("source", "generated")
    max_age = _ART_PLACEHOLDER_TTL if source == "generated" else _ART_TTL
    return Response(
        content=payload["bytes"],
        media_type=payload["content_type"],
        headers={
            "Cache-Control": f"public, max-age={max_age}",
            "X-Image-Source": source,
        },
    )


@app.get("/api/episode-image")
def episode_image(anilistId: int, episode: int = 1, width: int = 480):
    if not (1 <= anilistId <= 1_000_000_000):
        raise HTTPException(status_code=400, detail="anilistId is out of range")
    if not (1 <= episode <= 10_000):
        raise HTTPException(status_code=400, detail="episode is out of range")
    width = max(160, min(width, 960))
    cache_key = f"episode-image:v2:{anilistId}:{episode}:{width}"
    cached = _art_get(cache_key)
    if cached:
        return _image_response(cached)
    media = _anilist_art_media(anilistId)
    for still in _episode_still_candidates(media, episode):
        fetched = _fetch_image(still["url"])
        if fetched:
            payload = {**fetched, "source": still.get("source", "external")}
            _art_set(cache_key, payload)
            return _image_response(payload)
    mapped_media = _anizip_art_media(anilistId)
    for still in _episode_still_candidates(mapped_media, episode):
        fetched = _fetch_image(still["url"])
        if fetched:
            payload = {**fetched, "source": still.get("source", "external")}
            _art_set(cache_key, payload)
            return _image_response(payload)
    if mapped_media:
        media = {**mapped_media, **{key: value for key, value in media.items() if value}}
    payload = _episode_placeholder(media, episode, width)
    _art_set(cache_key, payload, _ART_PLACEHOLDER_TTL)
    return _image_response(payload)


@app.get("/api/episode-titles")
def episode_titles(anilistId: int):
    if not (1 <= anilistId <= 1_000_000_000):
        raise HTTPException(status_code=400, detail="anilistId is out of range")
    cache_key = f"episode-titles:{anilistId}"
    cached = cache_get(cache_key)
    if isinstance(cached, dict):
        return cached

    media = _anilist_art_media(anilistId)
    titles: dict[str, str] = {}
    sources: set[str] = set()

    for item in media.get("streaming") or []:
        number = item.get("number")
        if not isinstance(number, int):
            continue
        title = _clean_episode_title(item.get("title"), number)
        if title:
            titles[str(number)] = title
            sources.add("anilist")

    mal_id = media.get("idMal")
    if mal_id:
        kitsu_id = _kitsu_anime_id(int(mal_id))
        if kitsu_id:
            for number, item in _kitsu_episodes(kitsu_id).items():
                if str(number) in titles:
                    continue
                title = _clean_episode_title(item.get("title"), number)
                if title:
                    titles[str(number)] = title
                    sources.add("kitsu")

    result = {
        "anilistId": anilistId,
        "titles": titles,
        "sources": sorted(sources),
    }
    cache_set(cache_key, result, 6 * 3600)
    return result


@app.get("/api/anime-detail")
def anime_detail(anilistId: int):
    if not (1 <= anilistId <= 1_000_000_000):
        raise HTTPException(status_code=400, detail="anilistId is out of range")
    cache_key = f"anime-detail:fallback:{anilistId}"
    cached = cache_get(cache_key)
    if isinstance(cached, dict):
        return cached
    result = _anime_detail_fallback(anilistId)
    cache_set(cache_key, result, 6 * 3600)
    return result


# Legacy aliases kept for parity with the original GengaToon API.
@app.get("/api/anidb/episodes")
def anidb_episodes(id: str | None = None):
    if not id:
        raise HTTPException(status_code=400, detail="Missing id")
    return get_json(f"{ANIDB_BASE}/api/anime/{quote(id)}/episodes", ttl=600)


@app.get("/api/anidb/servers")
def anidb_servers(episodeId: str | None = None):
    if not episodeId:
        raise HTTPException(status_code=400, detail="Missing episodeId")
    return get_json(f"{ANIDB_BASE}/api/episode/{quote(episodeId)}/servers", ttl=300)


@app.get("/api/anidb/iframe")
def anidb_iframe(serverId: str | None = None):
    if not serverId:
        raise HTTPException(status_code=400, detail="Missing serverId")
    return get_json(f"{ANIDB_BASE}/api/episode/{quote(serverId)}/iframe", ttl=300)


@app.get("/api/anidb/stream")
def anidb_stream(embedUrl: str | None = None):
    if not embedUrl:
        raise HTTPException(status_code=400, detail="Missing embedUrl")
    html = fetch_embed_html(embedUrl)
    stream_url = extract_m3u8(html)
    if not stream_url:
        raise HTTPException(status_code=404, detail="Stream URL not found in embed source")
    return {"streamUrl": stream_url}


# ---------------------------------------------------------------------------
# HLS relay
# ---------------------------------------------------------------------------


def _assert_public_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise HTTPException(status_code=400, detail="Unsupported proxy URL")
    try:
        addresses = socket.getaddrinfo(parsed.hostname, None)
    except socket.gaierror as exc:
        raise HTTPException(status_code=400, detail="Unknown proxy host") from exc
    for info in addresses:
        ip = ipaddress.ip_address(info[4][0])
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        ):
            raise HTTPException(status_code=400, detail="Private hosts are not proxied")


def _proxy_uri(uri: str, base_url: str) -> str:
    absolute = urljoin(base_url, uri)
    return f"/api/anilab/hls_proxy?url={quote(absolute, safe='')}"


URI_ATTRIBUTE = re.compile(r"""URI\s*=\s*(["'])(.*?)\1""", re.IGNORECASE)


def rewrite_manifest(text: str, base_url: str) -> str:
    output: list[str] = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            output.append(line)
            continue
        if stripped.startswith("#"):
            if "URI=" in stripped.upper():
                stripped = URI_ATTRIBUTE.sub(
                    lambda m: f'URI="{_proxy_uri(m.group(2), base_url)}"',
                    stripped,
                )
            output.append(stripped)
            continue
        output.append(_proxy_uri(stripped, base_url))
    return "\n".join(output) + "\n"


@app.get("/api/anilab/hls_proxy")
def hls_proxy(request: Request, url: str | None = None):
    if not url:
        raise HTTPException(status_code=400, detail="Missing url")
    _assert_public_url(url)

    forward_headers = dict(STREAM_HEADERS)
    range_header = request.headers.get("range")
    if range_header:
        forward_headers["Range"] = range_header

    try:
        upstream = requests.get(url, headers=forward_headers, timeout=20, stream=True, allow_redirects=True)
        upstream.raise_for_status()
    except Exception as exc:  # noqa: BLE001
        print(f"[anilab] HLS proxy error for {url}: {exc}", file=sys.stderr)
        raise HTTPException(status_code=502, detail=_error_detail(exc)) from exc

    content_type = upstream.headers.get("Content-Type", "").lower()
    is_manifest = (
        "mpegurl" in content_type
        or urlparse(url).path.lower().endswith((".m3u8", ".m3u"))
    )

    response_headers = {
        k: v
        for k, v in upstream.headers.items()
        if k.lower() not in HOP_BY_HOP and k.lower() != "content-length"
    }
    response_headers["Access-Control-Allow-Origin"] = "*"
    response_headers["Cache-Control"] = "no-store"

    if is_manifest:
        try:
            body = upstream.content
        finally:
            upstream.close()
        text = body.decode("utf-8", errors="replace")
        if "#EXTM3U" not in text:
            is_manifest = False
        else:
            rewritten = rewrite_manifest(text, url)
            return Response(
                content=rewritten,
                media_type="application/vnd.apple.mpegurl",
                headers=response_headers,
            )

    def iterator():
        try:
            for chunk in upstream.iter_content(chunk_size=64 * 1024):
                if chunk:
                    yield chunk
        finally:
            upstream.close()

    return StreamingResponse(
        iterator(),
        status_code=upstream.status_code,
        media_type=content_type or "application/octet-stream",
        headers=response_headers,
    )


@app.get("/api/watch", response_class=HTMLResponse)
def watch(m3u8: str | None = None):
    if not m3u8:
        return "Missing m3u8"
    source = json.dumps(m3u8)
    return f"""<!DOCTYPE html>
<html><head><title>Player</title>
<style>html,body{{margin:0;padding:0;width:100%;height:100%;background:#000;overflow:hidden}}</style>
</head><body>
<video id="v" controls autoplay style="width:100%;height:100%"></video>
<script src="https://cdn.jsdelivr.net/npm/hls.js@1"></script>
<script>
var v=document.getElementById('v'),src={source};
if(Hls.isSupported()){{var h=new Hls();h.loadSource(src);h.attachMedia(v);h.on(Hls.Events.MANIFEST_PARSED,function(){{v.play().catch(function(){{}})}})}}
else if(v.canPlayType('application/vnd.apple.mpegurl')){{v.src=src;v.addEventListener('loadedmetadata',function(){{v.play().catch(function(){{}})}})}}
</script></body></html>"""


# ---------------------------------------------------------------------------
# Production SPA hosting (built by Vite into dist/)
# ---------------------------------------------------------------------------

if DIST_DIR.is_dir():

    def spa_index_response() -> HTMLResponse:
        """Serve index.html with runtime config injected.

        The SPA is compiled ahead of time, so Vite's import.meta.env values are
        frozen at build time. Cloud-sync credentials are deployment settings, so
        they are injected here from the server environment instead of being baked
        into the bundle.
        """
        html = (DIST_DIR / "index.html").read_text(encoding="utf-8")
        config = {
            "supabaseUrl": os.environ.get("SUPABASE_URL", "").strip(),
            "supabaseAnonKey": os.environ.get("SUPABASE_ANON_KEY", "").strip(),
        }
        if config["supabaseUrl"] and config["supabaseAnonKey"]:
            payload = json.dumps(config).replace("</", "<\\/")
            snippet = f"<script>window.__HANABI_CONFIG__={payload};</script>"
            html = html.replace("</head>", snippet + "</head>", 1)
        return HTMLResponse(html, headers={"Cache-Control": "no-store"})

    assets_dir = DIST_DIR / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API route not found")
        candidate = (DIST_DIR / full_path).resolve()
        if full_path and candidate.is_file() and DIST_DIR.resolve() in candidate.parents:
            return FileResponse(candidate)
        return spa_index_response()


if __name__ == "__main__":
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "3000")),
        reload=os.environ.get("RELOAD", "1") == "1",
    )
