import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import * as db from "@/lib/db";
import { ACTIVE_STAGES } from "@/lib/constants";
import { followupBucket, type FollowupBucket } from "@/lib/format";
import type {
  Campaign,
  Case,
  Lead,
  Property,
  Resident,
  RolePermissions,
  Task,
  UserRole,
} from "@/types";

// ======================= CASES =======================
export const casesKey = ["cases"] as const;

export function useCases() {
  return useQuery({ queryKey: casesKey, queryFn: db.listCases });
}

export function useCase(id: string | null) {
  return useQuery({
    queryKey: ["case", id],
    queryFn: () => db.getCase(id as string),
    enabled: !!id,
  });
}

export function useCreateCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Case>) => db.createCase(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: casesKey });
      qc.invalidateQueries({ queryKey: ["analytics-summary"] });
      qc.invalidateQueries({ queryKey: ["activities"] });
    },
  });
}

export function useUpdateCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Case> }) => db.updateCase(id, body),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: casesKey });
      qc.invalidateQueries({ queryKey: ["case", v.id] });
      qc.invalidateQueries({ queryKey: ["analytics-summary"] });
    },
  });
}

export function useDeleteCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => db.deleteCase(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: casesKey });
      qc.invalidateQueries({ queryKey: ["analytics-summary"] });
    },
  });
}

// ======================= FOLLOW-UPS (derived from cases) =======================
export interface FollowupItem {
  case: Case;
  bucket: Exclude<FollowupBucket, "none">;
}

export function useFollowups() {
  return useQuery({
    queryKey: casesKey,
    queryFn: db.listCases,
    select: (cases): FollowupItem[] =>
      cases
        .filter((c) => ACTIVE_STAGES.includes(c.stage) && c.next_follow_up_at)
        .map((c) => ({ case: c, bucket: followupBucket(c.next_follow_up_at) }))
        .filter((f): f is FollowupItem => f.bucket !== "none")
        .sort(
          (a, b) =>
            new Date(a.case.next_follow_up_at as string).getTime() -
            new Date(b.case.next_follow_up_at as string).getTime(),
        ),
  });
}

// ======================= RESIDENTS =======================
export function useResidents(filters: db.ResidentFilters = {}) {
  return useQuery({
    queryKey: ["residents", filters],
    queryFn: () => db.listResidents(filters),
  });
}

export function useResidentDetail(id: string | null) {
  return useQuery({
    queryKey: ["resident", id],
    queryFn: () => db.getResidentDetail(id as string),
    enabled: !!id,
  });
}

export function useCreateResident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Resident>) => db.createResident(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["residents"] });
      qc.invalidateQueries({ queryKey: ["analytics-summary"] });
      qc.invalidateQueries({ queryKey: ["activities"] });
    },
  });
}

export function useUpdateResident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Resident> }) =>
      db.updateResident(id, body),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["residents"] });
      qc.invalidateQueries({ queryKey: ["resident", v.id] });
      qc.invalidateQueries({ queryKey: ["analytics-summary"] });
    },
  });
}

export function useDeleteResident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => db.deleteResident(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["residents"] });
      qc.invalidateQueries({ queryKey: ["analytics-summary"] });
    },
  });
}

// ======================= PROPERTIES =======================
export function useProperties(q = "") {
  return useQuery({ queryKey: ["properties", q], queryFn: () => db.listProperties(q) });
}

export function usePropertyDetail(id: string | null) {
  return useQuery({
    queryKey: ["property", id],
    queryFn: () => db.getPropertyDetail(id as string),
    enabled: !!id,
  });
}

export function useCreateProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Property>) => db.createProperty(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["properties"] });
      qc.invalidateQueries({ queryKey: ["analytics-summary"] });
    },
  });
}

export function useUpdateProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Property> }) =>
      db.updateProperty(id, body),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["properties"] });
      qc.invalidateQueries({ queryKey: ["property", v.id] });
    },
  });
}

export function useDeleteProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => db.deleteProperty(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["properties"] }),
  });
}

// ======================= ACTIVITIES =======================
export function useActivityFeed(limit = 60) {
  return useQuery({ queryKey: ["activities", limit], queryFn: () => db.listActivities(limit) });
}

// ======================= NOTIFICATIONS =======================
export function useNotifications() {
  return useQuery({ queryKey: ["notifications"], queryFn: db.listNotifications });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => db.markNotificationRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => db.markAllNotificationsRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

// ======================= USERS =======================
export function useUsers() {
  return useQuery({ queryKey: ["users"], queryFn: db.listUsers });
}

// ======================= GOVERNANCE =======================
export function useAuditLog() {
  return useQuery({ queryKey: ["audit-log"], queryFn: () => db.listAuditLog(60), retry: false });
}

export function useUpdateRolePermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ role, patch }: { role: UserRole; patch: Partial<RolePermissions> }) =>
      db.updateRolePermissions(role, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["role-permissions"] }),
  });
}

export function useManageUsers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: db.ManageUsersAction) => db.manageUsers(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["audit-log"] });
    },
  });
}

// ======================= ANALYTICS =======================
export function useAnalytics() {
  return useQuery({
    queryKey: ["analytics-summary"],
    queryFn: db.getAnalyticsSummary,
    refetchInterval: 60_000,
  });
}

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: db.getDashboardSummary,
    refetchInterval: 60_000,
  });
}

// ======================= LEADS =======================
export const leadsKey = ["leads"] as const;

export function useLeads(filters: db.LeadFilters = {}) {
  return useQuery({ queryKey: ["leads", filters], queryFn: () => db.listLeads(filters) });
}

export function useLeadPipeline() {
  return useQuery({ queryKey: leadsKey, queryFn: () => db.listLeads() });
}

export function useLeadDetail(id: string | null) {
  return useQuery({
    queryKey: ["lead", id],
    queryFn: () => db.getLeadDetail(id as string),
    enabled: !!id,
  });
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Lead>) => db.createLead(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Lead> }) => db.updateLead(id, body),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead", v.id] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });
}

export function useDeleteLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => db.deleteLead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });
}

// ======================= TASKS =======================
export function useTasks(includeDone = true) {
  return useQuery({ queryKey: ["tasks", includeDone], queryFn: () => db.listTasks(includeDone) });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Task>) => db.createTask(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Task> }) => db.updateTask(id, body),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
      if (updated?.lead_id) qc.invalidateQueries({ queryKey: ["lead", updated.lead_id] });
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => db.deleteTask(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

// ======================= OUTREACH =======================
export function useOutreach(limit = 100) {
  return useQuery({ queryKey: ["outreach", limit], queryFn: () => db.listOutreach(limit) });
}

// ======================= CAMPAIGNS =======================
export function useCampaigns() {
  return useQuery({ queryKey: ["campaigns"], queryFn: db.listCampaigns });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Campaign>) => db.createCampaign(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaigns"] }),
  });
}

export function useUpdateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Campaign> }) =>
      db.updateCampaign(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaigns"] }),
  });
}

// ======================= ASSESSMENTS =======================
export function useAssessments() {
  return useQuery({ queryKey: ["assessments"], queryFn: db.listAssessments });
}
