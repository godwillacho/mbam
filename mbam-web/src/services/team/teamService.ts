import { deleteJson, getJson, patchJson, postJson } from "../apiClient";

export interface TeamRole {
  id: string;
  code: string;
  name: string;
  description?: string;
  permissions: string[];
}

export interface TeamEmployee {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone?: string;
  role_id: string;
  role_code: string;
  role_name: string;
  business_account_id: string;
  business_id?: string;
  business_unit_id?: string;
  authorized_route_keys?: string[];
  status: "active" | "disabled";
  updated_at: string;
}

export interface TeamInvitation {
  id: string;
  email: string;
  role_id: string;
  role_code: string;
  role_name: string;
  business_account_id: string;
  business_id?: string;
  business_unit_id?: string;
  status: "pending";
  expires_at: string;
  created_at: string;
}

interface TeamBusiness {
  id: string;
  name: string;
}

interface TeamBusinessUnit {
  id: string;
  business_id: string;
  name: string;
}

interface DashboardOption {
  id: string;
  label: string;
  description: string;
  path: string;
  dashboard_type: string;
  route_key: string | null;
  is_baseline: boolean;
}

export interface DashboardProfile {
  membership_id: string;
  user_id: string;
  role_code: string;
  role_name: string;
  scope_level: "master" | "business" | "unit";
  scope_label: string;
  base_dashboard_id: string;
  permissions: string[];
  dashboards: DashboardOption[];
}

export interface TeamWorkspace {
  members: TeamEmployee[];
  invitations: TeamInvitation[];
  roles: TeamRole[];
  businesses: TeamBusiness[];
  business_units: TeamBusinessUnit[];
  dashboard_profiles: DashboardProfile[];
  authorization_version: number;
}

export interface InviteEmployeeInput {
  email: string;
  role_id: string;
  business_id?: string;
  business_unit_id?: string;
}

export interface InvitationDetails {
  id: string;
  email: string;
  role_name: string;
  business_name?: string;
  business_unit_name?: string;
  expires_at: string;
  status: string;
}

export interface KeycloakSyncStatus {
  membership_id: string;
  status: "pending" | "processing" | "succeeded" | "failed" | "superseded";
  attempts: number;
  last_error?: string;
  updated_at: string;
}

export async function loadTeamWorkspace(): Promise<TeamWorkspace> {
  return getJson<TeamWorkspace>("/api/v1/team-members");
}

export async function loadKeycloakSyncStatuses(): Promise<KeycloakSyncStatus[]> {
  return getJson<KeycloakSyncStatus[]>("/api/v1/keycloak-sync");
}

export async function inviteEmployee(payload: InviteEmployeeInput): Promise<{
  invitation: TeamInvitation;
  invite_url: string;
}> {
  return postJson("/api/v1/invites", payload);
}

export async function updateEmployee(
  membershipId: string,
  payload: {
    role_id?: string;
    custom_permissions?: string[];
    business_id?: string | null;
    business_unit_id?: string | null;
    status?: "active" | "disabled";
  },
): Promise<TeamEmployee> {
  return patchJson(`/api/v1/team-members/${membershipId}`, payload);
}

export async function disableEmployee(
  membershipId: string,
): Promise<TeamEmployee> {
  return deleteJson(`/api/v1/team-members/${membershipId}`);
}

export async function getInvitationDetails(
  token: string,
): Promise<InvitationDetails> {
  return postJson("/api/v1/invites/details", { token });
}

export async function acceptInvitation(token: string): Promise<TeamEmployee> {
  return postJson("/api/v1/invites/accept", { token });
}

export async function registerInvitation(
  token: string,
  fullName: string,
  password: string,
): Promise<void> {
  await postJson("/api/v1/invites/register", {
    token,
    full_name: fullName,
    password,
  });
}
