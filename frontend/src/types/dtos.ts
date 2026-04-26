export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export type AdminRole = 'super_admin' | 'support' | 'ops_analyst';
export type ThreadStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type ThreadPriority = 'low' | 'medium' | 'high' | 'urgent';
export type MessageDirection = 'inbound' | 'outbound';
export type RideStatus = 'handoff_opened' | 'handoff_failed' | 'ride_confirmed' | 'ride_not_taken';

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: AdminRole;
  active?: boolean;
  mustChangePassword?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
  avatar?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  rememberMe: boolean;
}

export interface AuthPayload {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
  admin: AdminUser;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface LogoutResponse {
  loggedOut: boolean;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface UpdateMeRequest {
  fullName: string;
}

export interface MeResponse {
  admin: AdminUser;
}

export interface AdminUsersResponse {
  items: AdminUser[];
}

export interface CreateAdminUserRequest {
  email: string;
  fullName: string;
  role: AdminRole;
  password?: string;
}

export interface AdminUserActionResponse {
  admin: AdminUser;
  tempPassword?: string;
  emailSent?: boolean;
  message?: string;
}

export interface UpdateAdminUserRequest {
  fullName?: string;
  role?: AdminRole;
  active?: boolean;
}

export interface MobileUserItem {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: string;
  city: string;
  district: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  lastSeenAt: string | null;
  status: 'active' | 'inactive';
  lastRideStatus: string;
  lastRideAt: string | null;
  openSupportThreads: number;
  createdAt: string;
}

export interface MobileUsersResponse {
  items: MobileUserItem[];
}

export interface TrafficSummary {
  searches: number;
  handoffAttempts: number;
  handoffSuccess: number;
  confirmedRides: number;
}

export interface TrafficBucket {
  bucket: string;
  searches: number;
  handoffAttempts: number;
  handoffSuccess: number;
  confirmedRides: number;
}

export interface ProviderTrafficBreakdown {
  provider: string;
  searches: number;
  handoffAttempts: number;
  confirmedRides: number;
  conversionRate: number;
}

export interface TrafficMetricsResponse {
  summary: TrafficSummary;
  timeseries: TrafficBucket[];
  providerBreakdown: ProviderTrafficBreakdown[];
}

export interface TrafficMetricsQuery {
  from?: string;
  to?: string;
  provider?: string;
  city?: string;
  rideType?: string;
}

export interface HotspotTile {
  tileKey: string;
  city: string;
  center: { lat: number; lng: number };
  /** Ride snapshots in tile (7d rollup) — "demand" / search volume. */
  demandCount: number;
  /** Completed rides in tile (status ride_confirmed). */
  confirmedRides: number;
  avgEtaMin: number;
  successRate: number;
  /** 0–100 relative to max tile in this window (for bar / intensity). */
  demandIndex: number;
  /** 0–100 relative to max confirmed in this window (Supply view). */
  supplyScore: number;
}

export interface HotspotsSummary {
  totalRides: number;
  totalConfirmed: number;
  avgSuccessRate: number;
  tileCount: number;
}

export interface HotspotsResponse {
  windowStart: string | null;
  summary: HotspotsSummary;
  tiles: HotspotTile[];
}

export interface HotspotsQuery {
  from?: string;
  to?: string;
  city?: string;
  zoom?: number;
}

export interface RideLogItem {
  id: string;
  userId: string;
  provider: string;
  rideType: string;
  carAc: boolean;
  pickup: string;
  destination: string;
  pickupCoords: { latitude: number; longitude: number };
  destinationCoords: { latitude: number; longitude: number };
  estimatedFare: number;
  status: RideStatus;
  redirectSucceeded: boolean;
  createdAt: string;
  userConfirmedAt: string | null;
}

export interface RideLogsResponse {
  items: RideLogItem[];
  nextCursor: string | null;
}

export interface RideLogsQuery {
  cursor?: string;
  limit?: number;
  provider?: string;
  status?: RideStatus;
  q?: string;
}

export interface SupportThreadItem {
  id: string;
  subject: string;
  status: ThreadStatus;
  priority: ThreadPriority;
  source: 'in_app' | 'email';
  customer: {
    userId: string;
    name: string;
    email: string;
  };
  assignee: {
    adminId: string;
    name: string;
  } | null;
  lastMessageAt: string;
  createdAt: string;
}

export interface SupportThreadsResponse {
  items: SupportThreadItem[];
  nextCursor: string | null;
}

export interface SupportThreadsQuery {
  cursor?: string;
  limit?: number;
  status?: ThreadStatus;
  priority?: ThreadPriority;
  assigneeId?: string;
  q?: string;
}

export interface SupportMessageItem {
  id: string;
  direction: MessageDirection;
  channel: 'email' | 'in_app';
  text: string;
  html: string | null;
  createdAt: string;
  brevoMessageId: string | null;
}

export interface ThreadDetails {
  id: string;
  subject: string;
  status: ThreadStatus;
  priority: ThreadPriority;
}

export interface ThreadMessagesResponse {
  thread: ThreadDetails;
  messages: SupportMessageItem[];
}

export interface ReplyRequest {
  text: string;
  cc?: string[];
}

export interface ReplyResponse {
  sent: boolean;
  messageId: string;
  brevoMessageId: string | null;
}

export interface PatchThreadRequest {
  status?: ThreadStatus;
  priority?: ThreadPriority;
  assigneeAdminId?: string;
  internalNote?: string;
}

export interface PatchThreadResponse {
  updated: boolean;
  threadId: string;
}

export interface ActiveUsersResponse {
  hours: number;
  fromAppHeartbeat: number;
  fromRideActivity: number;
  displayCount: number;
}

export interface ActiveUsersQuery {
  hours?: number;
}

export interface FeedbackListItem {
  id: string;
  userId: string;
  stars: number;
  appExperience: string;
  timeSavingNote: string;
  source: string;
  handoffId: string | null;
  provider: string | null;
  createdAt: string;
}

export interface FeedbackListResponse {
  items: FeedbackListItem[];
}
