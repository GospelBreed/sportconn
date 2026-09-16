import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { createOutreach } from "@/lib/db";
import { useCampaigns, useOutreach } from "@/hooks/queries";
import { useRealtime } from "@/hooks/useRealtime";
import { useRole } from "@/lib/auth";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge, Button, Field, Input, Select } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/overlays";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { CHANNEL_META, OUTCOME_META } from "@/lib/constants";
import { formatRelative } from "@/lib/format";
import { LeadSelect } from "@/features/shared/LeadSelect";
import type { OutreachChannel, OutreachOutcome } from "@/types";

const CHANNELS: OutreachChannel[] = ["call", "whatsapp", "email", "meeting", "linkedin", "proposal", "demo", "site_visit", "investor_meeting", "sponsor_meeting", "other"];

export function ActivitiesPage() {
  const { canWrite } = useRole();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useOutreach(150);
  useRealtime("outreach", [["outreach"]]);

  const [channel, setChannel] = useState("");
  const [outcome, setOutcome] = useState("");
  const [logOpen, setLogOpen] = useState(false);

  const rows = useMemo(
    () =>
      (data ?? []).filter(
        (o) => (!channel || o.channel === channel) && (!outcome || o.outcome === outcome),
      ),
    [data, channel, outcome],
  );

  const stats = useMemo(() => {
    const all = data ?? [];
    return {
      total: all.length,
      replied: all.filter((o) => o.outcome === "replied").length,
      meetings: all.filter((o) => o.channel === "meeting" || o.channel === "investor_meeting" || o.channel === "sponsor_meeting").length,
    };
  }, [data]);

  const openRecord = (o: (typeof rows)[number]) => {
    if (o.lead_id) navigate(`/leads?focus=${o.lead_id}`);
    else if (o.facility_id) navigate(`/facilities/${o.facility_id}`);
    else if (o.captain_id) navigate(`/captains?focus=${o.captain_id}`);
  };

  return (
    <div className="p-5 sm:p-6">
      <PageHeader
        eyebrow="Activity"
        title="Activities"
        subtitle="Every call, email, WhatsApp, and meeting logged across every pipeline."
        actions={
          canWrite && (
            <Button onClick={() => setLogOpen(true)}>
              <Icon name="plus" size={16} /> Log activity
            </Button>
          )
        }
      />

      <div className="mt-5 grid grid-cols-3 gap-3">
        <Stat label="Total touches" value={stats.total} />
        <Stat label="Replies" value={stats.replied} />
        <Stat label="Meetings" value={stats.meetings} />
      </div>

      <div className="mt-5 flex gap-3">
        <Select value={channel} onChange={(e) => setChannel(e.target.value)} className="w-44">
          <option value="">All channels</option>
          {CHANNELS.map((c) => (
            <option key={c} value={c}>
              {CHANNEL_META[c].label}
            </option>
          ))}
        </Select>
        <Select value={outcome} onChange={(e) => setOutcome(e.target.value)} className="w-44">
          <option value="">All outcomes</option>
          {Object.entries(OUTCOME_META).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="mt-4 card-base overflow-hidden">
        {isLoading ? (
          <div className="p-4">
            <SkeletonRows rows={8} />
          </div>
        ) : isError ? (
          <ErrorState message="Could not load activities." onRetry={() => refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Icon name="mail" />} title="No activity logged" subtitle="Log the first touch to get started." />
        ) : (
          <div className="divide-y divide-line">
            {rows.map((o) => {
              const cm = CHANNEL_META[o.channel];
              const om = OUTCOME_META[o.outcome];
              return (
                <button
                  key={o.id}
                  onClick={() => openRecord(o)}
                  className="flex w-full items-center gap-3 p-3.5 text-left hover:bg-surface-2"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted">
                    <Icon name={cm.icon} size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{o.subject || cm.label}</p>
                    <p className="truncate text-xs text-muted">
                      {o.leads?.full_name ?? o.facilities?.name ?? o.captains?.full_name ?? "—"}
                      {o.leads?.company_name ? ` · ${o.leads.company_name}` : ""}
                      {o.campaigns?.name ? ` · ${o.campaigns.name}` : ""}
                    </p>
                  </div>
                  <span className="hidden shrink-0 text-xs text-muted sm:block">
                    {formatRelative(o.occurred_at)}
                  </span>
                  <Badge className={om.cls}>{om.label}</Badge>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <LogActivityModal open={logOpen} onClose={() => setLogOpen(false)} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card-base p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-xl font-bold text-ink">{value}</p>
    </div>
  );
}

function LogActivityModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: campaigns } = useCampaigns();
  const [leadId, setLeadId] = useState<string | null>(null);
  const [leadLabel, setLeadLabel] = useState("");
  const [channel, setChannel] = useState("call");
  const [outcome, setOutcome] = useState("completed");
  const [subject, setSubject] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!leadId) {
      toast.error("Pick a lead");
      return;
    }
    setSaving(true);
    try {
      await createOutreach({
        lead_id: leadId,
        channel: channel as OutreachChannel,
        outcome: outcome as OutreachOutcome,
        subject: subject.trim() || null,
        campaign_id: campaignId || null,
      });
      qc.invalidateQueries({ queryKey: ["outreach"] });
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success("Activity logged");
      setLeadId(null);
      setLeadLabel("");
      setSubject("");
      setCampaignId("");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not log");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Log activity">
      <div className="space-y-4">
        <Field label="Lead" required>
          <LeadSelect
            valueId={leadId}
            valueLabel={leadLabel}
            onSelect={(id, label) => {
              setLeadId(id);
              setLeadLabel(label);
            }}
            onClear={() => {
              setLeadId(null);
              setLeadLabel("");
            }}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Channel">
            <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {CHANNEL_META[c].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Outcome">
            <Select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
              {Object.entries(OUTCOME_META).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Subject / summary">
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <Field label="Campaign">
          <Select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
            <option value="">None</option>
            {campaigns?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving}>
            Log
          </Button>
        </div>
      </div>
    </Modal>
  );
}
