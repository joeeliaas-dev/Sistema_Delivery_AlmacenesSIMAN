import { PRIORITY } from '../constants';
import { ROUTING } from '../config/routing';
import { haversineKm, optimizeLocal } from './local';
const round2 = (x) => Math.round(x * 100) / 100;
const isExpress = (s) => s.priority === PRIORITY.EXPRESS;
const tieBreak = (a, b) => String(a.code ?? a.id).localeCompare(String(b.code ?? b.id));
const byTime = (a, b) => String(a.scheduledTime ?? '').localeCompare(String(b.scheduledTime ?? '')) || tieBreak(a, b);
const byPriorityThenTime = (a, b) => isExpress(b) - isExpress(a) || byTime(a, b);
function pathKm(start, stops, factor) {
  let prev = start,
    sum = 0;
  for (const s of stops) {
    sum += haversineKm(prev, s.location) * factor;
    prev = s.location;
  }
  return sum;
}
export function optimizeRoute({ depot, stops, options = {} }) {
  const cfg = {
    ...ROUTING,
    ...options,
  };
  const startAt = new Date(options.startAt ?? Date.now());
  if (!depot?.location) throw new Error('Falta la ubicación del depósito');
  for (const s of stops) {
    if (!Number.isFinite(s?.location?.lat) || !Number.isFinite(s?.location?.lng))
      throw new Error(`El envío ${s?.code ?? s?.id} no tiene ubicación`);
  }
  const sorted = [...stops].sort(byPriorityThenTime);
  const selected = sorted.slice(0, cfg.maxStops);
  const skipped = sorted.slice(cfg.maxStops);
  const express = optimizeLocal({
    depot,
    stops: selected.filter(isExpress),
    circuityFactor: cfg.circuityFactor,
  });
  const lastExpress = express.ordered[express.ordered.length - 1];
  const normal = optimizeLocal({
    depot: lastExpress ?? depot,
    stops: selected.filter((s) => !isExpress(s)),
    circuityFactor: cfg.circuityFactor,
  });
  const baselineKm = pathKm(depot.location, selected, cfg.circuityFactor);
  const optimized = [...express.ordered, ...normal.ordered];
  const ordered = pathKm(depot.location, optimized, cfg.circuityFactor) <= baselineKm ? optimized : selected;
  let prev = depot.location,
    minutes = 0,
    totalKm = 0;
  const legs = ordered.map((s, i) => {
    const km = haversineKm(prev, s.location) * cfg.circuityFactor;
    totalKm += km;
    minutes += (km / cfg.avgSpeedKmh) * 60;
    const etaMin = Math.round(minutes);
    minutes += cfg.serviceMinutes;
    prev = s.location;
    return {
      shipmentId: s.id,
      seq: i + 1,
      etaMin,
      kmFromPrev: round2(km),
    };
  });
  const totalMin = Math.round(minutes);
  return {
    ordered,
    legs,
    totalKm: round2(totalKm),
    baselineKm: round2(baselineKm),
    estEnd: new Date(startAt.getTime() + totalMin * 60000).toISOString(),
    totalMin,
    skipped,
    provider: 'local',
  };
}
