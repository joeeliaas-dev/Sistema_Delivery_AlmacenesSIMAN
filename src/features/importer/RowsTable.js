// src/features/importer/RowsTable.js (dueño: P3)
// Paso 2 de Importar pedidos: filtros del semáforo (Listos · Revisar dirección · Con error) y la
// vista previa. En pantalla ancha es una tabla (fila, pedido, cliente, dirección, municipio, fecha,
// estado); a 360 px cada fila es una tarjeta. El estado va en palabras ("Listo", "Revisar dirección",
// "Error: teléfono") con su punto de color; al tocar la fila se ve el detalle (rediseño 30 oct).
// Nombres de campos de C24: orderNumber, address.reference, scheduledDate.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, tones, typography } from '../../theme';
import { ROW_FILTERS, filterRows, rowDetail, rowStateLabel } from './importRows';

const TONE = Object.fromEntries(ROW_FILTERS.map((f) => [f.key, f]));
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const shortDate = (iso) => {
  const [, m, d] = String(iso ?? '')
    .split('-')
    .map(Number);
  return m && d ? `${d} ${MONTHS[m - 1]}` : '—';
};

export function RowFilters({ summary, value, onChange }) {
  return (
    <View style={styles.filters} accessibilityRole="radiogroup" accessibilityLabel="Filtrar filas">
      {ROW_FILTERS.map((f) => {
        const t = tones[f.tone];
        const selected = value === f.key;
        const count = summary[f.key];
        return (
          <Pressable
            key={f.key}
            onPress={() => onChange(selected ? null : f.key)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={`${f.label}: ${count}`}
            style={styles.target}
          >
            {({ pressed }) => (
              <View
                style={[
                  styles.chip,
                  {
                    backgroundColor: selected ? t.bg : colors.white,
                    borderColor: selected ? t.accent : colors.cardBorder,
                  },
                  pressed && styles.chipPressed,
                ]}
              >
                <View style={[styles.dot, { backgroundColor: t.accent }]} />
                <Text style={[styles.chipLabel, { color: selected ? t.fg : colors.onSurface }]}>{f.label}</Text>
                <Text style={[styles.chipCount, selected && { color: t.fg }]}>{count}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

function StatusCell({ row }) {
  const t = tones[TONE[row.status]?.tone ?? 'neutral'];
  return (
    <View style={styles.status}>
      <View style={[styles.dot, { backgroundColor: t.accent }]} />
      <Text style={[styles.cell, row.status !== 'verde' && { color: t.fg }]} numberOfLines={1}>
        {rowStateLabel(row)}
      </Text>
    </View>
  );
}

// Detalle al tocar: una línea por motivo
function Detail({ row }) {
  const lines = rowDetail(row);
  if (!lines.length) return null;
  return (
    <View style={styles.detail}>
      {lines.map((line) => (
        <Text key={line} style={styles.detailText}>
          {line}
        </Text>
      ))}
    </View>
  );
}

const COLUMNS = [
  { key: 'row', label: 'Fila', style: { width: 56 } },
  { key: 'order', label: 'Pedido', style: { width: 128 } },
  { key: 'customer', label: 'Cliente', style: { flex: 1.2 } },
  { key: 'address', label: 'Dirección', style: { flex: 1.8 } },
  { key: 'municipio', label: 'Municipio', style: { flex: 1 } },
  { key: 'date', label: 'Fecha', style: { width: 72 } },
  { key: 'state', label: 'Estado', style: { width: 196 } },
];

function TableRow({ row }) {
  const o = row.order ?? {};
  const [open, setOpen] = useState(false);
  const hasDetail = rowDetail(row).length > 0;
  return (
    <Pressable
      onPress={() => setOpen(!open)}
      disabled={!hasDetail}
      accessibilityRole={hasDetail ? 'button' : undefined}
      accessibilityState={hasDetail ? { expanded: open } : undefined}
      accessibilityLabel={`Fila ${row.rowNumber}, ${o.orderNumber || 'sin pedido'}: ${rowStateLabel(row)}`}
      style={({ pressed }) => [styles.trWrap, pressed && styles.rowPressed]}
    >
      <View style={styles.tr}>
        <Text style={[styles.td, styles.cellMuted, COLUMNS[0].style]}>{row.rowNumber}</Text>
        <Text style={[styles.td, styles.cellCode, COLUMNS[1].style]} numberOfLines={1}>
          {o.orderNumber || '—'}
        </Text>
        <Text style={[styles.td, styles.cell, COLUMNS[2].style]} numberOfLines={1}>
          {o.customer?.name || '—'}
        </Text>
        <View style={[styles.td, COLUMNS[3].style]}>
          <Text style={styles.cell} numberOfLines={1}>
            {o.address?.text || '—'}
          </Text>
          {o.address?.reference ? (
            <Text style={styles.cellMuted} numberOfLines={1}>
              {o.address.reference}
            </Text>
          ) : null}
        </View>
        <Text style={[styles.td, styles.cell, COLUMNS[4].style]} numberOfLines={1}>
          {o.address?.municipio || '—'}
        </Text>
        <Text style={[styles.td, styles.cell, COLUMNS[5].style]}>{shortDate(o.scheduledDate)}</Text>
        <View style={[styles.td, COLUMNS[6].style]}>
          <StatusCell row={row} />
        </View>
      </View>
      {open ? <Detail row={row} /> : null}
    </Pressable>
  );
}

function RowCard({ row }) {
  const o = row.order ?? {};
  const [open, setOpen] = useState(false);
  const hasDetail = rowDetail(row).length > 0;
  return (
    <Pressable
      onPress={() => setOpen(!open)}
      disabled={!hasDetail}
      accessibilityRole={hasDetail ? 'button' : undefined}
      accessibilityState={hasDetail ? { expanded: open } : undefined}
      style={({ pressed }) => [styles.card, pressed && styles.rowPressed]}
    >
      <View style={styles.cardTop}>
        <Text style={styles.cellCode} numberOfLines={1}>
          Fila {row.rowNumber} · {o.orderNumber || 'sin pedido'}
        </Text>
        <StatusCell row={row} />
      </View>
      <Text style={styles.cardName} numberOfLines={1}>
        {o.customer?.name || 'Sin cliente'}
      </Text>
      <Text style={styles.cell} numberOfLines={2}>
        {[o.address?.text, o.address?.municipio].filter(Boolean).join(', ') || 'Sin dirección'}
      </Text>
      {o.address?.reference ? <Text style={styles.cellMuted}>{o.address.reference}</Text> : null}
      <Text style={styles.cellMuted}>Entrega {shortDate(o.scheduledDate)}</Text>
      {open ? <Detail row={row} /> : null}
    </Pressable>
  );
}

export function RowsTable({ rows, filter, wide }) {
  const visible = filterRows(rows, filter);
  if (!visible.length) return <Text style={styles.empty}>No hay filas con este filtro.</Text>;

  if (!wide)
    return (
      <View style={styles.cards}>
        {visible.map((r) => (
          <RowCard key={r.rowNumber} row={r} />
        ))}
      </View>
    );

  return (
    <View style={styles.table} accessibilityRole="list">
      <View style={[styles.tr, styles.thead]}>
        {COLUMNS.map((c) => (
          <Text key={c.key} style={[styles.td, styles.th, c.style]}>
            {c.label}
          </Text>
        ))}
      </View>
      {visible.map((r) => (
        <TableRow key={r.rowNumber} row={r} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  target: { minHeight: 44, justifyContent: 'center' },
  chip: {
    height: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  chipPressed: { backgroundColor: colors.surfaceContainer },
  chipLabel: typography.label,
  chipCount: { ...typography.number, color: colors.onSurfaceVariant },
  table: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  thead: { backgroundColor: colors.background, borderBottomWidth: 0 },
  trWrap: { borderTopWidth: 1, borderTopColor: colors.cardBorder },
  tr: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
  rowPressed: { backgroundColor: colors.surfaceContainer },
  detail: { paddingLeft: 56 + spacing.md, paddingRight: spacing.md, paddingBottom: spacing.sm, gap: 2 },
  detailText: { ...typography.body, color: colors.onSurfaceVariant },
  td: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  th: { ...typography.captionStrong, color: colors.onSurfaceVariant },
  cell: { ...typography.body, color: colors.onSurface },
  cellMuted: { ...typography.caption, color: colors.onSurfaceVariant },
  cellCode: { ...typography.code, color: colors.onSurfaceVariant },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  cards: { gap: spacing.sm },
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  cardName: { ...typography.bodyStrong, color: colors.onSurface, marginTop: spacing.xs },
  empty: { ...typography.body, color: colors.onSurfaceVariant, padding: spacing.lg, textAlign: 'center' },
});

export default RowsTable;
