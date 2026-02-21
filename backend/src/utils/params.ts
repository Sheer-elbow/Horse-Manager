/** Safely extract a route param as a string (Express v5 types). */
export function param(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0];
  return value || '';
}
