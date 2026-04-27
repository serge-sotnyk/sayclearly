"""Pre-commit hook: rebuild the frontend bundle and fail if it changed.

The hook runs `npm run build:frontend` and then asserts that the resulting
`src/sayclearly/static/dist/` tree matches what is already staged. A mismatch
means the developer staged TypeScript changes without rebuilding (and staging)
the bundle that ships in git for the `uvx --from git+...` MVP launch path.
"""

import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DIST_PATH = "src/sayclearly/static/dist/"

STALE_BUNDLE_MESSAGE = (
    "\n"
    "Frontend bundle is stale.\n"
    "  - Run: npm run build:frontend\n"
    "  - Stage the result: git add src/sayclearly/static/dist/\n"
    "  - Re-commit.\n"
)


def main() -> int:
    # On Windows `npm` is `npm.cmd` and subprocess will not find it without the
    # shell expanding PATHEXT; on POSIX a plain exec is fine and safer.
    is_windows = sys.platform == "win32"
    try:
        build = subprocess.run(
            ["npm", "run", "build:frontend"],
            cwd=REPO_ROOT,
            shell=is_windows,
        )
    except FileNotFoundError:
        print(
            "npm was not found on PATH. Install Node.js so the frontend bundle can be rebuilt before commits.",
            file=sys.stderr,
        )
        return 1

    if build.returncode != 0:
        return build.returncode

    diff = subprocess.run(
        ["git", "diff", "--exit-code", "--", DIST_PATH],
        cwd=REPO_ROOT,
    )
    if diff.returncode != 0:
        print(STALE_BUNDLE_MESSAGE, file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
