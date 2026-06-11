import type { User as IUser, UserRole, Language, AuthSession } from "../types";
import { deriveInitials } from "../lib/filters";

export class User implements IUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: UserRole;
  isVerified: boolean;
  isActive: boolean;
  language: Language;
  createdAt: string;
  updatedAt: string;

  constructor(data: IUser) {
    this.id          = data.id;
    this.email       = data.email.toLowerCase().trim();
    this.fullName    = data.fullName.trim();
    this.phone       = data.phone ?? null;
    this.role        = data.role;
    this.isVerified  = data.isVerified;
    this.isActive    = data.isActive;
    this.language    = data.language;
    this.createdAt   = data.createdAt;
    this.updatedAt   = data.updatedAt;
  }

  // ── Computed ──────────────────────────────────────────────────────────────

  get initials(): string {
    return deriveInitials(this.fullName);
  }

  get firstName(): string {
    return this.fullName.split(" ")[0];
  }

  get isOwner(): boolean {
    return this.role === "owner";
  }

  get isCashier(): boolean {
    return this.role === "cashier";
  }

  get canManageCashiers(): boolean {
    return this.isOwner;
  }

  get canViewReports(): boolean {
    return this.isOwner;
  }

  get canExportData(): boolean {
    return this.isOwner;
  }

  // ── Methods ───────────────────────────────────────────────────────────────

  /** What tabs this user can access */
  allowedTabs(): string[] {
    if (this.isOwner) return ["home", "sales", "cashiers", "reports"];
    return ["home", "sales"];
  }

  /** Serialize to plain object for storage / API */
  toJSON(): IUser {
    return {
      id:         this.id,
      email:      this.email,
      fullName:   this.fullName,
      phone:      this.phone,
      role:       this.role,
      isVerified: this.isVerified,
      isActive:   this.isActive,
      language:   this.language,
      createdAt:  this.createdAt,
      updatedAt:  this.updatedAt,
    };
  }

  // ── Static factories ──────────────────────────────────────────────────────

  static fromJSON(data: IUser): User {
    return new User(data);
  }

  static fromSession(session: AuthSession): User {
    return new User(session.user);
  }
}
