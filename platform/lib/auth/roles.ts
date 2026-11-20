// Roles and permissions. Same permission names as the prototype (ux-redesign/prototype/core/store.js ROLES).
import { ROLE_VALUES } from "../db/schema";

export type Role = (typeof ROLE_VALUES)[number];
export type Perm = "price" | "contact" | "edit" | "verify" | "admin" | "allCampaigns";

export const PERMS: Record<Role, readonly Perm[]> = {
  admin: ["price", "contact", "edit", "verify", "admin", "allCampaigns"],
  manager: ["price", "contact", "edit", "verify", "allCampaigns"],
  planner: ["price", "contact", "edit", "verify"],
  viewer: [],
};

export const can = (role: Role, perm: Perm): boolean => PERMS[role].includes(perm);

// Employees tab "Role" cell → role. Unknown text gets the least privilege.
// Differs from PHP mk_role_text on purpose: "manager" is its own role in v2 (PHP folds it into planner).
export function roleFromText(raw: unknown): Role {
  const r = String(raw ?? "").trim().toLowerCase();
  if (r === "admin" || r === "owner") return "admin";
  if (r === "manager" || r === "quản lý" || r === "quan ly") return "manager";
  if (r === "planner" || r === "account" || r === "booker") return "planner";
  return "viewer";
}
