import {
  useSponsorPackages,
  useSponsorScorecard,
  useUpdateScorecardTarget,
  useUpdateSponsorPackage,
} from "@/hooks/queries";
import { useRole } from "@/lib/auth";
import { useToast } from "@/components/ui/Toast";
import { Input } from "@/components/ui/primitives";
import { ErrorState, SkeletonRows } from "@/components/ui/states";
import { formatMoney } from "@/lib/money";
import type { SponsorPackage } from "@/types";

/** Settings → Sponsor packages + 30-day scorecard targets (migration 0004). Management/admin edit; others read. */
export function SponsorSettings() {
  const { canApprove } = useRole();
  const toast = useToast();
  const { data: packages, isLoading, isError, refetch } = useSponsorPackages();
  const { data: scorecard } = useSponsorScorecard();
  const updatePkg = useUpdateSponsorPackage();
  const updateTarget = useUpdateScorecardTarget();

  const savePkg = (p: SponsorPackage, body: Partial<SponsorPackage>) =>
    updatePkg.mutate(
      { id: p.id, body },
      {
        onSuccess: () => toast.success(`${p.name} updated`),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
      },
    );

  const num = (v: string) => (v === "" ? null : Number(v));

  return (
    <section className="card-base p-5">
      <h3 className="text-sm font-semibold text-ink">Sponsor packages</h3>
      <p className="mb-4 text-xs text-muted">
        The offer menu. Set what each package costs to deliver (prizes, content, promotion, staff time, fees) so every deal shows
        its margin. {canApprove ? "" : "Only management or admins can change these."}
      </p>
      {isLoading ? (
        <SkeletonRows rows={5} />
      ) : isError ? (
        <ErrorState message="Could not load packages. Has migration 0004 been applied?" onRetry={() => refetch()} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="py-2 pr-3 font-semibold">Package</th>
                <th className="py-2 pr-3 font-semibold">List price</th>
                <th className="py-2 pr-3 font-semibold">Delivery cost</th>
                <th className="py-2 pr-3 font-semibold">Min. margin %</th>
                <th className="py-2 font-semibold">On sale</th>
              </tr>
            </thead>
            <tbody>
              {(packages ?? []).map((p) => (
                <tr key={p.id} className="border-b border-line/70 last:border-0">
                  <td className="py-2 pr-3">
                    <p className="font-medium text-ink">{p.name}</p>
                    {p.delivery_cost == null && <p className="text-xs text-warning">Delivery cost not set</p>}
                  </td>
                  <td className="py-2 pr-3">
                    {canApprove ? (
                      <Input
                        type="number"
                        min={0}
                        defaultValue={p.list_price}
                        aria-label={`${p.name} list price`}
                        className="h-8 w-32 text-xs"
                        onBlur={(e) => {
                          const n = num(e.target.value);
                          if (n === null) return toast.error("List price is required");
                          if (n !== p.list_price) savePkg(p, { list_price: n });
                        }}
                      />
                    ) : (
                      formatMoney(p.list_price, p.currency)
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {canApprove ? (
                      <Input
                        type="number"
                        min={0}
                        defaultValue={p.delivery_cost ?? ""}
                        placeholder="Not set"
                        aria-label={`${p.name} delivery cost`}
                        className="h-8 w-32 text-xs"
                        onBlur={(e) => {
                          const n = num(e.target.value);
                          if (n !== (p.delivery_cost ?? null)) savePkg(p, { delivery_cost: n });
                        }}
                      />
                    ) : p.delivery_cost == null ? (
                      "—"
                    ) : (
                      formatMoney(p.delivery_cost, p.currency)
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {canApprove ? (
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        defaultValue={p.min_margin_pct}
                        aria-label={`${p.name} minimum margin`}
                        className="h-8 w-20 text-xs"
                        onBlur={(e) => {
                          const n = num(e.target.value);
                          if (n === null || n < 0 || n > 100) return toast.error("Margin must be 0–100");
                          if (n !== p.min_margin_pct) savePkg(p, { min_margin_pct: Math.round(n) });
                        }}
                      />
                    ) : (
                      `${p.min_margin_pct}%`
                    )}
                  </td>
                  <td className="py-2">
                    <input
                      type="checkbox"
                      checked={p.is_active}
                      disabled={!canApprove}
                      onChange={(e) => savePkg(p, { is_active: e.target.checked })}
                      aria-label={`${p.name} on sale`}
                      className="h-4 w-4 accent-primary"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="mt-6 text-sm font-semibold text-ink">30-day scorecard targets</h3>
      <p className="mb-3 text-xs text-muted">Initial operating targets from the sponsorship SOP. Review them weekly; they are not a forecast.</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {(scorecard?.targets ?? []).map((t) => (
          <div key={t.metric} className="flex items-center justify-between gap-3 rounded-control border border-line px-3 py-2">
            <span className="text-sm text-body">{t.label}</span>
            <span className="flex items-center gap-1 text-xs text-muted">
              <Input
                type="number"
                min={0}
                defaultValue={t.target_min}
                disabled={!canApprove}
                aria-label={`${t.label} minimum`}
                className="h-8 w-16 text-xs"
                onBlur={(e) => {
                  const n = num(e.target.value);
                  if (n === null || n < 0) return toast.error("Target must be 0 or more");
                  if (n !== t.target_min)
                    updateTarget.mutate(
                      { metric: t.metric, body: { target_min: Math.round(n) } },
                      { onError: (err) => toast.error(err instanceof Error ? err.message : "Update failed") },
                    );
                }}
              />
              –
              <Input
                type="number"
                min={0}
                defaultValue={t.target_max ?? ""}
                placeholder="max"
                disabled={!canApprove}
                aria-label={`${t.label} maximum`}
                className="h-8 w-16 text-xs"
                onBlur={(e) => {
                  const n = num(e.target.value);
                  if (n !== null && n < t.target_min) return toast.error("Maximum can't be below the minimum");
                  if (n !== (t.target_max ?? null))
                    updateTarget.mutate(
                      { metric: t.metric, body: { target_max: n === null ? null : Math.round(n) } },
                      { onError: (err) => toast.error(err instanceof Error ? err.message : "Update failed") },
                    );
                }}
              />
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
