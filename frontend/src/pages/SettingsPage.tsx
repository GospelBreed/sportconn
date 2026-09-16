import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { updateUser } from "@/lib/db";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/layout/PageHeader";
import { Avatar, Badge, Button, Field, Input } from "@/components/ui/primitives";
import { ROLE_BADGE, ROLE_LABEL } from "@/lib/constants";
import { AccessGovernance } from "@/features/settings/AccessGovernance";
import { PipelineSettings } from "@/features/settings/PipelineSettings";

export function SettingsPage() {
  const { user, updateLocalUser } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();

  const [name, setName] = useState(user?.full_name ?? "");
  const [title, setTitle] = useState(user?.title ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [saving, setSaving] = useState(false);

  const saveProfile = async () => {
    if (!name.trim()) {
      toast.error("Name cannot be empty");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { full_name: name.trim(), title: title.trim(), phone: phone.trim() },
      });
      if (error) throw error;
      if (user)
        await updateUser(user.id, {
          full_name: name.trim(),
          title: title.trim(),
          phone: phone.trim(),
        });
      updateLocalUser({ full_name: name.trim(), title: title.trim(), phone: phone.trim() });
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success("Profile updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-5 sm:p-6">
      <PageHeader eyebrow="Workspace" title="Settings" subtitle="Your profile, the team, and platform access." />

      <div className="mt-5 max-w-2xl space-y-5">
        <section className="card-base p-5">
          <h3 className="mb-4 text-sm font-semibold text-ink">Profile</h3>
          <div className="flex items-start gap-4">
            <Avatar name={name || user?.full_name} size={56} />
            <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Display name">
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Job title">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Business Development Manager" />
              </Field>
              <Field label="Phone">
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 010-0000" />
              </Field>
              <div className="flex items-end">
                <p className="text-xs text-muted">{user?.email}</p>
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <Badge className={ROLE_BADGE[user?.role ?? "business_development"]}>
              {ROLE_LABEL[user?.role ?? "business_development"]}
            </Badge>
            <Button onClick={saveProfile} loading={saving}>
              Save profile
            </Button>
          </div>
        </section>

        <PipelineSettings />
        <AccessGovernance />
      </div>
    </div>
  );
}
