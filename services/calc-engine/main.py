"""
HVAC Calculation Engine — FastAPI Microservice
Provides advanced ASHRAE-compliant thermodynamic calculations.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
import math

import psychrolib

# Set SI units for psychrolib
psychrolib.SetUnitSystem(psychrolib.SI)

app = FastAPI(
    title="HVAC Calculation Engine",
    description="Advanced ASHRAE-compliant HVAC calculations for Philippine climate",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Constants ───────────────────────────────────────────────────────────────

# Standard atmospheric pressure at sea level (Pa)
ATM_PRESSURE = 101325.0

# Philippine design conditions (ASHRAE defaults)
PH_OUTDOOR_DB = 35.0  # °C dry-bulb
PH_OUTDOOR_WB = 28.0  # °C wet-bulb
PH_INDOOR_DB = 24.0   # °C dry-bulb
PH_INDOOR_RH = 0.55   # 55% relative humidity


# ─── Schemas ─────────────────────────────────────────────────────────────────

class PsychrometricInput(BaseModel):
    dry_bulb_c: float = Field(..., description="Dry-bulb temperature in °C")
    wet_bulb_c: Optional[float] = Field(None, description="Wet-bulb temperature in °C")
    relative_humidity: Optional[float] = Field(None, ge=0, le=1, description="Relative humidity 0-1")
    dew_point_c: Optional[float] = Field(None, description="Dew point temperature in °C")
    pressure_pa: float = Field(ATM_PRESSURE, description="Atmospheric pressure in Pa")


class PsychrometricResult(BaseModel):
    dry_bulb_c: float
    wet_bulb_c: float
    dew_point_c: float
    relative_humidity: float
    humidity_ratio: float  # kg_water/kg_dryair
    enthalpy: float  # J/kg
    specific_volume: float  # m³/kg
    degree_of_saturation: float


class CoolingLoadInput(BaseModel):
    # Room geometry
    area_sqm: float = Field(..., gt=0)
    ceiling_height_m: float = Field(2.7, gt=0)
    
    # Outdoor conditions
    outdoor_db: float = Field(PH_OUTDOOR_DB)
    outdoor_wb: float = Field(PH_OUTDOOR_WB)
    
    # Indoor conditions
    indoor_db: float = Field(PH_INDOOR_DB)
    indoor_rh: float = Field(PH_INDOOR_RH, ge=0, le=1)
    
    # Building envelope
    wall_area_sqm: float = Field(0.0, ge=0)
    wall_u_value: float = Field(2.9, description="W/m²·K")
    glass_area_sqm: float = Field(0.0, ge=0)
    glass_u_value: float = Field(5.8, description="W/m²·K")
    glass_shgc: float = Field(0.82, ge=0, le=1, description="Solar heat gain coefficient")
    roof_area_sqm: float = Field(0.0, ge=0)
    roof_u_value: float = Field(1.8, description="W/m²·K")
    
    # Solar
    cltd_wall: float = Field(12.0, description="CLTD for wall (°C)")
    cltd_roof: float = Field(25.0, description="CLTD for roof (°C)")
    solar_load_factor: float = Field(300.0, description="Solar load W/m² of glass")
    
    # Internal loads
    occupant_count: int = Field(1, ge=0)
    sensible_per_person_w: float = Field(75.0)
    latent_per_person_w: float = Field(55.0)
    lighting_w_per_sqm: float = Field(15.0)
    equipment_w_per_sqm: float = Field(20.0)
    
    # Ventilation
    ventilation_cfm_per_person: float = Field(20.0)
    
    # Safety
    safety_factor: float = Field(1.10, ge=1.0, le=1.5)
    
    # Space type for internal load adjustment
    space_type: str = Field("office")
    latitude: Optional[float] = Field(14.5, description="Latitude in degrees")


class CoolingLoadResult(BaseModel):
    wall_load_w: float
    roof_load_w: float
    glass_conduction_w: float
    glass_solar_w: float
    people_sensible_w: float
    people_latent_w: float
    lighting_w: float
    equipment_w: float
    ventilation_sensible_w: float
    ventilation_latent_w: float
    sensible_load_w: float
    latent_load_w: float
    subtotal_w: float
    safety_factor: float
    total_load_w: float
    total_load_tr: float
    watts_per_sqm: float
    cfm_required: float
    psychrometric_outdoor: PsychrometricResult
    psychrometric_indoor: PsychrometricResult


class EquipmentSizingInput(BaseModel):
    total_load_w: float = Field(..., gt=0)
    sensible_load_w: float = Field(..., gt=0)
    latent_load_w: float = Field(0.0, ge=0)
    space_type: str = Field("office")
    area_sqm: float = Field(0.0, ge=0)
    indoor_db: float = Field(PH_INDOOR_DB)
    indoor_rh: float = Field(PH_INDOOR_RH, ge=0, le=1)


class EquipmentRecommendation(BaseModel):
    equipment_type: str
    required_capacity_kw: float
    recommended_capacity_kw: float
    quantity: int
    sensible_heat_ratio: float
    estimated_power_kw: float
    estimated_annual_kwh: float
    estimated_annual_cost_php: float
    reason: str


class DehumidificationInput(BaseModel):
    airflow_m3_per_s: float = Field(..., gt=0)
    entering_db: float = Field(PH_OUTDOOR_DB)
    entering_rh: float = Field(0.75, ge=0, le=1)
    leaving_db: float = Field(PH_INDOOR_DB)
    leaving_rh: float = Field(PH_INDOOR_RH, ge=0, le=1)
    pressure_pa: float = Field(ATM_PRESSURE)


class DehumidificationResult(BaseModel):
    entering_humidity_ratio: float
    leaving_humidity_ratio: float
    moisture_removal_kg_per_s: float
    moisture_removal_kg_per_hr: float
    sensible_cooling_kw: float
    latent_cooling_kw: float
    total_cooling_kw: float
    apparatus_dew_point_c: float


# ─── Helpers ─────────────────────────────────────────────────────────────────

def compute_psychrometrics(db: float, wb: float = None, rh: float = None,
                           dp: float = None, p: float = ATM_PRESSURE) -> PsychrometricResult:
    """Calculate full psychrometric state from any two properties."""
    if wb is not None:
        hr = psychrolib.GetHumRatioFromTWetBulb(db, wb, p)
    elif rh is not None:
        hr = psychrolib.GetHumRatioFromRelHum(db, rh, p)
    elif dp is not None:
        hr = psychrolib.GetHumRatioFromTDewPoint(dp, p)
    else:
        raise ValueError("Provide wet_bulb_c, relative_humidity, or dew_point_c")

    td = psychrolib.GetTDewPointFromHumRatio(db, hr, p)
    rh_val = psychrolib.GetRelHumFromHumRatio(db, hr, p)
    tw = psychrolib.GetTWetBulbFromHumRatio(db, hr, p)
    h = psychrolib.GetMoistAirEnthalpy(db, hr)
    v = psychrolib.GetMoistAirVolume(db, hr, p)

    hr_sat = psychrolib.GetSatHumRatio(db, p)
    mu = hr / hr_sat if hr_sat > 0 else 0

    return PsychrometricResult(
        dry_bulb_c=round(db, 2),
        wet_bulb_c=round(tw, 2),
        dew_point_c=round(td, 2),
        relative_humidity=round(rh_val, 4),
        humidity_ratio=round(hr, 6),
        enthalpy=round(h, 2),
        specific_volume=round(v, 4),
        degree_of_saturation=round(mu, 4),
    )


# ─── Endpoints ───────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "hvac-calc-engine", "version": "1.0.0"}


@app.post("/psychrometrics", response_model=PsychrometricResult)
async def psychrometrics(inp: PsychrometricInput):
    """
    Calculate psychrometric properties from dry-bulb + one other property.
    Provide either wet_bulb_c, relative_humidity (0-1), or dew_point_c.
    """
    return compute_psychrometrics(
        db=inp.dry_bulb_c,
        wb=inp.wet_bulb_c,
        rh=inp.relative_humidity,
        dp=inp.dew_point_c,
        p=inp.pressure_pa,
    )


@app.post("/cooling-load", response_model=CoolingLoadResult)
async def cooling_load(inp: CoolingLoadInput):
    """
    Calculate detailed cooling load using CLTD/CLF method per ASHRAE.
    Returns component breakdown + psychrometric states.
    """
    # Psychrometric states
    psy_out = compute_psychrometrics(db=inp.outdoor_db, wb=inp.outdoor_wb)
    psy_in = compute_psychrometrics(db=inp.indoor_db, rh=inp.indoor_rh)

    # --- Envelope loads ---
    wall_load = inp.wall_area_sqm * inp.wall_u_value * inp.cltd_wall
    roof_load = inp.roof_area_sqm * inp.roof_u_value * inp.cltd_roof
    glass_cond = inp.glass_area_sqm * inp.glass_u_value * (inp.outdoor_db - inp.indoor_db)
    glass_solar = inp.glass_area_sqm * inp.glass_shgc * inp.solar_load_factor

    # --- Internal loads ---
    people_sens = inp.occupant_count * inp.sensible_per_person_w
    people_lat = inp.occupant_count * inp.latent_per_person_w
    lighting = inp.area_sqm * inp.lighting_w_per_sqm
    equip = inp.area_sqm * inp.equipment_w_per_sqm

    # --- Ventilation ---
    vent_cfm = inp.occupant_count * inp.ventilation_cfm_per_person
    vent_m3s = vent_cfm * 0.000471947  # CFM to m³/s
    air_density = 1.2  # kg/m³ (approx)
    cp_air = 1006.0  # J/(kg·K)

    delta_hr = psy_out.humidity_ratio - psy_in.humidity_ratio
    h_fg = 2501000.0  # J/kg latent heat of vaporisation

    vent_sens = vent_m3s * air_density * cp_air * (inp.outdoor_db - inp.indoor_db)
    vent_lat = vent_m3s * air_density * h_fg * max(0, delta_hr)

    # --- Totals ---
    sensible = wall_load + roof_load + glass_cond + glass_solar + people_sens + lighting + equip + vent_sens
    latent = people_lat + vent_lat
    subtotal = sensible + latent
    total = subtotal * inp.safety_factor
    total_tr = total / 3517.0

    # CFM supply air (based on 20 °F ΔT ≈ 11.1 °C)
    supply_dt = 11.1
    cfm_required = (sensible / (air_density * cp_air * supply_dt)) / 0.000471947 if sensible > 0 else 0

    return CoolingLoadResult(
        wall_load_w=round(wall_load, 1),
        roof_load_w=round(roof_load, 1),
        glass_conduction_w=round(glass_cond, 1),
        glass_solar_w=round(glass_solar, 1),
        people_sensible_w=round(people_sens, 1),
        people_latent_w=round(people_lat, 1),
        lighting_w=round(lighting, 1),
        equipment_w=round(equip, 1),
        ventilation_sensible_w=round(vent_sens, 1),
        ventilation_latent_w=round(vent_lat, 1),
        sensible_load_w=round(sensible, 1),
        latent_load_w=round(latent, 1),
        subtotal_w=round(subtotal, 1),
        safety_factor=inp.safety_factor,
        total_load_w=round(total, 1),
        total_load_tr=round(total_tr, 3),
        watts_per_sqm=round(total / inp.area_sqm, 1) if inp.area_sqm > 0 else 0,
        cfm_required=round(cfm_required, 0),
        psychrometric_outdoor=psy_out,
        psychrometric_indoor=psy_in,
    )


@app.post("/equipment-sizing", response_model=EquipmentRecommendation)
async def equipment_sizing(inp: EquipmentSizingInput):
    """
    Recommend equipment type and capacity based on cooling load.
    Accounts for sensible heat ratio and Philippine energy costs.
    """
    capacity_kw = inp.total_load_w / 1000.0
    shr = inp.sensible_load_w / inp.total_load_w if inp.total_load_w > 0 else 0.75

    # Determine equipment type
    if capacity_kw <= 7.0:
        eq_type = "wall_split"
        oversizing = 1.10
        eer = 3.8  # COP
        reason = "Wall-mounted split suitable for small rooms up to ~50m²"
    elif capacity_kw <= 14.0:
        eq_type = "ceiling_cassette"
        oversizing = 1.10
        eer = 3.5
        reason = "4-way cassette provides uniform air distribution for medium spaces"
    elif capacity_kw <= 28.0:
        eq_type = "ducted_split"
        oversizing = 1.15
        eer = 3.3
        reason = "Ducted split for concealed installation in larger spaces"
    elif capacity_kw <= 70.0:
        eq_type = "floor_standing"
        oversizing = 1.15
        eer = 3.2
        reason = "Floor-standing unit for high-capacity single-zone needs"
    else:
        eq_type = "chiller"
        oversizing = 1.20
        eer = 4.5
        reason = "Chiller plant recommended for large building cooling loads"

    recommended_kw = capacity_kw * oversizing
    estimated_power = recommended_kw / eer

    # Annual energy estimate (3000 operating hours @ Philippine avg)
    annual_kwh = estimated_power * 3000
    php_per_kwh = 12.0  # Meralco avg rate
    annual_cost = annual_kwh * php_per_kwh

    return EquipmentRecommendation(
        equipment_type=eq_type,
        required_capacity_kw=round(capacity_kw, 2),
        recommended_capacity_kw=round(recommended_kw, 2),
        quantity=1,
        sensible_heat_ratio=round(shr, 3),
        estimated_power_kw=round(estimated_power, 2),
        estimated_annual_kwh=round(annual_kwh, 0),
        estimated_annual_cost_php=round(annual_cost, 0),
        reason=reason,
    )


@app.post("/dehumidification", response_model=DehumidificationResult)
async def dehumidification(inp: DehumidificationInput):
    """
    Analyze dehumidification requirements — important in tropical Philippine climate.
    Computes moisture removal and coil loads for proper IAQ.
    """
    psy_ent = compute_psychrometrics(db=inp.entering_db, rh=inp.entering_rh, p=inp.pressure_pa)
    psy_lvg = compute_psychrometrics(db=inp.leaving_db, rh=inp.leaving_rh, p=inp.pressure_pa)

    air_density = 1.2
    cp_air = 1006.0
    h_fg = 2501000.0

    mass_flow = inp.airflow_m3_per_s * air_density  # kg/s

    delta_hr = psy_ent.humidity_ratio - psy_lvg.humidity_ratio
    moisture_removal = mass_flow * max(0, delta_hr)  # kg_water/s
    moisture_removal_hr = moisture_removal * 3600

    sensible_kw = mass_flow * cp_air * (inp.entering_db - inp.leaving_db) / 1000
    latent_kw = mass_flow * h_fg * max(0, delta_hr) / 1000
    total_kw = sensible_kw + latent_kw

    # Apparatus dew point (ADP) — approximate
    # ADP is the coil surface temperature needed
    adp = psy_lvg.dew_point_c - 2.0  # rough estimate

    return DehumidificationResult(
        entering_humidity_ratio=psy_ent.humidity_ratio,
        leaving_humidity_ratio=psy_lvg.humidity_ratio,
        moisture_removal_kg_per_s=round(moisture_removal, 6),
        moisture_removal_kg_per_hr=round(moisture_removal_hr, 3),
        sensible_cooling_kw=round(sensible_kw, 3),
        latent_cooling_kw=round(latent_kw, 3),
        total_cooling_kw=round(total_kw, 3),
        apparatus_dew_point_c=round(adp, 2),
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
