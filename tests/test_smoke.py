import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

import sayclearly.main as main_module
from sayclearly.app import create_app


def test_create_app_returns_fastapi_instance() -> None:
    app = create_app()

    assert isinstance(app, FastAPI)


def test_health_endpoint_returns_ok() -> None:
    client = TestClient(create_app())

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_home_page_renders_local_shell() -> None:
    client = TestClient(create_app())

    response = client.get("/")

    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "SayClearly" in response.text
    assert "/static/styles.css" in response.text


def test_home_page_uses_root_path_for_static_assets() -> None:
    client = TestClient(create_app(), root_path="/sayclearly")

    response = client.get("/")

    assert response.status_code == 200
    assert "/sayclearly/static/styles.css" in response.text


def test_static_stylesheet_is_served() -> None:
    client = TestClient(create_app())

    response = client.get("/static/styles.css")

    assert response.status_code == 200
    assert "text/css" in response.headers["content-type"]
    assert ".page-shell" in response.text


def test_main_opens_browser_and_starts_server(monkeypatch) -> None:
    opened_urls: list[str] = []
    run_calls: list[tuple[object, str, int]] = []

    def fake_open(url: str) -> bool:
        opened_urls.append(url)
        return True

    def fake_run(app: object, host: str, port: int) -> None:
        assert opened_urls == []
        run_calls.append((app, host, port))
        for startup_handler in app.router.on_startup:
            startup_handler()

    monkeypatch.setattr(main_module.webbrowser, "open", fake_open)
    monkeypatch.setattr(main_module.uvicorn, "run", fake_run)

    main_module.main()

    assert opened_urls == [f"http://{main_module.HOST}:{main_module.PORT}/"]
    assert len(run_calls) == 1
    app, host, port = run_calls[0]
    assert isinstance(app, FastAPI)
    assert host == main_module.HOST
    assert port == main_module.PORT


def test_main_starts_server_when_browser_open_fails(monkeypatch, caplog) -> None:
    run_calls: list[tuple[object, str, int]] = []
    caplog.set_level("INFO")

    def fake_open(url: str) -> bool:
        raise RuntimeError("browser unavailable")

    def fake_run(app: object, host: str, port: int) -> None:
        run_calls.append((app, host, port))
        for startup_handler in app.router.on_startup:
            startup_handler()

    monkeypatch.setattr(main_module.webbrowser, "open", fake_open)
    monkeypatch.setattr(main_module.uvicorn, "run", fake_run)

    main_module.main()

    assert len(run_calls) == 1
    assert caplog.messages == ["Could not open browser automatically."]


def test_main_registers_browser_open_on_app_startup(monkeypatch) -> None:
    opened_urls: list[str] = []
    startup_handler_counts: list[int] = []

    def fake_open(url: str) -> bool:
        opened_urls.append(url)
        return True

    def fake_run(app: object, host: str, port: int) -> None:
        startup_handler_counts.append(len(app.router.on_startup))

    monkeypatch.setattr(main_module.webbrowser, "open", fake_open)
    monkeypatch.setattr(main_module.uvicorn, "run", fake_run)

    main_module.main()

    assert opened_urls == []
    assert startup_handler_counts == [1]


def test_main_does_not_load_parent_dotenv_when_cwd_has_no_env(monkeypatch, tmp_path: Path) -> None:
    parent_dir = tmp_path / "parent"
    cwd_dir = parent_dir / "cwd"
    parent_dir.mkdir()
    cwd_dir.mkdir()
    (parent_dir / ".env").write_text("SAYCLEARLY_DOTENV_SCOPE=from-parent\n")

    calls: list[tuple[object, ...]] = []

    def fake_create_app() -> FastAPI:
        calls.append(("create_app", os.environ.get("SAYCLEARLY_DOTENV_SCOPE")))
        return FastAPI()

    def fake_run(app: object, host: str, port: int) -> None:
        calls.append(("run", host, port))

    monkeypatch.delenv("SAYCLEARLY_DOTENV_SCOPE", raising=False)
    monkeypatch.chdir(cwd_dir)
    monkeypatch.setattr(main_module, "create_app", fake_create_app)
    monkeypatch.setattr(main_module.uvicorn, "run", fake_run)

    main_module.main()

    assert os.environ.get("SAYCLEARLY_DOTENV_SCOPE") is None
    assert calls == [
        ("create_app", None),
        ("run", main_module.HOST, main_module.PORT),
    ]


def test_readme_documents_mvp_uvx_launch_path() -> None:
    readme = (Path(__file__).resolve().parents[1] / "README.md").read_text(encoding="utf-8")
    pyproject = (Path(__file__).resolve().parents[1] / "pyproject.toml").read_text(encoding="utf-8")
    bundle = Path(__file__).resolve().parents[1] / "src" / "sayclearly" / "static" / "dist" / "app.js"

    assert "uvx --from git+https://github.com/serge-sotnyk/sayclearly sayclearly" in readme
    assert "uv run sayclearly" in readme
    assert "Runs fully locally on your machine" in readme
    assert 'sayclearly = "sayclearly.main:main"' in pyproject
    assert bundle.is_file()


def test_main_loads_dotenv_from_exact_current_working_directory(
    monkeypatch, tmp_path: Path
) -> None:
    cwd_dir = tmp_path / "cwd"
    cwd_dir.mkdir()
    (cwd_dir / ".env").write_text("SAYCLEARLY_DOTENV_SCOPE=from-cwd\n")

    calls: list[tuple[object, ...]] = []

    def fake_create_app() -> FastAPI:
        calls.append(("create_app", os.environ.get("SAYCLEARLY_DOTENV_SCOPE")))
        return FastAPI()

    def fake_run(app: object, host: str, port: int) -> None:
        calls.append(("run", host, port))

    monkeypatch.delenv("SAYCLEARLY_DOTENV_SCOPE", raising=False)
    monkeypatch.chdir(cwd_dir)
    monkeypatch.setattr(main_module, "create_app", fake_create_app)
    monkeypatch.setattr(main_module.uvicorn, "run", fake_run)

    main_module.main()

    assert os.environ["SAYCLEARLY_DOTENV_SCOPE"] == "from-cwd"
    assert calls == [
        ("create_app", "from-cwd"),
        ("run", main_module.HOST, main_module.PORT),
    ]
