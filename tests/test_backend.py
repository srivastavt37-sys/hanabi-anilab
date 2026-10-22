import pytest
from fastapi.testclient import TestClient

import server


client = TestClient(server.app)


@pytest.fixture(autouse=True)
def clear_caches(monkeypatch):
    monkeypatch.setattr(server, "_anizip_mapping", lambda _: {})
    server._cache.clear()
    server._art_cache.clear()
    yield
    server._cache.clear()
    server._art_cache.clear()


def fake_media(**overrides):
    media = {
        "id": 900000001,
        "idMal": None,
        "title": "Test & <Show>",
        "cover": "",
        "coverLarge": "",
        "color": "#ff0000",
        "streaming": [],
    }
    media.update(overrides)
    return media


def test_skip_times_requires_an_id():
    response = client.get("/api/skip-times")
    assert response.status_code == 400


def test_skip_times_rejects_episode_zero():
    response = client.get("/api/skip-times?anilistId=16498&episode=0")
    assert response.status_code == 400


def test_skip_times_reports_upstream_failure(monkeypatch):
    monkeypatch.setattr(server, "_anilist_mal_id", lambda _: 16498)
    monkeypatch.setattr(server, "_local_skip_segments", lambda *_: None)
    monkeypatch.setattr(
        server,
        "_aniskip_segments",
        lambda *_: {"status": "unavailable", "results": []},
    )

    response = client.get("/api/skip-times?anilistId=16498&episode=1")
    body = response.json()

    assert response.status_code == 200
    assert body["available"] is False
    assert body["reason"] == "upstream_unavailable"
    assert body["sources"] == []


def test_local_skip_override_wins(monkeypatch):
    monkeypatch.setattr(server, "_anilist_mal_id", lambda _: 16498)
    monkeypatch.setattr(
        server,
        "_local_skip_segments",
        lambda *_: {
            "intro": {"start": 10.0, "end": 20.0},
            "outro": None,
            "episodeLength": 100.0,
        },
    )
    monkeypatch.setattr(
        server,
        "_aniskip_segments",
        lambda *_: {"status": "unavailable", "results": []},
    )

    response = client.get("/api/skip-times?anilistId=16498&episode=1")
    body = response.json()

    assert response.status_code == 200
    assert body["available"] is True
    assert body["intro"] == {"start": 10.0, "end": 20.0}
    assert body["sources"] == ["local"]
    assert body["confidence"] == "high"


def test_episode_image_rejects_episode_zero():
    response = client.get("/api/episode-image?anilistId=195539&episode=0")
    assert response.status_code == 400


def test_generated_images_differ_per_episode(monkeypatch):
    monkeypatch.setattr(server, "_anilist_art_media", lambda _: fake_media())
    monkeypatch.setattr(server, "_episode_still_candidates", lambda *_: iter(()))

    first = client.get("/api/episode-image?anilistId=900000001&episode=1&width=320")
    second = client.get("/api/episode-image?anilistId=900000001&episode=2&width=320")

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.headers["x-image-source"] == "generated"
    assert first.headers["content-type"].startswith("image/svg+xml")
    assert first.headers["cache-control"] == "public, max-age=60"
    assert first.content != second.content
    assert b"Test &amp; &lt;Show&gt;" in first.content


def test_generated_image_width_is_clamped(monkeypatch):
    monkeypatch.setattr(server, "_anilist_art_media", lambda _: fake_media())
    monkeypatch.setattr(server, "_episode_still_candidates", lambda *_: iter(()))

    response = client.get("/api/episode-image?anilistId=900000001&episode=1&width=10")

    assert response.status_code == 200
    assert b'width="160"' in response.content


def test_real_still_is_preferred(monkeypatch):
    media = fake_media(
        streaming=[
            {
                "number": 1,
                "url": "https://example.com/still.jpg",
                "title": "Episode 1",
                "source": "anilist",
            }
        ]
    )
    monkeypatch.setattr(server, "_anilist_art_media", lambda _: media)
    monkeypatch.setattr(
        server,
        "_fetch_image",
        lambda _: {"bytes": b"\xff\xd8\xff\xe0fake-jpeg", "content_type": "image/jpeg"},
    )

    response = client.get("/api/episode-image?anilistId=900000001&episode=1")

    assert response.status_code == 200
    assert response.headers["x-image-source"] == "anilist"
    assert response.headers["content-type"] == "image/jpeg"
    assert response.content == b"\xff\xd8\xff\xe0fake-jpeg"


