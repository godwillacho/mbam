// ─────────────────────────────────────────────────────────────────────────────
// tools/registry.ts
// Central registry of every tool available in the Mbam platform.
//
// PURPOSE:
//   Controls which tools are active for a given business account.
//   Each tool maps to a billing tier — free tools are always on,
//   billable tools require the business to have that tier enabled.
//
// HOW TO ADD A NEW TOOL:
//   1. Create src/tools/{tool-name}/ with index.ts, types, service, README
//   2. Add an entry to TOOL_REGISTRY below
//   3. The billing system reads this registry to know what to charge for
//
// RULE: No tool may import from another tool directly.
//       Tools communicate only through shared models in src/models/.
// ─────────────────────────────────────────────────────────────────────────────

/** The billing tier a tool belongs to */
export type ToolTier =
  | "core"      // always enabled, no charge
  | "standard"  // included in standard plan
  | "pro"       // pro plan only
  | "add-on";   // purchased separately regardless of plan

/** The current enabled state of a tool for a specific business */
export type ToolStatus = "enabled" | "disabled" | "locked";

/** A registered tool definition */
export interface ToolDefinition {
  /** Unique machine-readable ID — used as route key and billing reference */
  id: string;

  /** Human-readable name shown in the UI */
  name: string;

  /** Short description for the tools marketplace */
  description: string;

  /** Which billing tier this tool belongs to */
  tier: ToolTier;

  /** The nav tab icon (Tabler icon name) */
  icon: string;

  /** Which user roles can access this tool */
  allowedRoles: ("owner" | "cashier")[];

  /** Whether this tool is currently implemented (false = coming soon) */
  isImplemented: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRY
// Source of truth for all tools. Order here determines nav order.
// ─────────────────────────────────────────────────────────────────────────────

export const TOOL_REGISTRY: ToolDefinition[] = [
  // ── Core tools (always on, no charge) ──────────────────────────────────
  {
    id:             "record-sale",
    name:           "Record Sale",
    description:    "Record a new sale with line items and customer details.",
    tier:           "core",
    icon:           "ti-plus",
    allowedRoles:   ["owner", "cashier"],
    isImplemented:  true,
  },
  {
    id:             "transaction-history",
    name:           "Transaction History",
    description:    "View and search past sales records.",
    tier:           "core",
    icon:           "ti-receipt",
    allowedRoles:   ["owner", "cashier"],
    isImplemented:  true,
  },

  // ── Standard tools ──────────────────────────────────────────────────────
  {
    id:             "product-catalogue",
    name:           "Product Catalogue",
    description:    "Manage your item catalogue with autocomplete on sale entry.",
    tier:           "standard",
    icon:           "ti-shopping-bag",
    allowedRoles:   ["owner"],
    isImplemented:  false, // phase 2
  },
  {
    id:             "cashier-management",
    name:           "Cashier Management",
    description:    "Invite and manage cashier accounts for your business.",
    tier:           "standard",
    icon:           "ti-users",
    allowedRoles:   ["owner"],
    isImplemented:  true,
  },

  // ── Pro tools ───────────────────────────────────────────────────────────
  {
    id:             "reports",
    name:           "Reports",
    description:    "Revenue analytics, cashier performance, and trend charts.",
    tier:           "pro",
    icon:           "ti-chart-bar",
    allowedRoles:   ["owner"],
    isImplemented:  false, // phase 2
  },
  {
    id:             "stock-management",
    name:           "Stock Management",
    description:    "Track product inventory. Get low-stock alerts.",
    tier:           "pro",
    icon:           "ti-package",
    allowedRoles:   ["owner"],
    isImplemented:  false, // phase 3
  },

  // ── Add-on tools ────────────────────────────────────────────────────────
  {
    id:             "export",
    name:           "Data Export",
    description:    "Export transactions and reports to CSV or PDF.",
    tier:           "add-on",
    icon:           "ti-download",
    allowedRoles:   ["owner"],
    isImplemented:  false, // phase 2
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get a single tool definition by its ID.
 * Returns undefined if the tool does not exist in the registry.
 */
export function getTool(id: string): ToolDefinition | undefined {
  return TOOL_REGISTRY.find((t) => t.id === id);
}

/**
 * Get all tools accessible to a given user role.
 * Cashiers only see core tools assigned to them.
 * Owners see all tools.
 */
export function getToolsForRole(role: "owner" | "cashier"): ToolDefinition[] {
  return TOOL_REGISTRY.filter((t) => t.allowedRoles.includes(role));
}

/**
 * Given a list of tool IDs enabled for a business,
 * return which tools from the registry are active vs locked.
 *
 * Core tools are always enabled regardless of the enabled list.
 *
 * @param enabledToolIds - Tool IDs the business has access to (from API/billing)
 * @param role - The current user's role
 * @returns Each tool with its resolved status
 */
export function resolveToolStatuses(
  enabledToolIds: string[],
  role: "owner" | "cashier"
): { tool: ToolDefinition; status: ToolStatus }[] {
  return getToolsForRole(role).map((tool) => {
    // Core tools are always on
    if (tool.tier === "core") return { tool, status: "enabled" };

    // Not yet built tools are locked regardless of billing
    if (!tool.isImplemented) return { tool, status: "locked" };

    // Check if this business has the tool enabled
    const isEnabled = enabledToolIds.includes(tool.id);
    return { tool, status: isEnabled ? "enabled" : "disabled" };
  });
}

/**
 * Build the navigation tab list for the dashboard from active tools.
 * Only returns enabled tools that should appear as nav items.
 *
 * @param enabledToolIds - Tool IDs the business has paid for / has access to
 * @param role - The current user's role
 */
export function buildNavTabs(
  enabledToolIds: string[],
  role: "owner" | "cashier"
): { id: string; name: string; icon: string }[] {
  return resolveToolStatuses(enabledToolIds, role)
    .filter(({ status }) => status === "enabled")
    .map(({ tool }) => ({ id: tool.id, name: tool.name, icon: tool.icon }));
}
