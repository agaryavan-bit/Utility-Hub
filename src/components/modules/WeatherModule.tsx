import React, { useEffect, useRef, useState } from 'react';
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Compass,
  Droplets,
  Eye,
  Gauge,
  LocateFixed,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Sun,
  Sunrise,
  Sunset,
  Thermometer,
  Trash2,
  Wind,
} from 'lucide-react';
import { makeId, useHub } from '../../context/HubContext';
import { WeatherCity } from '../../types/hub';
import { autoScrollToElement } from '../../utils/autoScroll';
import { triggerHaptic } from '../../utils/haptics';

export function describeWeatherCode(code: number): { label: string; kind: 'clear' | 'partly' | 'cloud' | 'fog' | 'rain' | 'snow' | 'storm' } {
  if (code === 0) return { label: 'Clear Sky', kind: 'clear' };
  if (code === 1 || code === 2) return { label: 'Partly Cloudy', kind: 'partly' };
  if (code === 3) return { label: 'Overcast', kind: 'cloud' };
  if (code === 45 || code === 48) return { label: 'Foggy', kind: 'fog' };
  if ([51, 53, 55, 56, 57].includes(code)) return { label: 'Light Drizzle', kind: 'rain' };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { label: 'Rain Showers', kind: 'rain' };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { label: 'Snowfall', kind: 'snow' };
  if ([95, 96, 99].includes(code)) return { label: 'Thunderstorm', kind: 'storm' };
  return { label: 'Fair', kind: 'partly' };
}

export const WeatherGlyph: React.FC<{ code: number; isDay?: boolean; className?: string }> = ({
  code,
  isDay = true,
  className = 'w-6 h-6',
}) => {
  const { kind } = describeWeatherCode(code);
  switch (kind) {
    case 'clear':
      return isDay ? <Sun className={`${className} text-amber-500`} /> : <Moon className={`${className} text-indigo-500`} />;
    case 'partly':
      return <CloudSun className={`${className} text-amber-500`} />;
    case 'cloud':
      return <Cloud className={`${className} text-slate-500`} />;
    case 'fog':
      return <CloudFog className={`${className} text-slate-400`} />;
    case 'rain':
      return code < 60 ? <CloudDrizzle className={`${className} text-sky-500`} /> : <CloudRain className={`${className} text-sky-600`} />;
    case 'snow':
      return <CloudSnow className={`${className} text-cyan-500`} />;
    case 'storm':
      return <CloudLightning className={`${className} text-indigo-600`} />;
  }
};

export function formatTemp(c: number, unit: 'C' | 'F'): string {
  const val = unit === 'F' ? (c * 9) / 5 + 32 : c;
  return `${Math.round(val)}°`;
}

function aqiLabel(aqi: number): { text: string; tone: string } {
  if (aqi <= 50) return { text: 'Good', tone: 'text-emerald-600' };
  if (aqi <= 100) return { text: 'Moderate', tone: 'text-amber-600' };
  if (aqi <= 150) return { text: 'Sensitive Groups', tone: 'text-orange-600' };
  return { text: 'Unhealthy', tone: 'text-rose-600' };
}