def test_episode_image_uses_mapping_still_when_anilist_is_unavailable(monkeypatch):
    monkeypatch.setattr(server, "_anilist_art_media", lambda _: {})
    monkeypatch.setattr(
        server,
        "_anizip_mapping",
        lambda _: {
            "titles": {"en": "Mapped anime"},
            "episodes": {
                "1": {"image": "https://example.com/episode-1.jpg"},
                "2": {"image": "https://example.com/episode-2.jpg"},
            },
        },
    )
    fetched_urls = []

    def fetch_image(url):
        fetched_urls.append(url)
        return {"bytes": b"\xff\xd8\xff\xe0mapped-still", "content_type": "image/jpeg"}

    monkeypatch.setattr(server, "_fetch_image", fetch_image)
    response = client.get("/api/episode-image?anilistId=195539&episode=2&width=320&v=2")

    assert response.status_code == 200
    assert response.headers["x-image-source"] == "anizip"
    assert response.headers["cache-control"] == "public, max-age=86400"
    assert response.content == b"\xff\xd8\xff\xe0mapped-still"
    assert fetched_urls == ["https://example.com/episode-2.jpg"]


def test_episode_image_retries_mapping_when_anilist_still_cannot_load(monkeypatch):
    monkeypatch.setattr(
        server,
        "_anilist_art_media",
        lambda _: fake_media(streaming=[{"number": 1, "url": "https://example.com/offline.jpg", "source": "anilist"}]),
    )
    monkeypatch.setattr(
        server,
        "_anizip_mapping",
        lambda _: {"episodes": {"1": {"image": "https://example.com/working.jpg"}}},
    )
    fetched_urls = []

    def fetch_image(url):
        fetched_urls.append(url)
        if url.endswith("offline.jpg"):
            return None
        return {"bytes": b"\xff\xd8\xff\xe0mapped-still", "content_type": "image/jpeg"}

    monkeypatch.setattr(server, "_fetch_image", fetch_image)
    response = client.get("/api/episode-image?anilistId=195539&episode=1")

    assert response.headers["x-image-source"] == "anizip"
    assert fetched_urls == ["https://example.com/offline.jpg", "https://example.com/working.jpg"]


def test_generated_image_does_not_pin_missing_still_for_a_day(monkeypatch):
    monkeypatch.setattr(server, "_anilist_art_media", lambda _: fake_media())
    client.get("/api/episode-image?anilistId=900000001&episode=1&width=320")
    expires_at, _ = server._art_cache["episode-image:v2:900000001:1:320"]

    assert 0 < expires_at - server.time.time() <= 60


def test_episode_titles_uses_kitsu_when_anilist_has_none(monkeypatch):
    media = fake_media(idMal=61990, streaming=[])
    monkeypatch.setattr(server, "_anilist_art_media", lambda _: media)
    monkeypatch.setattr(server, "_kitsu_anime_id", lambda _: 50016)
    monkeypatch.setattr(
        server,
        "_kitsu_episodes",
        lambda _: {
            1: {
                "number": 1,
                "title": "Last Chance for a Slow Dance",
                "url": "",
            }
        },
    )

    response = client.get("/api/episode-titles?anilistId=195539")
    body = response.json()

    assert response.status_code == 200
    assert body["titles"] == {"1": "Last Chance for a Slow Dance"}
    assert body["sources"] == ["kitsu"]


def test_episode_titles_cleans_numbered_anilist_titles(monkeypatch):
    media = fake_media(
        streaming=[
            {"number": 2, "title": "Episode 2 - Give Me Another Day"},
        ]
    )
    monkeypatch.setattr(server, "_anilist_art_media", lambda _: media)
    monkeypatch.setattr(server, "_kitsu_anime_id", lambda _: None)

    response = client.get("/api/episode-titles?anilistId=195539")
    body = response.json()

    assert response.status_code == 200
    assert body["titles"] == {"2": "Give Me Another Day"}
    assert body["sources"] == ["anilist"]
    assert server._clean_episode_title("Episode 1", 1) == ""


