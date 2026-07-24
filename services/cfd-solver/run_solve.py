#!/usr/bin/env python3
"""cfd-solver wrapper (plan §4.1 / §4.3).

Reads a case package (produced by the TypeScript openfoam-exporter), runs the
OpenFOAM mesh + solve pipeline, extracts fields with fluidfoam, and reports the
result back to the app via an authenticated callback.

Environment (Cloud Run Jobs env overrides; plain values for the C1 local proof):
  CASE_INPUT_PATH    gs://bucket/path/input.json  OR  /local/input.json
  RESULT_OUTPUT_PATH gs://bucket/path/result.json OR  /local/result.json
  RUN_JOB_ID         Firestore run job id (echoed back)
  CALLBACK_URL       app endpoint to POST results to (optional for local proof)
  CALLBACK_SECRET    shared secret sent as X-Callback-Secret

input.json shape (from POST .../runs):
  { "solver": "buoyantSimpleFoam",
    "caseName": "...",
    "files": { "system/controlDict": "...", "0/T": "...", ... },
    "dimensions": { "nx": N, "ny": N, "nz": N },
    "runJobId": "...", "callbackUrl": "...", "callbackSecret": "..." }

Design notes matching the plan's expected C1 failure modes:
  * checkMesh runs NON-FATALLY and its output is captured — degenerate boundary
    faces on odd aspect ratios show up here first.
  * topoSet / createPatch only run when their dicts are present (empty faceSets
    when a patch's cells don't touch a true outer face is a known failure mode).
  * fluidfoam's structured mesh shape is asserted against nx/ny/nz BEFORE any
    field is trusted — a shape mismatch fails the run with a clear message rather
    than silently emitting garbage.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import traceback
from typing import Any, Optional

KELVIN_TO_CELSIUS = 273.15


# ── IO helpers (GCS or local) ───────────────────────────────────────────────

def _is_gcs(path: str) -> bool:
    return path.startswith("gs://")


def _split_gcs(path: str) -> tuple[str, str]:
    without = path[len("gs://"):]
    bucket, _, obj = without.partition("/")
    return bucket, obj


def read_text(path: str) -> str:
    if _is_gcs(path):
        from google.cloud import storage  # imported lazily so local runs need no GCS

        bucket_name, obj = _split_gcs(path)
        client = storage.Client()
        blob = client.bucket(bucket_name).blob(obj)
        return blob.download_as_text()
    with open(path, "r", encoding="utf-8") as fh:
        return fh.read()


def write_text(path: str, content: str) -> None:
    if _is_gcs(path):
        from google.cloud import storage

        bucket_name, obj = _split_gcs(path)
        client = storage.Client()
        blob = client.bucket(bucket_name).blob(obj)
        blob.upload_from_string(content, content_type="application/json")
        return
    os.makedirs(os.path.dirname(os.path.abspath(path)) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(content)


# ── Case materialization + OpenFOAM pipeline ────────────────────────────────

def materialize_case(files: dict[str, str], case_dir: str) -> None:
    """Write the {relative path: content} file map into an OpenFOAM case dir."""
    for rel_path, content in files.items():
        target = os.path.join(case_dir, rel_path)
        os.makedirs(os.path.dirname(target) or case_dir, exist_ok=True)
        with open(target, "w", encoding="utf-8") as fh:
            fh.write(content)


def run_cmd(cmd: list[str], case_dir: str, log: list[str], fatal: bool = True) -> int:
    """Run an OpenFOAM utility, capturing combined output into the log tail."""
    log.append(f"$ {' '.join(cmd)}")
    proc = subprocess.run(
        cmd,
        cwd=case_dir,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    tail = (proc.stdout or "").strip().splitlines()[-40:]
    log.extend(tail)
    if proc.returncode != 0 and fatal:
        raise RuntimeError(f"{cmd[0]} failed with exit code {proc.returncode}")
    return proc.returncode


def has_dict(case_dir: str, rel: str) -> bool:
    return os.path.exists(os.path.join(case_dir, rel))


def run_pipeline(case_dir: str, solver: str, log: list[str]) -> None:
    run_cmd(["blockMesh"], case_dir, log)

    # Optional pre-solve mesh manipulation. Missing dicts are simply skipped —
    # the exporter emits them only when the case needs derived patches.
    if has_dict(case_dir, "system/topoSetDict"):
        run_cmd(["topoSet"], case_dir, log)
    if has_dict(case_dir, "system/createPatchDict"):
        run_cmd(["createPatch", "-overwrite"], case_dir, log)

    # checkMesh is diagnostic, never fatal — this is where degenerate faces on
    # unusual aspect ratios surface (plan §4.1).
    run_cmd(["checkMesh"], case_dir, log, fatal=False)

    run_cmd([solver], case_dir, log)


# ── Field extraction (fluidfoam) ────────────────────────────────────────────

def _to_nested(arr: Any, nx: int, ny: int, nz: int) -> list:
    """Reshape a numpy array of nx*ny*nz values into [i][j][k] nested lists."""
    import numpy as np

    flat = np.asarray(arr, dtype=float).reshape(nx, ny, nz)
    return flat.tolist()


def _to_nested_vector(vec: Any, nx: int, ny: int, nz: int) -> list:
    """Reshape a (3, N) or (N, 3) velocity array into [i][j][k]{x,y,z}."""
    import numpy as np

    a = np.asarray(vec, dtype=float)
    if a.ndim == 2 and a.shape[0] == 3:
        comp = a  # (3, N)
    elif a.ndim == 2 and a.shape[1] == 3:
        comp = a.T  # -> (3, N)
    else:
        comp = a.reshape(3, -1)
    ux = comp[0].reshape(nx, ny, nz)
    uy = comp[1].reshape(nx, ny, nz)
    uz = comp[2].reshape(nx, ny, nz)
    out = []
    for i in range(nx):
        plane = []
        for j in range(ny):
            row = []
            for k in range(nz):
                row.append({"x": float(ux[i, j, k]), "y": float(uy[i, j, k]), "z": float(uz[i, j, k])})
            plane.append(row)
        out.append(plane)
    return out


def extract_fields(case_dir: str, dims: dict[str, int], log: list[str]) -> dict[str, Any]:
    import fluidfoam

    nx, ny, nz = dims["nx"], dims["ny"], dims["nz"]

    # Assert the structured mesh matches the exporter's grid BEFORE trusting any
    # field (the fluidfoam shape-mismatch failure mode from plan §4.1).
    x, y, z = fluidfoam.readmesh(case_dir, structured=True)
    if tuple(x.shape) != (nx, ny, nz):
        raise RuntimeError(
            f"fluidfoam mesh shape {tuple(x.shape)} != exporter dimensions ({nx}, {ny}, {nz})"
        )
    log.append(f"fluidfoam structured mesh shape OK: {tuple(x.shape)}")

    # fluidfoam auto-selects the latest time directory when time is omitted.
    temp_k = fluidfoam.readscalar(case_dir, "T", structured=True)
    pressure = fluidfoam.readscalar(case_dir, "p", structured=True)
    velocity = fluidfoam.readvector(case_dir, "U", structured=True)

    data: dict[str, Any] = {
        # OpenFOAM T is Kelvin; the app's field envelope is Celsius.
        "temperature": _to_nested(temp_k, nx, ny, nz),
        "pressure": _to_nested(pressure, nx, ny, nz),
        "velocity": _to_nested_vector(velocity, nx, ny, nz),
    }
    # K -> C in place.
    t = data["temperature"]
    for i in range(nx):
        for j in range(ny):
            for k in range(nz):
                t[i][j][k] = t[i][j][k] - KELVIN_TO_CELSIUS
    return data


# ── Callback ────────────────────────────────────────────────────────────────

def post_callback(url: str, secret: str, payload: dict[str, Any]) -> None:
    if not url:
        print("No CALLBACK_URL configured; skipping callback (local proof mode).")
        return
    import requests

    resp = requests.post(
        url,
        json=payload,
        headers={"X-Callback-Secret": secret or "", "Content-Type": "application/json"},
        timeout=60,
    )
    print(f"Callback -> {url}: HTTP {resp.status_code} {resp.text[:200]}")


# ── Main ────────────────────────────────────────────────────────────────────

def main() -> int:
    input_path = os.environ.get("CASE_INPUT_PATH")
    output_path = os.environ.get("RESULT_OUTPUT_PATH")
    run_job_id = os.environ.get("RUN_JOB_ID", "")

    if not input_path:
        print("CASE_INPUT_PATH is required", file=sys.stderr)
        return 2

    spec = json.loads(read_text(input_path))
    solver = spec.get("solver", "buoyantSimpleFoam")
    files = spec["files"]
    dims = spec["dimensions"]
    callback_url = spec.get("callbackUrl") or os.environ.get("CALLBACK_URL", "")
    callback_secret = spec.get("callbackSecret") or os.environ.get("CALLBACK_SECRET", "")

    log: list[str] = []

    with tempfile.TemporaryDirectory(prefix="cfd-case-") as case_dir:
        try:
            materialize_case(files, case_dir)
            run_pipeline(case_dir, solver, log)
            data = extract_fields(case_dir, dims, log)

            result_payload = {
                "status": "completed",
                "runJobId": run_job_id,
                "dimensions": dims,
                "data": data,
                "logTail": log[-50:],
            }

            if output_path:
                write_text(output_path, json.dumps(result_payload))

            post_callback(callback_url, callback_secret, {
                "status": "completed",
                "dimensions": dims,
                "data": data,
                "logTail": log[-50:],
            })
            print("Solve completed.")
            return 0
        except Exception as exc:  # noqa: BLE001 — top-level worker guard
            message = f"{type(exc).__name__}: {exc}"
            log.append(message)
            log.append(traceback.format_exc().splitlines()[-1])
            print(message, file=sys.stderr)
            post_callback(callback_url, callback_secret, {
                "status": "failed",
                "errorMessage": message,
                "logTail": log[-50:],
            })
            return 1


if __name__ == "__main__":
    raise SystemExit(main())