export const WeatherModule: React.FC = () => {
  const {
    state,
    weatherLoading,
    weatherError,
    setActiveWeatherCityId,
    addWeatherCity,
    removeWeatherCity,
    refreshWeatherForCity,
    updatePreferences,
    showToast,
  } = useHub();

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<WeatherCity[]>([]);
  const searchResultsRef = useRef<HTMLDivElement | null>(null);
  const weatherHeroRef = useRef<HTMLDivElement | null>(null);
  const pendingHeroScrollRef = useRef(false);

  const unit = state.preferences.tempUnit;
  const activeCity =
    state.weatherCities.find((c) => c.id === state.activeWeatherCityId) ?? state.weatherCities[0];
  const forecast = activeCity ? state.weatherCache[activeCity.id] : undefined;

  useEffect(() => {
    if (pendingHeroScrollRef.current && forecast) {
      pendingHeroScrollRef.current = false;
      autoScrollToElement(weatherHeroRef);
    }
  }, [forecast, activeCity?.id]);

  const searchCity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    triggerHaptic('selection');
    try {
      const res = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query.trim())}&count=5&language=en&format=json`
      );
      const data = await res.json();
      const mapped: WeatherCity[] = (data.results ?? []).map(
        (r: { id: number; name: string; admin1?: string; country?: string; latitude: number; longitude: number; timezone?: string }) => ({
          id: `city_${r.id}`,
          name: r.name,
          admin1: r.admin1,
          country: r.country ?? '',
          latitude: r.latitude,
          longitude: r.longitude,
          timezone: r.timezone,
        })
      );
      setResults(mapped);
      if (mapped.length > 0) {
        autoScrollToElement(searchResultsRef);
      }
    } catch {
      showToast({ title: 'City search unavailable offline' });
    } finally {
      setSearching(false);
    }
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      showToast({ title: 'Geolocation unavailable in this browser' });
      return;
    }
    triggerHaptic('medium');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const city: WeatherCity = {
          id: makeId('geo'),
          name: 'Current Location',
          country: `${pos.coords.latitude.toFixed(2)}, ${pos.coords.longitude.toFixed(2)}`,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        };
        pendingHeroScrollRef.current = true;
        addWeatherCity(city);
        refreshWeatherForCity(city, true);
        showToast({ title: 'Updated to your current coordinates' });
        autoScrollToElement(weatherHeroRef);
      },
      () => {
        showToast({ title: 'Location permission denied', description: 'Search any city manually instead.' });
      }
    );
  };

  const weekMin = forecast ? Math.min(...forecast.daily.map((d) => d.tempMin)) : 0;
  const weekMax = forecast ? Math.max(...forecast.daily.map((d) => d.tempMax)) : 30;
  const weekSpan = Math.max(1, weekMax - weekMin);

  return (
    <div className="space-y-5">
      {/* Top City Switcher + Search */}
      <div className="glass-panel rounded-3xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <form onSubmit={searchCity} className="flex-1 flex items-center gap-2 max-w-lg">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search any city worldwide…"
                className="w-full h-10 pl-10 pr-4 rounded-xl glass-input text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={searching}
              className="h-10 px-4 rounded-xl bg-[#007AFF] text-white text-xs font-semibold shrink-0 active:scale-95"
            >
              {searching ? 'Searching…' : 'Add City'}
            </button>
          </form>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={useMyLocation}
              className="h-10 px-3.5 rounded-xl bg-white/80 hover:bg-white border border-white text-xs font-semibold text-slate-700 flex items-center gap-1.5"
            >
              <LocateFixed className="w-3.5 h-3.5 text-[#007AFF]" />
              <span>Locate</span>
            </button>
            <button
              type="button"
              onClick={() => activeCity && refreshWeatherForCity(activeCity, true)}
              className="h-10 w-10 rounded-xl bg-white/80 hover:bg-white border border-white text-slate-700 flex items-center justify-center"
              aria-label="Refresh weather"
            >
              <RefreshCw className={`w-4 h-4 ${weatherLoading ? 'animate-spin text-[#007AFF]' : ''}`} />
            </button>
            <div className="flex items-center p-1 rounded-xl bg-slate-900/5">
              {(['C', 'F'] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => updatePreferences({ tempUnit: u })}
                  className={`h-8 px-2.5 rounded-lg text-xs font-mono font-bold ${
                    unit === u ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                  }`}
                >
                  °{u}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Search Dropdown Results */}
        {results.length > 0 && (
          <div ref={searchResultsRef} className="rounded-2xl bg-white/90 border border-white p-2 divide-y divide-slate-200/70">
            {results.map((city) => (
              <button
                key={city.id}
                type="button"
                onClick={() => {
                  pendingHeroScrollRef.current = true;
                  addWeatherCity(city);
                  refreshWeatherForCity(city, true);
                  setResults([]);
                  setQuery('');
                  autoScrollToElement(weatherHeroRef);
                }}
                className="w-full px-3 py-2.5 text-left flex items-center justify-between hover:bg-sky-50/70 rounded-xl transition-colors"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-900">{city.name}</div>
                  <div className="text-xs text-slate-500">
                    {[city.admin1, city.country].filter(Boolean).join(', ')}
                  </div>
                </div>
                <Plus className="w-4 h-4 text-[#007AFF]" />
              </button>
            ))}
          </div>
        )}

        {/* Saved City Tabs */}
        {state.weatherCities.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {state.weatherCities.map((city) => {
              const active = city.id === activeCity?.id;
              const cached = state.weatherCache[city.id];
              return (
                <div
                  key={city.id}
                  className={`flex items-center gap-1.5 rounded-xl pl-3.5 pr-2 h-9 border transition-all shrink-0 ${
                    active
                      ? 'bg-white border-white shadow-xs text-slate-950'
                      : 'bg-white/55 border-white/70 text-slate-600 hover:bg-white/80'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setActiveWeatherCityId(city.id);
                      autoScrollToElement(weatherHeroRef);
                    }}
                    className="text-xs font-semibold flex items-center gap-2 whitespace-nowrap"
                  >
                    <span>{city.name}</span>
                    {cached && (
                      <span className="font-mono tabular-nums text-slate-500">
                        {formatTemp(cached.current.temperature, unit)}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeWeatherCity(city.id)}
                    className="p-1 text-slate-400 hover:text-rose-500"
                    aria-label={`Remove ${city.name}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!activeCity && (
        <div className="glass-panel rounded-3xl p-10 text-center space-y-3">
          <CloudSun className="w-10 h-10 text-amber-500 mx-auto" />
          <h2 className="font-display text-xl font-bold text-slate-900">No Weather Locations Added</h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            Search for a city above or tap Locate to fetch live forecasts for your area.
          </p>
          <button
            type="button"
            onClick={useMyLocation}
            className="h-10 px-5 rounded-xl bg-[#007AFF] text-white text-xs font-semibold inline-flex items-center gap-2 active:scale-95"
          >
            <LocateFixed className="w-4 h-4" />
            <span>Use My Location</span>
          </button>
        </div>
      )}

      {weatherError && !forecast && activeCity && (
        <div className="glass-panel rounded-3xl p-6 text-center space-y-2">
          <p className="text-sm font-semibold text-rose-700">{weatherError}</p>
          <button
            type="button"
            onClick={() => activeCity && refreshWeatherForCity(activeCity, true)}
            className="h-9 px-4 rounded-xl bg-[#007AFF] text-white text-xs font-semibold"
          >
            Retry Sync
          </button>
        </div>
      )}

      {!forecast && weatherLoading && (
        <div className="glass-panel rounded-3xl p-10 animate-pulse space-y-4">
          <div className="h-8 w-44 bg-white/80 rounded-xl mx-auto" />
          <div className="h-16 w-32 bg-white/80 rounded-2xl mx-auto" />
          <div className="h-4 w-56 bg-white/70 rounded-lg mx-auto" />
        </div>
      )}

      {forecast && activeCity && (
        <>
          {/* Hero Current Conditions */}
          <div ref={weatherHeroRef} className="glass-panel rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="text-center sm:text-left space-y-1">
              <div className="text-xs font-medium text-slate-500">
                {[activeCity.admin1, activeCity.country].filter(Boolean).join(' · ')}
              </div>
              <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
                {activeCity.name}
              </h1>
              <div className="flex items-center justify-center sm:justify-start gap-2 pt-1 text-sm font-medium text-slate-700">
                <WeatherGlyph code={forecast.current.weatherCode} isDay={forecast.current.isDay} className="w-5 h-5" />
                <span>{describeWeatherCode(forecast.current.weatherCode).label}</span>
                {forecast.daily[0] && (
                  <>
                    <span className="text-slate-400">·</span>
                    <span className="font-mono tabular-nums text-slate-600">
                      H:{formatTemp(forecast.daily[0].tempMax, unit)} L:{formatTemp(forecast.daily[0].tempMin, unit)}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="font-mono tabular-nums text-6xl sm:text-7xl font-bold tracking-tighter text-slate-950">
              {formatTemp(forecast.current.temperature, unit)}
            </div>
          </div>

          {/* 24-Hour Horizontal Strip */}
          <div className="glass-panel rounded-3xl p-5 space-y-3">
            <div className="text-xs font-semibold text-slate-500">Hourly Forecast</div>
            <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-1">
              {forecast.hourly.slice(0, 18).map((h, i) => {
                const hourLabel =
                  i === 0
                    ? 'Now'
                    : new Date(h.time).toLocaleTimeString([], { hour: 'numeric' });
                return (
                  <div
                    key={h.time}
                    className={`min-w-[66px] rounded-2xl p-3 flex flex-col items-center gap-2 shrink-0 ${
                      i === 0 ? 'bg-white/90 border border-white shadow-xs' : 'bg-white/50 border border-white/70'
                    }`}
                  >
                    <span className="text-[11px] font-medium text-slate-600 whitespace-nowrap">{hourLabel}</span>
                    <WeatherGlyph code={h.weatherCode} isDay={h.isDay} className="w-5 h-5" />
                    <span className="font-mono tabular-nums text-sm font-bold text-slate-900">
                      {formatTemp(h.temperature, unit)}
                    </span>
                    {h.precipitationProb > 10 && (
                      <span className="font-mono text-[10px] font-semibold text-sky-600">
                        {h.precipitationProb}%
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 7-Day Forecast + Detailed Metrics */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            <div className="lg:col-span-5 glass-panel rounded-3xl p-5 space-y-3">
              <div className="text-xs font-semibold text-slate-500">7-Day Forecast</div>
              <div className="divide-y divide-slate-200/70">
                {forecast.daily.map((d, idx) => {
                  const dayName =
                    idx === 0
                      ? 'Today'
                      : new Date(`${d.date}T12:00:00`).toLocaleDateString([], { weekday: 'short' });
                  const leftPct = ((d.tempMin - weekMin) / weekSpan) * 100;
                  const widthPct = Math.max(12, ((d.tempMax - d.tempMin) / weekSpan) * 100);
                  return (
                    <div key={d.date} className="py-3 grid grid-cols-12 items-center gap-2 text-sm">
                      <span className="col-span-3 font-semibold text-slate-800">{dayName}</span>
                      <div className="col-span-2 flex items-center gap-1">
                        <WeatherGlyph code={d.weatherCode} className="w-4 h-4" />
                        {d.precipitationProb > 15 && (
                          <span className="font-mono text-[10px] text-sky-600">{d.precipitationProb}%</span>
                        )}
                      </div>
                      <span className="col-span-2 text-right font-mono tabular-nums text-xs text-slate-500">
                        {formatTemp(d.tempMin, unit)}
                      </span>
                      <div className="col-span-3 h-1.5 rounded-full bg-slate-900/8 relative overflow-hidden">
                        <div
                          className="absolute top-0 bottom-0 rounded-full bg-gradient-to-r from-sky-400 via-amber-400 to-orange-500"
                          style={{ left: `${leftPct}%`, width: `${Math.min(100 - leftPct, widthPct)}%` }}
                        />
                      </div>
                      <span className="col-span-2 text-right font-mono tabular-nums text-xs font-bold text-slate-900">
                        {formatTemp(d.tempMax, unit)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-3.5">
              <div className="glass-panel rounded-2xl p-4 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Thermometer className="w-3.5 h-3.5" />
                  <span>Feels Like</span>
                </div>
                <div className="font-mono tabular-nums text-2xl font-bold text-slate-900">
                  {formatTemp(forecast.current.apparentTemperature, unit)}
                </div>
                <div className="text-xs text-slate-500">Apparent temp</div>
              </div>

              <div className="glass-panel rounded-2xl p-4 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Sun className="w-3.5 h-3.5" />
                  <span>UV Index</span>
                </div>
                <div className="font-mono tabular-nums text-2xl font-bold text-slate-900">
                  {forecast.current.uvIndex.toFixed(1)}
                </div>
                <div className="text-xs text-slate-500">
                  {forecast.current.uvIndex < 3 ? 'Low' : forecast.current.uvIndex < 6 ? 'Moderate' : 'High'}
                </div>
              </div>

              <div className="glass-panel rounded-2xl p-4 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Wind className="w-3.5 h-3.5" />
                  <span>Wind</span>
                </div>
                <div className="font-mono tabular-nums text-2xl font-bold text-slate-900">
                  {Math.round(forecast.current.windSpeed)} <span className="text-xs font-medium">km/h</span>
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-1">
                  <Compass className="w-3 h-3" />
                  <span>{Math.round(forecast.current.windDirection)}° bearing</span>
                </div>
              </div>

              <div className="glass-panel rounded-2xl p-4 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Droplets className="w-3.5 h-3.5" />
                  <span>Humidity</span>
                </div>
                <div className="font-mono tabular-nums text-2xl font-bold text-slate-900">
                  {Math.round(forecast.current.humidity)}%
                </div>
                <div className="text-xs text-slate-500">Cloud cover {forecast.current.cloudCover}%</div>
              </div>

              <div className="glass-panel rounded-2xl p-4 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Gauge className="w-3.5 h-3.5" />
                  <span>Pressure</span>
                </div>
                <div className="font-mono tabular-nums text-2xl font-bold text-slate-900">
                  {Math.round(forecast.current.pressure)}
                </div>
                <div className="text-xs text-slate-500">hPa surface</div>
              </div>

              <div className="glass-panel rounded-2xl p-4 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Eye className="w-3.5 h-3.5" />
                  <span>Visibility</span>
                </div>
                <div className="font-mono tabular-nums text-2xl font-bold text-slate-900">
                  {(forecast.current.visibility / 1000).toFixed(1)} <span className="text-xs font-medium">km</span>
                </div>
                <div className="text-xs text-slate-500">Clear sightline</div>
              </div>

              {forecast.daily[0] && (
                <div className="glass-panel rounded-2xl p-4 col-span-2 sm:col-span-2 flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Sunrise className="w-3.5 h-3.5 text-amber-500" />
                      <span>Sunrise</span>
                    </div>
                    <div className="mt-1 font-mono tabular-nums text-lg font-bold text-slate-900">
                      {forecast.daily[0].sunrise.slice(11, 16) || '—'}
                    </div>
                  </div>
                  <div className="h-8 w-px bg-slate-200/80" />
                  <div className="text-right">
                    <div className="flex items-center justify-end gap-1.5 text-xs text-slate-500">
                      <span>Sunset</span>
                      <Sunset className="w-3.5 h-3.5 text-orange-500" />
                    </div>
                    <div className="mt-1 font-mono tabular-nums text-lg font-bold text-slate-900">
                      {forecast.daily[0].sunset.slice(11, 16) || '—'}
                    </div>
                  </div>
                </div>
              )}

              {forecast.aqi && (
                <div className="glass-panel rounded-2xl p-4 col-span-2 sm:col-span-1 space-y-1">
                  <div className="text-xs text-slate-500">Air Quality</div>
                  <div className="font-mono tabular-nums text-2xl font-bold text-slate-900">
                    {Math.round(forecast.aqi.usAqi)}
                  </div>
                  <div className={`text-xs font-semibold ${aqiLabel(forecast.aqi.usAqi).tone}`}>
                    {aqiLabel(forecast.aqi.usAqi).text} · US AQI
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
