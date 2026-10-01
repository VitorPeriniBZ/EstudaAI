import { Check, Crown, Lock } from "lucide-react";
import { PLANS } from "@contracts/plans";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const fmt = (n: number | null, unit: string) => (n === null ? "Sem limite" : `${n} ${unit}`);

const ROWS: { label: string; free: string; pro: string }[] = [
  { label: "Arquivos (PDF e imagens)", free: fmt(PLANS.free.maxFiles, "arquivos"), pro: fmt(PLANS.pro.maxFiles, "") },
  {
    label: "Gerações com IA por mês",
    free: fmt(PLANS.free.maxGenerationsPerMonth, "por mês"),
    pro: fmt(PLANS.pro.maxGenerationsPerMonth, ""),
  },
  { label: "Questões por quiz", free: `até ${PLANS.free.maxQuizQuestions}`, pro: `até ${PLANS.pro.maxQuizQuestions}` },
  { label: "Anotações digitadas", free: "Sem limite", pro: "Sem limite" },
  { label: "Chat de dúvidas", free: "Incluído", pro: "Incluído" },
];

export default function ProDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Crown className="h-5 w-5 text-amber-500" /> EstudaAí PRO
          </DialogTitle>
          <DialogDescription>
            Estude todas as matérias sem se preocupar com limites.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60">
              <tr>
                <th className="p-2.5 text-left font-semibold"></th>
                <th className="p-2.5 text-left font-semibold">Gratuito</th>
                <th className="p-2.5 text-left font-semibold text-amber-600 dark:text-amber-400">PRO</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.label} className="border-t">
                  <td className="p-2.5 text-muted-foreground">{r.label}</td>
                  <td className="p-2.5">{r.free}</td>
                  <td className="p-2.5 font-semibold">
                    <span className="inline-flex items-center gap-1">
                      <Check className="h-3.5 w-3.5 text-emerald-500" /> {r.pro}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <DialogFooter className="sm:justify-between gap-2">
          <p className="text-xs text-muted-foreground self-center">
            Pagamento online chegando em breve.
          </p>
          <Button disabled className="gap-2">
            <Lock className="h-4 w-4" /> Assinar o PRO — em breve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
