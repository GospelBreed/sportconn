import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import * as db from "@/lib/db";
import { followupBucket, type FollowupBucket } from "@/lib/format";
import type {
  Campaign,
  Captain,
  Facility,
  Lead,
  Outreach,
  PipelineKey,
  PipelineStageDef,
  RolePermissions,
  Task,
  UserRole,
} from "@/types";

// ======================= PIPELINES / STAGES =======================
export function usePipelines() {
  return useQuery({ queryKey: ["pipelines"], queryFn: db.listPipelines, staleTime: 5 * 60_000 });
}

export function usePipelineStages(pipeline?: PipelineKey) {
  return useQuery({
    queryKey: ["pipeline-stages", pipeline ?? "all"],
    queryFn: () => db.listPipelineStages(pipeline),
    staleTime: 5 * 60_000,
  });
}

export function useCreatePipelineStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<PipelineStageDef>) => db.createPipelineStage(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeline-stages"] }),
  });
}

export function useUpdatePipelineStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<PipelineStageDef> }) =>
      db.updatePipelineStage(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeline-stages"] }),
  });
}

export function useDeletePipelineStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => db.deletePipelineStage(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeline-stages"] }),
  });
}

// ======================= LEADS (Sponsor/Investor/Partnership/User Acq.) =======================
export const leadsKey = ["leads"] as const;

export function useLeads(filters: db.LeadFilters = {}) {
  return useQuery({ queryKey: ["leads", filters], queryFn: () => db.listLeads(filters) });
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
      qc.invalidateQueries({ queryKey: ["pipeline-metrics"] });
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
      qc.invalidateQueries({ queryKey: ["pipeline-metrics"] });
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

// ======================= FACILITIES =======================
export function useFacilities(filters: db.FacilityFilters = {}) {
  return useQuery({ queryKey: ["facilities", filters], queryFn: () => db.listFacilities(filters) });
}

export function useFacilityDetail(id: string | null) {
  return useQuery({
    queryKey: ["facility", id],
    queryFn: () => db.getFacilityDetail(id as string),
    enabled: !!id,
  });
}

export function useCreateFacility() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Facility>) => db.createFacility(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["facilities"] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });
}

export function useUpdateFacility() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Facility> }) => db.updateFacility(id, body),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["facilities"] });
      qc.invalidateQueries({ queryKey: ["facility", v.id] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });
}

export function useDeleteFacility() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => db.deleteFacility(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["facilities"] }),
  });
}

// ======================= CAPTAINS & COMMUNITIES =======================
export function useCaptains(filters: db.CaptainFilters = {}) {
  return useQuery({ queryKey: ["captains", filters], queryFn: () => db.listCaptains(filters) });
}

export function useCaptainDetail(id: string | null) {
  return useQuery({
    queryKey: ["captain", id],
    queryFn: () => db.getCaptainDetail(id as string),
    enabled: !!id,
  });
}

export function useCreateCaptain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Captain>) => db.createCaptain(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["captains"] }),
  });
}

export function useUpdateCaptain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Captain> }) => db.updateCaptain(id, body),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["captains"] });
      qc.invalidateQueries({ queryKey: ["captain", v.id] });
    },
  });
}

export function useDeleteCaptain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => db.deleteCaptain(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["captains"] }),
  });
}

// ======================= FOLLOW-UPS (derived from leads + facilities) =======================
export interface FollowupItem {
  kind: "lead" | "facility";
  record: Lead | Facility;
  bucket: Exclude<FollowupBucket, "none">;
}

export function useFollowups() {
  const leadsQ = useLeads();
  const facilitiesQ = useFacilities();
  const raw: { kind: "lead" | "facility"; record: Lead | Facility; bucket: FollowupBucket }[] = [
    ...(leadsQ.data ?? [])
      .filter((l) => l.status === "open" && l.next_follow_up_at)
      .map((l) => ({ kind: "lead" as const, record: l as Lead | Facility, bucket: followupBucket(l.next_follow_up_at) })),
    ...(facilitiesQ.data ?? [])
      .filter((f) => f.status === "open" && f.next_follow_up_at)
      .map((f) => ({ kind: "facility" as const, record: f as Lead | Facility, bucket: followupBucket(f.next_follow_up_at) })),
  ];
  const items: FollowupItem[] = raw
    .filter((f): f is FollowupItem => f.bucket !== "none")
    .sort(
      (a, b) =>
        new Date(a.record.next_follow_up_at as string).getTime() -
        new Date(b.record.next_follow_up_at as string).getTime(),
    );
  return {
    data: items,
    isLoading: leadsQ.isLoading || facilitiesQ.isLoading,
    isError: leadsQ.isError || facilitiesQ.isError,
  };
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

// ======================= DASHBOARD / REPORTING =======================
export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: db.getDashboardSummary,
    refetchInterval: 60_000,
  });
}

export function usePipelineMetrics(pipeline?: string) {
  return useQuery({
    queryKey: ["pipeline-metrics", pipeline ?? "all"],
    queryFn: () => db.getPipelineMetrics(pipeline),
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
      if (updated?.facility_id) qc.invalidateQueries({ queryKey: ["facility", updated.facility_id] });
      if (updated?.captain_id) qc.invalidateQueries({ queryKey: ["captain", updated.captain_id] });
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

export function useCreateOutreach() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Outreach>) => db.createOutreach(body),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["outreach"] });
      qc.invalidateQueries({ queryKey: ["activities"] });
      if (created?.lead_id) qc.invalidateQueries({ queryKey: ["lead", created.lead_id] });
      if (created?.facility_id) qc.invalidateQueries({ queryKey: ["facility", created.facility_id] });
      if (created?.captain_id) qc.invalidateQueries({ queryKey: ["captain", created.captain_id] });
    },
  });
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

export function useDeleteCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => db.deleteCampaign(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaigns"] }),
  });
}
