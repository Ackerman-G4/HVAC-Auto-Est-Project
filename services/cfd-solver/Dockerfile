# cfd-solver — OpenFOAM 2406 Engineering-tier solver (plan §4.1)
#
# Install method verified against openfoam.com's July 2026 docs:
#   dl.openfoam.com apt repo → openfoam2406-default →
#   environment at /usr/lib/openfoam/openfoam2406/etc/bashrc
#
# The image is a batch worker: it reads a case package from GCS (or a local
# volume mount for the C1 proof), runs blockMesh → topoSet → createPatch →
# <solver>, extracts fields with fluidfoam, and POSTs results to a callback URL.
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# Base tooling + the OpenFOAM apt repository.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg apt-transport-https \
      python3 python3-pip python3-venv \
 && rm -rf /var/lib/apt/lists/*

# Add the dl.openfoam.com Debian/Ubuntu repository and install OpenFOAM 2406.
RUN curl -fsSL https://dl.openfoam.com/add-debian-repo.sh | bash \
 && apt-get update \
 && apt-get install -y --no-install-recommends openfoam2406-default \
 && rm -rf /var/lib/apt/lists/*

# Python deps for the wrapper (fluidfoam extraction, GCS IO, callback).
WORKDIR /opt/cfd-solver
COPY requirements.txt ./
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

COPY run_solve.py ./

# Source the OpenFOAM environment for every solver invocation, then run the
# wrapper. Cloud Run Jobs provides CASE_INPUT_PATH / RESULT_OUTPUT_PATH /
# RUN_JOB_ID / CALLBACK_URL / CALLBACK_SECRET as env overrides at dispatch time.
ENTRYPOINT ["/bin/bash", "-lc", "source /usr/lib/openfoam/openfoam2406/etc/bashrc && exec python3 /opt/cfd-solver/run_solve.py"]
