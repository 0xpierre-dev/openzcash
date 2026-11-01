export function mapTallyResponse(input: {
  countA: number;
  countB: number;
  countC: number;
  countD: number;
  countE: number;
  totalConfirmed: number;
}) {
  return {
    totalConfirmed: input.totalConfirmed,
    options: {
      A: input.countA,
      B: input.countB,
      C: input.countC,
      D: input.countD,
      E: input.countE
    }
  };
}
