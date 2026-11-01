// scripts/genMocks.mjs  (dueño: P1)
// Regenera src/mocks/*.json y src/features/zones/zones.geojson desde el mismo
// set de datos que usa el seed.  Uso: node scripts/genMocks.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDataset } from './data/buildDataset.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = buildDataset();
const write = (rel, obj) => {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');
};

write('src/mocks/depot.json', data.depot);
write('src/mocks/zones.json', data.zones);
write('src/mocks/drivers.json', data.drivers);
write('src/mocks/shipments.json', data.shipments);
write('src/mocks/routes.json', data.routes);

write('src/features/zones/zones.geojson', {
  type: 'FeatureCollection',
  features: data.zones.map((z) => ({
    type: 'Feature',
    properties: { id: z.id, name: z.name, color: z.color },
    geometry: {
      type: 'Polygon',
      coordinates: [[...z.polygon, z.polygon[0]].map((p) => [p.lng, p.lat])],
    },
  })),
});

const count = data.shipments.reduce((acc, s) => ({ ...acc, [s.status]: (acc[s.status] ?? 0) + 1 }), {});
console.log(`mocks: ${data.shipments.length} envíos`, count);
