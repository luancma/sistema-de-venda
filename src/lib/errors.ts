/** Texto de um erro apanhado num `catch` (em TS é `unknown`: pode não ser um Error). */
export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e))
