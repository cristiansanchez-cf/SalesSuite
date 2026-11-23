import { z } from 'zod';

/**
 * Tabla de competencia (docs/DECKS.md): filas (funcionalidades) × columnas (vosotros primero, luego cada competidor).
 * Celdas: «yes» ✓ · «no» ✗ · «partial» ~ · «building» ◐ · «na» — · o un texto corto (p. ej. el modelo de precio).
 */
export const deckMatrixSchema = z.object({
  eyebrow: z.string().max(60).optional(),
  title: z.string().min(1).max(140),
  lede: z.string().max(320).optional(),
  columns: z.array(z.string().min(1).max(30)).min(2).max(11),
  rows: z.array(z.object({ label: z.string().min(1).max(60), cells: z.array(z.string().max(60)).min(2).max(11) })).min(1).max(10),
  legend: z.string().max(200).optional(),
  onlyUsLabel: z.string().max(40).optional(),
  conclusion: z.string().max(600).optional(),
  points: z.array(z.string().min(1).max(120)).max(6).optional(),
});
export type DeckMatrixProps = z.infer<typeof deckMatrixSchema>;
