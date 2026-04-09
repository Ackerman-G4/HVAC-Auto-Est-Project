# HVAC Calculation Engine (Optional Python Service)

This service is a FastAPI-based optional computation layer for advanced HVAC calculations.

## Current Local Notes (2026-04-07)

- Workspace Python executable: `.venv\Scripts\python.exe`
- Detected Python version: `3.14.3`
- In this workspace, `.venv\Scripts\Activate.ps1` is missing, so run Python commands directly through the executable path.

## Features

- Psychrometric property calculations using `psychrolib`
- ASHRAE cooling load methodology (CLTD/CLF and RTS)
- Equipment sizing with dehumidification analysis
- Philippine climate data support

## Setup (Windows, using workspace venv executable)

```powershell
cd services/calc-engine
..\..\.venv\Scripts\python.exe -m pip install -r requirements.txt
..\..\.venv\Scripts\python.exe -m uvicorn main:app --port 8001 --reload
```

## Setup (Generic Python)

```bash
cd services/calc-engine
python -m pip install -r requirements.txt
python -m uvicorn main:app --port 8001 --reload
```

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| GET | /health | Health check |
| POST | /psychrometrics | Psychrometric property calculation |
| POST | /cooling-load | Detailed cooling load calculation |
| POST | /equipment-sizing | Equipment selection engine |
| POST | /dehumidification | Dehumidification analysis |

## API Docs

Swagger UI: `http://localhost:8001/docs`
