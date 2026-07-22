def test_settings_accept_release_debug_value(monkeypatch):
    monkeypatch.setenv("DEBUG", "release")

    from app.config import Settings

    assert Settings(_env_file=None).DEBUG is False
