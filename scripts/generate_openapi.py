"""Dump the FastAPI OpenAPI schema to openapi.json.

Used by the `generate:types` npm script as the first step before invoking
`openapi-typescript` to produce src/sayclearly/static/api_types.ts. Running
this without booting Uvicorn keeps the generation cheap enough to live in
the pre-commit / build path.
"""

import json
from pathlib import Path

from sayclearly.app import create_app

REPO_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_PATH = REPO_ROOT / "openapi.json"


def main() -> int:
    app = create_app()
    schema = app.openapi()
    OUTPUT_PATH.write_text(json.dumps(schema, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
