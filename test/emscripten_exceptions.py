"""Behavioral regression for the Emscripten compile/link exception contract."""
import argparse
import json
from pathlib import Path
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--compiler", required=True)
    parser.add_argument("--node", default="node")
    parser.add_argument("--output", default="build/exception-contract")
    args = parser.parse_args()
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    source = Path(__file__).with_suffix(".cpp")
    def run(command, check=True):
        return subprocess.run(command, check=check, capture_output=True, text=True, encoding="utf-8")
    run([args.compiler, str(source), "-c", "-o", str(output / "link-only.o")])
    run([args.compiler, str(output / "link-only.o"), "-sNO_DISABLE_EXCEPTION_CATCHING=1", "-o", str(output / "link-only.cjs")])
    negative = run([args.node, str(output / "link-only.cjs")], check=False)
    if negative.returncode == 0:
        raise RuntimeError("Link-only exception settings unexpectedly preserved catch blocks")
    run([args.compiler, str(source), "-fexceptions", "-o", str(output / "compile-and-link.cjs")])
    positive = run([args.node, str(output / "compile-and-link.cjs")])
    if positive.stdout.strip() != "metadata budget":
        raise RuntimeError("Exception did not reach the intended catch block")
    print(json.dumps({"linkOnlyExit": negative.returncode, "compileAndLinkExit": positive.returncode, "ok": True}))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    main()
