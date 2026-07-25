export interface ClaimContext {
  subject?: string;
  time?: string;
  location?: string;
  unit?: string;
  population?: string;
  definition?: string;
}

export function compareContexts(
  left: ClaimContext,
  right: ClaimContext
): { sameContext: boolean; differences: string[] } {
  const fields: Array<keyof ClaimContext> = [
    "subject",
    "time",
    "location",
    "unit",
    "population",
    "definition"
  ];
  const differences = fields.flatMap((field) => {
    const leftValue = left[field]?.trim().toLowerCase();
    const rightValue = right[field]?.trim().toLowerCase();
    if (!leftValue || !rightValue || leftValue === rightValue) return [];
    return [`${field}: "${left[field]}" versus "${right[field]}"`];
  });
  return { sameContext: differences.length === 0, differences };
}
