export type Grid = { left: number; top: number; right: number; bottom: number; rows: number; columns: number; radius: number };
export type TemplateLayout = { width: number; height: number; answers: Grid[]; workNumber: Grid };
export type CardModel = { id: string; name: string; answerKeyId: string; answerKey: { variant: string; version: number } };
export function gridPoints(grid: Grid) {
  if (!Number.isInteger(grid.rows) || grid.rows < 1 || grid.rows > 150 ||
      !Number.isInteger(grid.columns) || grid.columns < 2 || grid.columns > 10) return [];
  return Array.from({ length: grid.rows }, (_, row) => Array.from({ length: grid.columns }, (_, column) => ({
    x: grid.left + (grid.right - grid.left) * column / (grid.columns - 1),
    y: grid.top + (grid.rows === 1 ? 0 : (grid.bottom - grid.top) * row / (grid.rows - 1)),
  }))).flat();
}
