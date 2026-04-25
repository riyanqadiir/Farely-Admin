export type AdminRole = 'super_admin' | 'support' | 'ops_analyst';
export type ThreadStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type ThreadPriority = 'low' | 'medium' | 'high' | 'urgent';
export type MessageDirection = 'inbound' | 'outbound';
export type RideStatus = 'handoff_opened' | 'handoff_failed' | 'ride_confirmed' | 'ride_not_taken';

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: { code: string; message: string };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface EventEnvelope {
  eventId: string;
  eventType: string;
  entityId: string;
  occurredAt: string;
  version: 1;
  payload: Record<string, unknown>;
  processedAt?: string;
  attemptCount: number;
  lastError?: string;
}
