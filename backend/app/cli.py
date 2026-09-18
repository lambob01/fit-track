import argparse
import getpass
import sqlite3
import sys
from datetime import UTC, datetime
from pathlib import Path

from app.config import settings
from app.security import hash_password
from app.seed.__main__ import run as run_seed


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
    seed = sub.add_parser("seed")
    seed.add_argument("--days", type=int, default=30)
    seed.add_argument("--seed", type=int, default=42)
    seed.add_argument("--reset", action="store_true", help="delete the user's data first")
    args = parser.parse_args(argv)

    if args.command == "hash-password":
        try:
            print(hash_password(_read_password()))
        except ValueError as exc:
            print(f"error: {exc}", file=sys.stderr)
            raise SystemExit(1) from exc
    elif args.command == "backup":
        source = settings.database_url.removeprefix("sqlite:///")
        stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
        default_dir = Path(source).parent / "backups"
        target = Path(args.out) if args.out else default_dir / f"tracker-{stamp}.db"
        target.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(source) as src, sqlite3.connect(target) as dst:
            src.backup(dst)
        print(target)
    elif args.command == "seed":
        run_seed(days=args.days, seed=args.seed, reset=args.reset)


if __name__ == "__main__":
    main()
