/** "1 questão" / "3 questões" — sempre use isto para número + palavra. */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
