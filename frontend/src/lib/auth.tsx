import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { NAV_KEYS } from "./constants";
import type { AppUser, NavKey, RolePermissions, UserRole } from "@/types";

interface AuthState {
  session: Session | null;
  user: AppUser | null;
  role: UserRole;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateLocalUser: (patch: Partial<AppUser>) => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

function deriveUser(session: Session | null): AppUser | null {
  if (!session?.user) return null;
  const u = session.user;
  const appMeta = (u.app_metadata ?? {}) as Record<string, unknown>;
  const userMeta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const raw = appMeta.role;
  const role: UserRole =
    raw === "super_admin" || raw === "admin" || raw === "read_only" ? raw : "case_manager";
  return {
    id: u.id,
    email: u.email ?? "",
    full_name:
      (userMeta.full_name as string) || (u.email ? u.email.split("@")[0] : "User"),
    role,
    title: (userMeta.title as string) ?? null,
    phone: (userMeta.phone as string) ?? null,
    avatar_url: (userMeta.avatar_url as string) ?? null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(deriveUser(data.session));
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => {
      setSession(sess);
      setUser(deriveUser(sess));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      user,
      role: user?.role ?? "case_manager",
      loading,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message);
      },
      signOut: async () => {
        await supabase.auth.signOut();
        setSession(null);
        setUser(null);
      },
      updateLocalUser: (patch) => setUser((p) => (p ? { ...p, ...patch } : p)),
    }),
    [session, user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

// ---------------------------------------------------------------------------
// Effective permissions — the role_permissions matrix (migration 0003) with a
// hardcoded fallback so the app works before 0003 is applied.
// ---------------------------------------------------------------------------
const ALL_NAV = Object.fromEntries(NAV_KEYS.map((k) => [k, true])) as Record<NavKey, boolean>;

type EffPerms = Omit<RolePermissions, "role" | "updated_at" | "updated_by">;

export const PERMISSION_DEFAULTS: Record<UserRole, EffPerms> = {
  super_admin: {
    can_manage_users: true,
    can_edit_permissions: true,
    can_manage_staff: true,
    can_write: true,
    can_delete: true,
    can_export: true,
    can_import: true,
    nav: ALL_NAV,
  },
  admin: {
    can_manage_users: false,
    can_edit_permissions: false,
    can_manage_staff: true,
    can_write: true,
    can_delete: true,
    can_export: true,
    can_import: true,
    nav: ALL_NAV,
  },
  case_manager: {
    can_manage_users: false,
    can_edit_permissions: false,
    can_manage_staff: false,
    can_write: true,
    can_delete: false,
    can_export: true,
    can_import: true,
    nav: ALL_NAV,
  },
  read_only: {
    can_manage_users: false,
    can_edit_permissions: false,
    can_manage_staff: false,
    can_write: false,
    can_delete: false,
    can_export: false,
    can_import: false,
    nav: ALL_NAV,
  },
};

/** Read the whole matrix. Returns null (not an error) if 0003 isn't applied yet. */
export function useRolePermissions() {
  return useQuery({
    queryKey: ["role-permissions"],
    queryFn: async (): Promise<RolePermissions[] | null> => {
      const { data, error } = await supabase
        .from("role_permissions")
        .select("*")
        .order("role");
      if (error) return null;
      return (data ?? []) as RolePermissions[];
    },
    retry: false,
    staleTime: 60_000,
  });
}

export function useRole() {
  const { role } = useAuth();
  const { data: matrix } = useRolePermissions();

  const eff: EffPerms = useMemo(() => {
    const row = matrix?.find((r) => r.role === role);
    if (!row) return PERMISSION_DEFAULTS[role];
    return {
      can_manage_users: row.can_manage_users,
      can_edit_permissions: row.can_edit_permissions,
      can_manage_staff: row.can_manage_staff,
      can_write: row.can_write,
      can_delete: row.can_delete,
      can_export: row.can_export,
      can_import: row.can_import,
      nav: { ...ALL_NAV, ...row.nav },
    };
  }, [matrix, role]);

  return {
    role,
    isSuperAdmin: role === "super_admin",
    isAdmin: role === "admin" || role === "super_admin",
    isReadOnly: role === "read_only",
    canWrite: eff.can_write,
    canDelete: eff.can_delete,
    canExport: eff.can_export,
    canImport: eff.can_import,
    canManageStaff: eff.can_manage_staff,
    canManageUsers: eff.can_manage_users,
    canEditPermissions: eff.can_edit_permissions,
    nav: eff.nav,
    navAllowed: (k: NavKey) => eff.nav[k] !== false,
  };
}
