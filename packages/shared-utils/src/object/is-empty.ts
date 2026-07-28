export function isEmptyObject(value: object): boolean {
  return Object.keys(value).length === 0;
}