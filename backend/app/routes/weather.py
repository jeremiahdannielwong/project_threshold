"""Weather endpoint.

GET /api/weather                 → baked per-CT weather from the communities table
GET /api/weather?live=true       → live Open-Meteo refresh (cached for weather TTL)
GET /api/weather?simulate=true&humidex=48&...
                                 → baked weather with the supplied fields
                                   overridden uniformly across every CT, so the
                                   frontend can preview a heatwave / ice storm
                                   (presets are owned by the client).
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from ..deps import get_weather_service
from ..models.common import Envelope
from ..models.weather import CTWeather
from ..services.weather import WeatherService
from ..sources import get_source

router = APIRouter(prefix="/api/weather", tags=["weather"])


@router.get("", response_model=Envelope[list[CTWeather]])
async def get_weather(
    service: Annotated[WeatherService, Depends(get_weather_service)],
    live: Annotated[bool, Query(description="Fetch fresh values from Open-Meteo.")] = False,
    simulate: Annotated[
        bool,
        Query(description="Override baked weather with the supplied per-field values."),
    ] = False,
    temperature_c: Annotated[float | None, Query(description="Override temperature (°C).")] = None,
    humidex: Annotated[float | None, Query(description="Override apparent temperature / humidex (°C).")] = None,
    precipitation_mm: Annotated[float | None, Query(description="Override precipitation (mm).")] = None,
    wind_speed_kmh: Annotated[float | None, Query(description="Override wind speed (km/h).")] = None,
    wind_gusts_kmh: Annotated[float | None, Query(description="Override wind gusts (km/h).")] = None,
    weather_code: Annotated[int | None, Query(description="Override WMO weather code.")] = None,
) -> Envelope[list[CTWeather]]:
    if live and simulate:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="`live` and `simulate` are mutually exclusive.",
        )
    if simulate:
        data = service.simulated(
            {
                "temperature_c": temperature_c,
                "humidex": humidex,
                "precipitation_mm": precipitation_mm,
                "wind_speed_kmh": wind_speed_kmh,
                "wind_gusts_kmh": wind_gusts_kmh,
                "weather_code": weather_code,
            }
        )
    else:
        data = await service.live() if live else service.baked()
    return Envelope(data=data, sources=[get_source("open-meteo-current")])
