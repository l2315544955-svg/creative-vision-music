export type ProviderFamily = "suno" | "minimax";
export type RoleCode = "super_admin" | "org_owner" | "org_member" | "personal_user";

export interface MusicClip {
  id: string;
  clipId?: string;
  title: string;
  status: string;
  audioUrl?: string;
  imageUrl?: string;
  imageLargeUrl?: string;
  videoUrl?: string;
  prompt?: string;
  tags?: string;
  duration?: number;
  modelName?: string;
  majorModelVersion?: string;
  createdAt?: string;
}

export interface MusicTaskSnapshot {
  provider: ProviderFamily;
  taskId: string;
  action?: string;
  status: string;
  progress?: string;
  failReason?: string;
  submittedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  clips: MusicClip[];
}

export interface StoredTask {
  id: string;
  provider: ProviderFamily;
  title: string;
  modelCode?: string;
  modelLabel: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  type: "lyrics" | "music";
  remoteTaskId?: string;
  audioUrl?: string;
  coverUrl?: string;
  note?: string;
  failReason?: string;
  clips?: MusicClip[];
}

export interface MusicGenerationResponse {
  provider: ProviderFamily;
  taskId?: string;
  status?: string;
  audioUrl?: string;
  clips?: MusicClip[];
  task?: StoredTask;
  raw: unknown;
}

export interface WorkItem {
  id: string;
  taskId: string;
  clipId?: string;
  title: string;
  status: string;
  audioUrl?: string;
  imageUrl?: string;
  videoUrl?: string;
  duration?: number;
  provider: ProviderFamily;
  taskTitle: string;
  modelCode?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RuntimeStatus {
  configured: boolean;
  baseUrl: string;
  chatModel?: string;
}

export interface OrganizationSummary {
  id: string;
  code?: string;
  name: string;
  ownerUserId?: string;
  ownerDisplayName?: string;
  status: string;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AuthUser {
  id: string;
  accountKey: string;
  displayName: string;
  phone?: string;
  email?: string;
  status: string;
  roleCode: RoleCode;
  roleLabel: string;
  organizationId?: string;
  organizationName?: string;
  organizationCode?: string;
  parentUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PermissionSummary {
  canAccessConsole: boolean;
  canManageOrganizations: boolean;
  canManageMembers: boolean;
  canManageCredits: boolean;
  canCreateOrgOwner: boolean;
  canCreateOrgMember: boolean;
  canViewAllAccounts: boolean;
}

export interface CreditAccountSummary {
  accountId: string;
  ownerType: string;
  ownerId: string;
  balance: number;
  frozenBalance: number;
  availableBalance: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreditLedgerEntry {
  id: string;
  accountId: string;
  ownerType: string;
  ownerId: string;
  direction: string;
  amount: number;
  balanceAfter: number;
  frozenAfter: number;
  eventType: string;
  referenceType?: string;
  referenceId?: string;
  note?: string;
  createdAt: string;
}

export interface CreditPrecheck {
  account: CreditAccountSummary;
  pricingCode: string;
  pricingTitle: string;
  requiredCredits: number;
  sufficient: boolean;
  missingCredits: number;
  providerFamily: ProviderFamily;
}

export interface AuthSessionPayload {
  token: string;
  expiresAt: string;
  user: AuthUser;
  organization: OrganizationSummary | null;
  permissions: PermissionSummary;
  credits: CreditAccountSummary;
}

export interface AuthUserProfile {
  user: AuthUser;
  organization: OrganizationSummary | null;
  permissions: PermissionSummary;
}

export interface ManagedUserSummary extends AuthUser {
  credits: CreditAccountSummary;
}

export interface ConsoleBootstrapData {
  viewer: AuthUser;
  organization: OrganizationSummary | null;
  permissions: PermissionSummary;
  organizations: OrganizationSummary[];
  managedUsers: ManagedUserSummary[];
  summary: {
    organizationCount: number;
    managedUserCount: number;
    totalManagedCredits: number;
  };
}

export interface ConsoleOrganizationCreateResponse {
  organization: OrganizationSummary;
  owner: AuthUser;
  ownerCredits: CreditAccountSummary;
  console: ConsoleBootstrapData;
}

export interface ConsoleAccountCreateResponse {
  user: AuthUser;
  credits: CreditAccountSummary;
  console: ConsoleBootstrapData;
}

export interface ConsoleCreditAdjustResponse {
  user: AuthUser;
  credits: CreditAccountSummary;
  console: ConsoleBootstrapData;
}

export interface SunoVersion {
  code: string;
  label: string;
  tier: string;
}

export interface PricingItem {
  family: ProviderFamily | "suno";
  code: string;
  title: string;
  price: number;
  unit: string;
  groups: string[];
  notes: string;
}

export interface PackageItem {
  code: string;
  name: string;
  amount: number;
  credits: number;
  highlight: string;
  bonusCredits?: number;
  totalCredits?: number;
  popular?: boolean;
  bestFor?: string;
}

export interface BillingPolicy {
  currency: string;
  settlementMode: string;
  checkoutMode: string;
  customerMinTopup: number;
  upstreamMinTopup: number;
  channels: string[];
  notes: string[];
}

export interface BillingPreview {
  package: PackageItem;
  amount: number;
  credits: number;
  bonusCredits: number;
  totalCredits: number;
  settlementMode: string;
  pricePerCredit: number;
  estimatedGenerations: {
    sunoMusic: number;
    minimax15: number;
    minimax20: number;
  };
}

export interface BillingOrder {
  orderNo: string;
  status: string;
  packageCode: string;
  packageName: string;
  amount: number;
  totalCredits: number;
  checkoutMode: string;
  settlementMode: string;
  channels: string[];
  expiresAt: string;
  payUrl: string;
  instructions: string[];
}

export interface PaymentChannelRuntime {
  configured: boolean;
  appIdConfigured: boolean;
  privateKeyConfigured: boolean;
  publicKeyConfigured: boolean;
  notifyUrlConfigured: boolean;
  returnUrlConfigured: boolean;
  gateway: string;
  mode: "real" | "manual";
}

export interface PaymentRuntime {
  alipayPage: PaymentChannelRuntime;
}

export interface PaymentCheckoutSession {
  provider: string;
  openMode: "new_tab" | "redirect";
  checkoutUrl: string;
  order: PaymentOrderSnapshot;
}

export interface PaymentOrderSnapshot {
  orderNo: string;
  provider: string;
  packageCode: string;
  packageName: string;
  amount: number;
  totalCredits: number;
  status: string;
  tradeStatus?: string;
  tradeNo?: string;
  paymentMethod?: string;
  buyerId?: string;
  buyerPayAmount?: string;
  createdAt: string;
  expiresAt: string;
  paidAt?: string;
  updatedAt?: string;
}

export interface RoleBlueprint {
  code: string;
  label: string;
  capabilities: string[];
}

export interface OrganizationBlueprint {
  ownerRole: RoleBlueprint;
  memberRole: RoleBlueprint;
  launchScopes: string[];
}

export interface BootstrapResponse {
  supplier: string;
  runtime: RuntimeStatus;
  strategy: {
    primaryProvider: ProviderFamily;
    secondaryProvider: ProviderFamily;
    recommendedLaunchModels: string[];
    deferredModels: string[];
  };
  sunoVersions: SunoVersion[];
  pricingCatalog: PricingItem[];
  recommendedPackages: PackageItem[];
  billingPolicy: BillingPolicy;
  organizationBlueprint: OrganizationBlueprint;
  paymentRuntime: PaymentRuntime;
}
