from __future__ import annotations

import argparse
import sys
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_DIR = SCRIPT_DIR.parent
BACKEND_DIR = REPO_DIR / "backend"

for path in (str(BACKEND_DIR), str(REPO_DIR)):
    if path not in sys.path:
        sys.path.insert(0, path)

from app.services.estimate_template_builder import (  # noqa: E402
    build_estimate_template,
    fill_estimate_template,
    load_rows_from_csv,
    load_rows_from_json,
)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate estimate workbook templates")
    parser.add_argument("--input", dest="input_path", help="Optional CSV/JSON source file")
    parser.add_argument(
        "--output",
        dest="output_path",
        default=str(REPO_DIR / "templates" / "estimate_template.xlsx"),
        help="Output workbook path",
    )
    args = parser.parse_args(argv)

    output_path = Path(args.output_path)
    build_estimate_template(output_path)

    if args.input_path:
        input_path = Path(args.input_path)
        suffix = input_path.suffix.lower()
        if suffix == ".json":
            rows = load_rows_from_json(input_path)
        elif suffix == ".csv":
            rows = load_rows_from_csv(input_path)
        else:
            parser.error("--input must point to a .json or .csv file")
        fill_estimate_template(output_path, rows)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
