from __future__ import annotations

import os
import runpy
import sys
import tempfile
from pathlib import Path


workspace_tmp = Path(__file__).resolve().parent / "tmp"
workspace_tmp.mkdir(parents=True, exist_ok=True)

for variable in ("TEMP", "TMP", "TMPDIR"):
    os.environ[variable] = str(workspace_tmp)
tempfile.tempdir = str(workspace_tmp)

renderer = Path(sys.argv[1]).resolve()
sys.argv = [str(renderer), *sys.argv[2:]]
runpy.run_path(str(renderer), run_name="__main__")
