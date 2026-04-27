"""Pre-commit hook: regenerate api_types.ts and fail if it changed.

Triggered when Python API surface or Pydantic models change. Runs the same
`generate:types` npm script that `build:frontend` uses, then asserts that
`src/sayclearly/static/api_types.ts` matches what is already staged. A
mismatch means the developer changed the backend schema without committing
the regenerated TypeScript types.
"""

import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
TYPES_PATH = "src/sayclearly/static/api_types.ts"

STALE_TYPES_MESSAGE = (
    "\n"
    "Generated TypeScript API types are stale.\n"
    "  - Run: npm run generate:types\n"
    "  - Stage the result: git add src/sayclearly/static/api_types.ts\n"
    "  - Re-commit.\n"
)


def main() -> int:
    is_windows = sys.platform == "win32"
    try:
        regen = subprocess.run(
            ["npm", "run", "generate:types"],
            cwd=REPO_ROOT,
            shell=is_windows,
        )
    except FileNotFoundError:
        print(
            "npm was not found on PATH. Install Node.js so generated TypeScript types can be refreshed before commits.",
            file=sys.stderr,
        )
        return 1

    if regen.returncode != 0:
        return regen.returncode

    diff = subprocess.run(
        ["git", "diff", "--exit-code", "--", TYPES_PATH],
        cwd=REPO_ROOT,
    )
    if diff.returncode != 0:
        print(STALE_TYPES_MESSAGE, file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
