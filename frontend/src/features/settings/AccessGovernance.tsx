import { useEffect, useState } from "react";
import { useAuth, useRole, useRolePermissions } from "@/lib/auth";
import {
  useAuditLog,
  useManageUsers,
  useUpdateRolePermissions,
  useUsers,
} from "@/hooks/queries";
import { useToast } from "@/components/ui/Toast";
import { Avatar, Badge, Button, Field, Input, Select } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { SkeletonRows } from "@/components/ui/states";
import { ConfirmDialog, Modal } from "@/components/ui/overlays";
import { cn } from "@/lib/cn";
import {
  NAV_KEYS,
  NAV_LABELS,
  PERMISSION_FLAGS,
  ROLE_BADGE,
  ROLE_LABEL,
} from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import type { AppUser, RolePermissions, UserRole } from "@/types";

const ASSIGNABLE_ROLES: UserRole[] = [
  "super_admin",
  "admin",
  "management",
  "business_development",
  "sales",
  "partnerships",
  "investor_relations",
  "marketing",
  "community_manager",
  "viewer",
];

export function AccessGovernance() {
  const { isAdmin, isSuperAdmin, canManageUsers, canEditPermissions } = useRole();
  if (!isAdmin) return null;

  return (
    <section className="space-y-5">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Icon name="settings" size={15} /> Access &amp; governance
        </h3>
        <p className="mt-0.5 text-xs text-muted">
          {isSuperAdmin
            ? "Create and remove users, assign roles, and tune what each role can do."
            : "Read-only — only a Super Admin can change users and permissions."}
        </p>
      </div>

      <UserManagement canManage={canManageUsers} />
      <PermissionMatrix canEdit={canEditPermissions} />
      <AuditLog />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
function UserManagement({ canManage }: { canManage: boolean }) {
  const { user: me } = useAuth();
  const { data: users, isLoading } = useUsers();
  const manage = useManageUsers();
  const toast = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [toDelete, setToDelete] = useState<AppUser | null>(null);

  const run = (payload: Parameters<typeof manage.mutate>[0], ok: string) =>
    manage.mutate(payload, {
      onSuccess: () => toast.success(ok),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Action failed"),
    });

  return (
    <div className="card-base p-5">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-ink">Users</h4>
        {canManage && (
          <Button size="sm" variant="secondary" onClick={() => setCreateOpen(true)}>
            <Icon name="plus" size={14} /> Create user
          </Button>
        )}
      </div>

      {isLoading ? (
        <SkeletonRows rows={4} />
      ) : (
        <div className="space-y-2">
          {(users ?? []).map((u) => {
            const self = u.id === me?.id;
            return (
              <div
                key={u.id}
                className="flex flex-col gap-2 rounded-control border border-line px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={u.full_name} size={34} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">
                      {u.full_name}
                      {self && <span className="ml-1.5 text-xs text-muted">(you)</span>}
                      {u.is_active === false && (
                        <span className="ml-1.5 rounded bg-danger/10 px-1 text-[10px] font-semibold text-danger">
                          disabled
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted">{u.email}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {canManage && !self ? (
                    <Select
                      value={u.role}
                      onChange={(e) =>
                        run(
                          { action: "set_role", user_id: u.id, role: e.target.value as UserRole },
                          "Role updated",
                        )
                      }
                      className="h-8 w-36 text-xs"
                    >
                      {ASSIGNABLE_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Badge className={ROLE_BADGE[u.role]}>{ROLE_LABEL[u.role]}</Badge>
                  )}
                  {canManage && !self && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          run(
                            { action: "set_active", user_id: u.id, active: u.is_active === false },
                            u.is_active === false ? "User enabled" : "User disabled",
                          )
                        }
                      >
                        {u.is_active === false ? "Enable" : "Disable"}
                      </Button>
                      <button
                        onClick={() => setToDelete(u)}
                        className="rounded p-1 text-muted hover:bg-line/60 hover:text-danger"
                        aria-label="Delete user"
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!canManage && (
        <p className="mt-3 text-xs text-muted">Only a Super Admin can create, disable, or remove users.</p>
      )}

      <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Delete user"
        message={`Permanently delete ${toDelete?.full_name} (${toDelete?.email})? Their sign-in is removed immediately. Records they created stay, unassigned.`}
        loading={manage.isPending}
        onConfirm={() =>
          toDelete &&
          manage.mutate(
            { action: "delete", user_id: toDelete.id },
            {
              onSuccess: () => {
                toast.success("User deleted");
                setToDelete(null);
              },
              onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
            },
          )
        }
      />
    </div>
  );
}

function CreateUserModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const manage = useManageUsers();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("business_development");

  useEffect(() => {
    if (open) {
      setEmail("");
      setName("");
      setPassword(randomPassword());
      setRole("business_development");
    }
  }, [open]);

  const submit = () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      toast.error("Enter a valid email");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    manage.mutate(
      { action: "create", email: email.trim(), password, full_name: name.trim() || undefined, role },
      {
        onSuccess: () => {
          toast.success("User created — share the temporary password securely");
          onClose();
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create user"),
      },
    );
  };

  return (
    <Modal open={open} onClose={onClose} title="Create user">
      <div className="space-y-4">
        <Field label="Email" required>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="new.hire@sportconn.com" autoFocus />
        </Field>
        <Field label="Full name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jordan Lee" />
        </Field>
        <Field label="Temporary password" hint="They can change it after first sign-in. Copy it before you save.">
          <div className="flex gap-2">
            <Input value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                navigator.clipboard?.writeText(password);
                toast.info("Password copied");
              }}
            >
              Copy
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPassword(randomPassword())} title="Regenerate">
              <Icon name="activity" size={13} />
            </Button>
          </div>
        </Field>
        <Field label="Role">
          <Select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={manage.isPending}>
            Create user
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function randomPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  let s = "";
  const arr = new Uint32Array(16);
  crypto.getRandomValues(arr);
  for (const n of arr) s += chars[n % chars.length];
  return s;
}

// ---------------------------------------------------------------------------
// Permission matrix
// ---------------------------------------------------------------------------
function PermissionMatrix({ canEdit }: { canEdit: boolean }) {
  const { data: matrix, isLoading } = useRolePermissions();
  const update = useUpdateRolePermissions();
  const toast = useToast();
  const [draft, setDraft] = useState<Record<string, RolePermissions>>({});

  useEffect(() => {
    if (matrix) {
      setDraft(
        Object.fromEntries(
          matrix.map((r) => [r.role, JSON.parse(JSON.stringify(r)) as RolePermissions]),
        ),
      );
    }
  }, [matrix]);

  if (isLoading) {
    return (
      <div className="card-base p-5">
        <SkeletonRows rows={4} />
      </div>
    );
  }
  if (!matrix) {
    return (
      <div className="card-base border-dashed p-5">
        <h4 className="text-sm font-semibold text-ink">Role permissions</h4>
        <p className="mt-1 text-xs text-muted">
          Apply migration <code>0003_admin_governance.sql</code> to enable the permission matrix.
        </p>
      </div>
    );
  }

  const roles = matrix.map((r) => r.role);

  const setFlag = (role: string, key: string, value: boolean) =>
    setDraft((d) => ({ ...d, [role]: { ...d[role], [key]: value } }));

  const setNav = (role: string, navKey: string, value: boolean) =>
    setDraft((d) => ({ ...d, [role]: { ...d[role], nav: { ...d[role].nav, [navKey]: value } } }));

  const save = (role: UserRole) => {
    const row = draft[role];
    if (!row) return;
    const patch: Partial<RolePermissions> = {
      can_write: row.can_write,
      can_delete: row.can_delete,
      can_import: row.can_import,
      can_export: row.can_export,
      can_manage_staff: row.can_manage_staff,
      can_manage_users: row.can_manage_users,
      can_edit_permissions: row.can_edit_permissions,
      nav: row.nav,
    };
    update.mutate(
      { role, patch },
      {
        onSuccess: () => toast.success(`${ROLE_LABEL[role]} permissions saved`),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
      },
    );
  };

  return (
    <div className="card-base p-5">
      <h4 className="mb-1 text-sm font-semibold text-ink">Role permissions</h4>
      <p className="mb-4 text-xs text-muted">
        UI access and capabilities per role. Deletes, writes, and imports are also enforced by the
        database — Super Admin and Admin always retain full write access.
      </p>

      <div className="space-y-4">
        {roles.map((role) => {
          const row = draft[role];
          if (!row) return null;
          const locked = role === "super_admin" || !canEdit;
          return (
            <div key={role} className="rounded-card border border-line p-4">
              <div className="mb-3 flex items-center justify-between">
                <Badge className={ROLE_BADGE[role]}>{ROLE_LABEL[role]}</Badge>
                {role === "super_admin" ? (
                  <span className="text-[11px] text-muted">Locked — full control</span>
                ) : (
                  canEdit && (
                    <Button size="sm" onClick={() => save(role)} loading={update.isPending}>
                      Save
                    </Button>
                  )
                )}
              </div>

              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                Capabilities
              </p>
              <div className="mb-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {PERMISSION_FLAGS.map((f) => (
                  <label
                    key={f.key}
                    className={cn(
                      "flex items-start gap-2 rounded-control px-2 py-1.5 text-xs",
                      locked ? "opacity-60" : "hover:bg-surface-2",
                    )}
                  >
                    <input
                      type="checkbox"
                      disabled={locked}
                      checked={Boolean((row as unknown as Record<string, boolean>)[f.key])}
                      onChange={(e) => setFlag(role, f.key, e.target.checked)}
                      className="mt-0.5 accent-primary"
                    />
                    <span>
                      <span className="font-medium text-body">{f.label}</span>
                      <span className="block text-[11px] text-muted">{f.hint}</span>
                    </span>
                  </label>
                ))}
              </div>

              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                Visible sections
              </p>
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                {NAV_KEYS.map((k) => (
                  <label
                    key={k}
                    className={cn(
                      "flex items-center gap-2 rounded-control px-2 py-1 text-xs",
                      locked ? "opacity-60" : "hover:bg-surface-2",
                    )}
                  >
                    <input
                      type="checkbox"
                      disabled={locked}
                      checked={row.nav[k] !== false}
                      onChange={(e) => setNav(role, k, e.target.checked)}
                      className="accent-primary"
                    />
                    <span className="text-body">{NAV_LABELS[k]}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------
const ACTION_LABEL: Record<string, string> = {
  "user.create": "Created user",
  "user.delete": "Deleted user",
  "user.set_role": "Changed role",
  "user.set_active": "Enabled/disabled user",
  "permissions.update": "Updated permissions",
};

function AuditLog() {
  const { data, isLoading } = useAuditLog();

  return (
    <div className="card-base p-5">
      <h4 className="mb-3 text-sm font-semibold text-ink">Audit log</h4>
      {isLoading ? (
        <SkeletonRows rows={3} />
      ) : !data || data.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted">
          No user-management activity yet.
        </p>
      ) : (
        <div className="divide-y divide-line">
          {data.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-3 py-2 text-xs">
              <div className="min-w-0">
                <span className="font-medium text-ink">{ACTION_LABEL[e.action] ?? e.action}</span>
                <span className="text-muted">
                  {" "}
                  {e.target_email ? `· ${e.target_email}` : ""}
                  {typeof e.detail?.role === "string" ? ` → ${ROLE_LABEL[e.detail.role as string] ?? e.detail.role}` : ""}
                </span>
                <span className="block text-[11px] text-muted">by {e.actor_email ?? "system"}</span>
              </div>
              <span className="shrink-0 text-muted">{formatDateTime(e.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
