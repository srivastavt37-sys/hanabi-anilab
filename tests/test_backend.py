import pytest
from fastapi.testclient import TestClient

import server


client = TestClient(server.app)


@pytest.fixture(autouse=True)
def clear_caches():
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
    assert first.headers["cache-control"] == "public, max-age=86400"
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

