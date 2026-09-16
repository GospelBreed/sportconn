import { useEffect, useState } from "react";
import { useCampaigns, useCreateCampaign, useUpdateCampaign } from "@/hooks/queries";
import { useRole } from "@/lib/auth";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge, Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/overlays";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { CAMPAIGN_CHANNEL_LABEL, CAMPAIGN_STATUS_META } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import type { CampaignChannel, CampaignStatus } from "@/types";

const STATUSES: CampaignStatus[] = ["draft", "active", "paused", "completed"];
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
        subtitle="Multi-channel outreach programs and their performance."
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
              <div key={i} className="skeleton h-44 rounded-card" />
            ))}
          </div>
        ) : isError ? (
          <ErrorState message="Could not load campaigns." onRetry={() => refetch()} />
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={<Icon name="flag" />}
            title="No campaigns yet"
            subtitle="Create your first outreach campaign."
            action={canWrite && <Button onClick={() => setAddOpen(true)}><Icon name="plus" size={16} /> New campaign</Button>}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.map((c) => {
              const sm = CAMPAIGN_STATUS_META[c.status];
              const replyRate = c.sent_count ? Math.round((c.reply_count / c.sent_count) * 100) : 0;
              return (
                <div key={c.id} className="card-base flex flex-col p-5">
                  <div className="flex items-start justify-between">
                    <Badge className="bg-line text-muted">{CAMPAIGN_CHANNEL_LABEL[c.channel]}</Badge>
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
                  {c.goal && <p className="mt-1 text-xs text-muted">{c.goal}</p>}
                  {c.target_segment && (
                    <p className="mt-1 text-[11px] text-muted">Segment: {c.target_segment}</p>
                  )}
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <Metric label="Sent" value={c.sent_count} />
                    <Metric label="Replies" value={c.reply_count} />
                    <Metric label="Meetings" value={c.meeting_count} />
                  </div>
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-[11px] text-muted">
                      <span>Reply rate</span>
                      <span>{replyRate}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, replyRate)}%` }} />
                    </div>
                  </div>
                  <p className="mt-3 text-[11px] text-muted">
                    {c.start_date ? `Started ${formatDate(c.start_date)}` : "Not started"}
                  </p>
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
  const toast = useToast();
  const [name, setName] = useState("");
  const [channel, setChannel] = useState("email");
  const [goal, setGoal] = useState("");
  const [segment, setSegment] = useState("");
  const [start, setStart] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
      setChannel("email");
      setGoal("");
      setSegment("");
      setStart("");
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
        channel: channel as CampaignChannel,
        goal: goal.trim() || null,
        target_segment: segment.trim() || null,
        start_date: start || null,
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
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Q4 DFW Community Engagement Push" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Channel">
            <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {CAMPAIGN_CHANNEL_LABEL[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Start date">
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
        </div>
        <Field label="Goal">
          <Input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Book 15 discovery calls" />
        </Field>
        <Field label="Target segment">
          <Textarea value={segment} onChange={(e) => setSegment(e.target.value)} placeholder="DFW · Class A · 300+ units" className="min-h-[60px]" />
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
