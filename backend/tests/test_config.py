import importlib


def test_settings_accept_release_debug_value(monkeypatch):
    monkeypatch.setenv("DEBUG", "release")

    config_module = importlib.import_module("app.config")
    reloaded = importlib.reload(config_module)

    assert reloaded.Settings(DEBUG="release").DEBUG is False
    assert reloaded.settings.DEBUG is False
