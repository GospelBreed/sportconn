import { useEffect, useState } from "react";
import { useCampaigns, useCreateCampaign, useUpdateCampaign, useUsers } from "@/hooks/queries";
import { useRole } from "@/lib/auth";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge, Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/overlays";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { CAMPAIGN_CHANNEL_LABEL, CAMPAIGN_STATUS_META, CAMPAIGN_TYPE_LABEL, CAMPAIGN_TYPES } from "@/lib/constants";
import { formatCompactMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import type { CampaignChannel, CampaignStatus, CampaignType } from "@/types";

const STATUSES: CampaignStatus[] = ["draft", "active", "paused", "completed", "cancelled"];
const CHANNELS: CampaignChannel[] = ["email", "linkedin", "event", "multi"];

export function CampaignsPage() {
  const { canWrite } = useRole();
  const { data, isLoading, isError, refetch } = useCampaigns();
  const update = useUpdateCampaign();
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="p-5 sm:p-6">
      <PageHeader
        eyebrow="Growth"
        title="Campaigns"
        subtitle="Sponsor outreach, facility acquisition, user growth, and captain recruitment programs."
        actions={
          canWrite && (
            <Button onClick={() => setAddOpen(true)}>
              <Icon name="plus" size={16} /> New campaign
            </Button>
          )
        }
      />

      <div className="mt-5">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-48 rounded-card" />
            ))}
          </div>
        ) : isError ? (
          <ErrorState message="Could not load campaigns." onRetry={() => refetch()} />
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={<Icon name="flag" />}
            title="No campaigns yet"
            subtitle="Create your first growth campaign."
            action={canWrite && <Button onClick={() => setAddOpen(true)}><Icon name="plus" size={16} /> New campaign</Button>}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.map((c) => {
              const sm = CAMPAIGN_STATUS_META[c.status];
              const hasUserTarget = (c.target_users ?? 0) > 0;
              const progress = hasUserTarget ? Math.min(100, Math.round((c.actual_users / (c.target_users as number)) * 100)) : 0;
              const replyRate = c.sent_count ? Math.round((c.reply_count / c.sent_count) * 100) : 0;
              return (
                <div key={c.id} className="card-base flex flex-col p-5">
                  <div className="flex items-start justify-between gap-2">
                    <Badge className="bg-line text-muted">{CAMPAIGN_TYPE_LABEL[c.campaign_type]}</Badge>
                    {canWrite ? (
                      <Select
                        value={c.status}
                        onChange={(e) =>
                          update.mutate(
                            { id: c.id, body: { status: e.target.value as CampaignStatus } },
                            { onError: (err) => toast.error(err instanceof Error ? err.message : "Failed") },
                          )
                        }
                        className="h-7 w-28 text-xs"
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {CAMPAIGN_STATUS_META[s].label}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Badge className={sm.cls} dot={sm.dot}>
                        {sm.label}
                      </Badge>
                    )}
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-ink">{c.name}</h3>
                  {c.objective && <p className="mt-1 text-xs text-muted">{c.objective}</p>}
                  {c.target_audience && <p className="mt-1 text-[11px] text-muted">Audience: {c.target_audience}</p>}
                  {c.location && <p className="text-[11px] text-muted">{c.location}</p>}

                  {hasUserTarget ? (
                    <div className="mt-4">
                      <div className="mb-1 flex justify-between text-[11px] text-muted">
                        <span>{c.actual_users} / {c.target_users} users</span>
                        <span>{progress}%</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                      <Metric label="Sent" value={c.sent_count} />
                      <Metric label="Replies" value={c.reply_count} />
                      <Metric label="Meetings" value={c.meeting_count} />
                    </div>
                  )}
                  {!hasUserTarget && (
                    <div className="mt-3">
                      <div className="mb-1 flex justify-between text-[11px] text-muted">
                        <span>Reply rate</span>
                        <span>{replyRate}%</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, replyRate)}%` }} />
                      </div>
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
                    <span>{c.start_date ? `Started ${formatDate(c.start_date)}` : "Not started"}</span>
                    {(c.budget || c.cost) && <span>{formatCompactMoney(c.cost ?? c.budget)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AddCampaignModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-control bg-surface-2 py-2">
      <p className="text-sm font-semibold text-ink">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
    </div>
  );
}

function AddCampaignModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateCampaign();
  const { data: users } = useUsers();
  const toast = useToast();
  const [name, setName] = useState("");
  const [campaignType, setCampaignType] = useState<CampaignType>("other");
  const [channel, setChannel] = useState<CampaignChannel>("email");
  const [objective, setObjective] = useState("");
  const [audience, setAudience] = useState("");
  const [location, setLocation] = useState("");
  const [start, setStart] = useState("");
  const [targetUsers, setTargetUsers] = useState("");
  const [budget, setBudget] = useState("");
  const [owner, setOwner] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
      setCampaignType("other");
      setChannel("email");
      setObjective("");
      setAudience("");
      setLocation("");
      setStart("");
      setTargetUsers("");
      setBudget("");
      setOwner("");
    }
  }, [open]);

  const submit = () => {
    if (!name.trim()) {
      toast.error("Campaign name is required");
      return;
    }
    create.mutate(
      {
        name: name.trim(),
        campaign_type: campaignType,
        channel,
        objective: objective.trim() || null,
        target_audience: audience.trim() || null,
        location: location.trim() || null,
        start_date: start || null,
        target_users: targetUsers ? Number(targetUsers) : null,
        budget: budget ? Number(budget) : null,
        owner: owner || null,
      },
      {
        onSuccess: () => {
          toast.success("Campaign created");
          onClose();
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create"),
      },
    );
  };

  return (
    <Modal open={open} onClose={onClose} title="New campaign">
      <div className="space-y-4">
        <Field label="Name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Lekki Pick-Up Game" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Campaign type">
            <Select value={campaignType} onChange={(e) => setCampaignType(e.target.value as CampaignType)}>
              {CAMPAIGN_TYPES.map((t) => (
                <option key={t} value={t}>
                  {CAMPAIGN_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Channel">
            <Select value={channel} onChange={(e) => setChannel(e.target.value as CampaignChannel)}>
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {CAMPAIGN_CHANNEL_LABEL[c]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Objective">
          <Input value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Recruit 200 active players" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Target audience">
            <Textarea value={audience} onChange={(e) => setAudience(e.target.value)} className="min-h-[60px]" />
          </Field>
          <Field label="Location">
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Lekki, Lagos" />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Start date">
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Target users">
            <Input type="number" min={0} value={targetUsers} onChange={(e) => setTargetUsers(e.target.value)} placeholder="200" />
          </Field>
          <Field label="Budget">
            <Input type="number" min={0} value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="500000" />
          </Field>
        </div>
        <Field label="Owner">
          <Select value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">Unassigned</option>
            {users?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending}>
            Create
          </Button>
        </div>
      </div>
    </Modal>
  );
}
