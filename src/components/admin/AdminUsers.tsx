import { useMemo, useState } from "react";
import { Crown, Search, ShieldCheck, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PLANS } from "@contracts/plans";

const fmtDate = (d: string | Date) =>
  new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });

/** Foto do Google com fallback para a inicial (se a imagem falhar). */
function Avatar({ url, name }: { url: string | null; name: string }) {
  const [broken, setBroken] = useState(false);
  if (url && !broken) {
    return (
      <img
        src={url}
        alt=""
        className="h-9 w-9 rounded-full object-cover"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <div className="h-9 w-9 rounded-full bg-muted grid place-items-center text-sm font-bold text-muted-foreground" aria-hidden>
      {name.trim().charAt(0).toUpperCase() || <UserIcon className="h-4 w-4" />}
    </div>
  );
}

export default function AdminUsers() {
  const { user: me } = useAuth();
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.admin.listUsers.useQuery();
  const [q, setQ] = useState("");

  const update = trpc.admin.updateUser.useMutation({
    onSuccess: () => {
      toast.success("Usuário atualizado");
      utils.admin.listUsers.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data ?? []).filter(
      (u) => !t || (u.name ?? "").toLowerCase().includes(t) || (u.email ?? "").toLowerCase().includes(t),
    );
  }, [data, q]);

  const totals = useMemo(() => {
    const list = data ?? [];
    return {
      all: list.length,
      pro: list.filter((u) => u.plan === "pro").length,
      admins: list.filter((u) => u.role === "admin").length,
    };
  }, [data]);

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <p className="text-sm text-muted-foreground">
          {totals.all} usuário(s) · {totals.pro} PRO · {totals.admins} admin(s)
        </p>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Buscar por nome ou e-mail"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="mt-4 space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {rows.map((u) => {
            const isMe = u.id === me?.id;
            const limit = PLANS.free.maxGenerationsPerMonth;
            return (
              <li key={u.id} className="rounded-lg border bg-card p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Avatar url={u.avatar} name={u.name ?? u.email ?? "?"} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate flex items-center gap-1.5">
                      {u.name || "(sem nome)"}
                      {isMe && <span className="text-xs font-normal text-muted-foreground">(você)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  </div>
                  <div className="flex gap-2">
                    {u.role === "admin" ? (
                      <span className="inline-flex h-9 w-[120px] items-center justify-center gap-1 rounded-md border text-xs font-semibold text-amber-600 dark:text-amber-400">
                        <Crown className="h-3.5 w-3.5" /> Acesso total
                      </span>
                    ) : (
                    <Select
                      value={u.plan}
                      onValueChange={(v) => update.mutate({ id: u.id, plan: v as "free" | "pro" })}
                    >
                      <SelectTrigger className="w-[120px] h-9" aria-label="Plano">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="free">Gratuito</SelectItem>
                        <SelectItem value="pro">
                          <span className="inline-flex items-center gap-1">
                            <Crown className="h-3.5 w-3.5 text-amber-500" /> PRO
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    )}
                    <Select
                      value={u.role}
                      disabled={isMe}
                      onValueChange={(v) => update.mutate({ id: u.id, role: v as "user" | "admin" })}
                    >
                      <SelectTrigger className="w-[120px] h-9" aria-label="Permissão">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">Usuário</SelectItem>
                        <SelectItem value="admin">
                          <span className="inline-flex items-center gap-1">
                            <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Admin
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {u.subjects} matéria(s) · {u.files} arquivo(s) · {u.generationsThisMonth}
                  {u.plan === "free" && u.role !== "admin" ? `/${limit}` : ""} geração(ões) este mês ·
                  entrou em {fmtDate(u.createdAt)} · último acesso {fmtDate(u.lastSignInAt)}
                </p>
              </li>
            );
          })}
          {!rows.length && (
            <li className="text-sm text-muted-foreground py-6 text-center">Nenhum usuário encontrado.</li>
          )}
        </ul>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Admins têm acesso completo, sem limites de plano. Você não pode remover o seu próprio acesso de admin.
      </p>
    </div>
  );
}
