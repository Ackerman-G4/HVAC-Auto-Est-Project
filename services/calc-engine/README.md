# HVAC Calculation Engine (Python FastAPI Microservice)

A Python microservice providing advanced ASHRAE-compliant thermodynamic calculations
for the HVAC Auto-Estimation web application.

## Features
- Psychrometric property calculations using `psychrolib`
- ASHRAE cooling load methodology (CLTD/CLF and RTS)
- Equipment sizing with dehumidification analysis
- Philippine climate data integration

## Setup

```bash
cd services/calc-engine
pip install -r requirements.txt
uvicorn main:app --port 8001 --reload
```

## Endpoints

| Method | Path                    | Description                       |
|--------|-------------------------|-----------------------------------|
| GET    | /health                 | Health check                      |
| POST   | /psychrometrics         | Psychrometric property calc       |
| POST   | /cooling-load           | Detailed cooling load calc        |
| POST   | /equipment-sizing       | Equipment selection engine        |
| POST   | /dehumidification       | Dehumidification analysis         |

## API Documentation
Visit `http://localhost:8001/docs` for interactive Swagger docs.
