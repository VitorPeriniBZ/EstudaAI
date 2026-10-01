import { trpc } from "@/providers/trpc";

/** Plano, limites e uso do mês do usuário logado. */
export function usePlan() {
  const q = trpc.account.usage.useQuery(undefined, { staleTime: 30_000 });
  const d = q.data;
  const isPro = d?.plan === "pro";
  const filesLeft =
    d && d.limits.maxFiles !== null ? Math.max(0, d.limits.maxFiles - d.usage.files) : null;
  const generationsLeft =
    d && d.limits.maxGenerationsPerMonth !== null
      ? Math.max(0, d.limits.maxGenerationsPerMonth - d.usage.generations)
      : null;
  return { ...q, data: d, isPro, filesLeft, generationsLeft };
}