def test_anime_detail_falls_back_to_anizip_and_kitsu(monkeypatch):
    mapping = {
        "titles": {"en": "Cyberpunk: Edgerunners 2", "ja": "Cyberpunk: Edgerunners II"},
        "episodes": {
            "1": {
                "episodeNumber": 1,
                "title": {"en": "Last Chance for a Slow Dance"},
                "overview": "A former edgerunner starts over.",
                "runtime": 28,
                "image": "https://example.com/episode-1.jpg",
                "airDateUtc": "2026-10-20T07:00:00Z",
            }
        },
        "episodeCount": 10,
        "images": [
            {"coverType": "Poster", "url": "https://example.com/poster.jpg"},
            {"coverType": "Banner", "url": "https://example.com/banner.jpg"},
        ],
        "mappings": {"kitsu_id": 50016, "mal_id": 61990},
    }
    kitsu = {
        "attributes": {
            "canonicalTitle": "Cyberpunk: Edgerunners 2",
            "synopsis": "A new crew takes on Night City.",
            "subtype": "ONA",
            "status": "finished",
            "startDate": "2026-10-20",
            "averageRating": "81.44",
            "userCount": 1199,
            "episodeLength": 28,
            "youtubeVideoId": "urV5GzXcXsQ",
            "titles": {"ja_jp": "Cyberpunk: Edgerunners II"},
        },
        "included": [
            {"type": "categories", "attributes": {"slug": "science-fiction"}},
            {"type": "categories", "attributes": {"slug": "action"}},
        ],
    }
    monkeypatch.setattr(server, "_anizip_mapping", lambda _: mapping)
    monkeypatch.setattr(server, "_kitsu_anime", lambda _: kitsu)

    response = client.get("/api/anime-detail?anilistId=195539")
    body = response.json()

    assert response.status_code == 200
    assert body["sources"] == ["anizip", "kitsu"]
    assert body["anime"]["id"] == "anilist-195539"
    assert body["anime"]["title"] == "Cyberpunk: Edgerunners 2"
    assert body["anime"]["episodeCount"] == 10
    assert body["anime"]["format"] == "ONA"
    assert body["anime"]["status"] == "finished"
    assert body["anime"]["year"] == 2026
    assert body["anime"]["genres"] == ["sci-fi", "action"]
    assert body["anime"]["poster"] == "https://example.com/poster.jpg"
    assert body["anime"]["cover"] == "https://example.com/banner.jpg"
    assert body["episodes"][0]["title"] == "Last Chance for a Slow Dance"
    assert body["episodes"][0]["thumbnail"] == "https://example.com/episode-1.jpg"
    assert body["trailerUrl"] == "https://www.youtube.com/embed/urV5GzXcXsQ"


def test_anime_detail_reports_unavailable_fallback(monkeypatch):
    monkeypatch.setattr(server, "_anizip_mapping", lambda _: {})

    response = client.get("/api/anime-detail?anilistId=195539")

    assert response.status_code == 503
    assert response.json()["detail"] == "Metadata fallback sources are unavailable"


def test_anime_detail_rejects_invalid_id():
    response = client.get("/api/anime-detail?anilistId=0")

    assert response.status_code == 400


def test_svg_is_not_accepted_as_remote_image():
    assert server._sniff_image_type(b"<svg></svg>", "image/svg+xml") is None


def test_redirect_to_private_host_is_rejected(monkeypatch):
    class FakeResponse:
        is_redirect = True
        headers = {"Location": "http://127.0.0.1/secret"}

        def close(self):
            pass

    def assert_public(url):
        if "127.0.0.1" in url:
            raise server.HTTPException(status_code=400, detail="Private hosts are not proxied")

    monkeypatch.setattr(server, "_assert_public_url", assert_public)
    monkeypatch.setattr(server.requests, "get", lambda *args, **kwargs: FakeResponse())

    assert server._fetch_image("https://example.com/image.jpg") is None
