"""Bước "biên dịch" của Python: chỉ parse, không ghi .pyc (thư mục bài chỉ đọc)."""
import ast
import sys

bad = 0
for path in sys.argv[1:]:
    try:
        with open(path, encoding="utf-8") as handle:
            ast.parse(handle.read(), filename=path)
    except SyntaxError as exc:
        print(f"{path}:{exc.lineno}: {exc.msg}", file=sys.stderr)
        bad = 1
    except UnicodeDecodeError:
        print(f"{path}: không đọc được bằng UTF-8", file=sys.stderr)
        bad = 1
sys.exit(bad)
