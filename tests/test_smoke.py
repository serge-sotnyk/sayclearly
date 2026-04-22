from fastapi import FastAPI
from fastapi.testclient import TestClient
from pathlib import Path

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


def test_main_loads_dotenv_from_current_working_directory_before_creating_app(
    monkeypatch,
) -> None:
    calls: list[tuple[object, ...]] = []
    dotenv_path = Path("C:/workspace/.env")

    def fake_find_dotenv(*, filename: str, usecwd: bool) -> str:
        calls.append(("find_dotenv", filename, usecwd))
        return str(dotenv_path)

    def fake_load_dotenv(*, dotenv_path: Path, override: bool) -> bool:
        calls.append(("load_dotenv", dotenv_path, override))
        return True

    def fake_create_app() -> FastAPI:
        calls.append(("create_app",))
        return FastAPI()

    def fake_run(app: object, host: str, port: int) -> None:
        calls.append(("run", host, port))

    monkeypatch.setattr(main_module, "find_dotenv", fake_find_dotenv)
    monkeypatch.setattr(main_module, "load_dotenv", fake_load_dotenv)
    monkeypatch.setattr(main_module, "create_app", fake_create_app)
    monkeypatch.setattr(main_module.uvicorn, "run", fake_run)

    main_module.main()

    assert calls[0] == ("find_dotenv", ".env", True)
    assert calls[0] == (
        "find_dotenv",
        ".env",
        True,
    )
    assert calls[1] == ("load_dotenv", dotenv_path, False)
    assert calls[2] == ("create_app",)
