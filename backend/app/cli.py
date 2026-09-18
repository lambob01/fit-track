import argparse
import getpass
import sqlite3
import sys
from datetime import UTC, datetime
from pathlib import Path

from app.config import settings
from app.security import hash_password


def _read_password() -> str:
    if not sys.stdin.isatty():
        line = sys.stdin.readline().strip()
        if not line:
            print("error: empty password on stdin", file=sys.stderr)
            raise SystemExit(1)
        return line
    first = getpass.getpass("Password: ")
    second = getpass.getpass("Confirm password: ")
    if first != second:
        print("error: passwords do not match", file=sys.stderr)
        raise SystemExit(1)
    return first


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("hash-password")
    backup = sub.add_parser("backup")
    backup.add_argument("--out", default=None)
    args = parser.parse_args(argv)

    if args.command == "hash-password":
        print(hash_password(_read_password()))
    elif args.command == "backup":
        source = settings.database_url.removeprefix("sqlite:///")
        stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
        default_dir = Path(source).parent / "backups"
        target = Path(args.out) if args.out else default_dir / f"tracker-{stamp}.db"
        target.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(source) as src, sqlite3.connect(target) as dst:
            src.backup(dst)
        print(target)


if __name__ == "__main__":
    main()
