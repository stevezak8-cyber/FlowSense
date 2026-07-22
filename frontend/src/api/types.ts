// Types matching the backend Prisma models + API response shapes

export interface OnboardingStatus {
  dismissed: boolean
  steps: {
    companyProfile: boolean
    technician: boolean
    customer: boolean
    job: boolean
    stripeConnect: boolean
    smsEnabled: boolean
  }
}

export interface ApiJob {
  id: string
  organizationId: string
  customerId: string
  technicianId: string | null
  status: "pending" | "scheduled" | "en_route" | "in_progress" | "completed" | "cancelled"
  priority: "low" | "normal" | "high" | "urgent"
  scheduledAt: string
  symptomSummary: string | null
  equipmentId: string | null
  equipmentType: string | null
  equipmentNotes: string | null
  serviceType: string | null
  preArrivalNotes: string | null
  suggestedParts: string[]
  suggestedTools: string[]
  riskFlags: string[]
  summary: string | null
  actionsTaken: string | null
  partsUsed: string[]
  photos: string[]
  completedAt: string | null
  createdAt: string
  updatedAt: string
  // Included relations from GET /api/jobs
  customer: { id: string; name: string; address: string; phone?: string }
  technician: { id: string; name: string } | null
}

export interface ApiTechnician {
  id: string
  organizationId: string
  name: string
  email: string | null
  phone: string | null
  epa608Level: string | null
  skills: string[]
  createdAt: string
  updatedAt: string
  vehicle: { id: string; name: string } | null
}

export interface ApiCustomer {
  id: string
  organizationId: string
  name: string
  email: string | null
  phone: string
  address: string
  addressLine2: string | null
  city: string
  state: string
  postalCode: string
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface DashboardStats {
  totalJobs: number
  activeJobs: number
  completedToday: number
  scheduledThisWeek: number
  urgentJobs: number
  totalTechnicians: number
  totalCustomers: number
  completedJobs: number
  revenueMtd: number
}

export interface ChartDataPoint {
  day: string
  scheduled: number
  completed: number
}

export interface ApiInvoice {
  id: string
  organizationId: string
  jobId: string
  customerId: string
  description: string
  amount: number
  status: "pending" | "paid" | "overdue"
  issuedDate: string
  dueDate: string
  createdAt: string
  updatedAt: string
  customer: { id: string; name: string }
  job: { id: string; equipmentType: string | null; symptomSummary: string | null }
}

export interface RevenueDataPoint {
  month: string
  revenue: number
  jobs: number
}

export interface ApiConversation {
  id: string
  organizationId: string
  subject: string
  channel: "internal" | "sms" | "email" | "phone"
  participants: string[]
  unreadCount: number
  lastMessageAt: string
  createdAt: string
  updatedAt: string
  messages: ApiMessage[]
}

export interface ApiMessage {
  id: string
  conversationId: string
  sender: string
  senderRole: "dispatch" | "technician" | "customer" | "system"
  content: string
  createdAt: string
}

export interface AiMessage {
  id: string
  jobId: string
  role: "user" | "assistant"
  content: string
  createdAt: string
}

export interface Equipment {
  id: string
  organizationId: string
  customerId: string
  equipmentType: string
  make: string | null
  model: string | null
  serialNumber: string | null
  installDate: string | null
  warrantyExpiry: string | null
  serviceIntervalMonths: number | null
  lastServicedAt: string | null
  notes: string | null
  nextDueAt: string | null
  createdAt: string
  updatedAt: string
  customer?: { name: string }
}

export interface CreateJobPayload {
  technicianId?: string
  scheduledAt: string
  priority?: "low" | "normal" | "high" | "urgent"
  symptomSummary?: string
  equipmentType?: string
  equipmentNotes?: string
  serviceType?: "repair" | "maintenance" | "inspection" | "installation"
}

export interface NotificationEvent {
  type: "job.created" | "job.assigned" | "job.status_changed" | "job.completed"
  message: string
  jobId: string
  timestamp: string
}

export interface DispatchSuggestion {
  technician: {
    id: string
    name: string
    skills: string[]
    vehicle: { id: string; name: string } | null
  }
  score: number
  driveMinutes: number | null
  todayJobCount: number
  servedCustomerBefore: boolean
  skillMatch: boolean
}

export interface DispatchResult {
  suggestions: DispatchSuggestion[]
  fallbackMode: boolean
  driveTimesAvailable: boolean
}

export interface NotificationPreferences {
  booking: boolean
  statusChange: boolean
  completion: boolean
  urgent: boolean
}

export interface ApiOrganization {
  id: string
  name: string
  slug: string
  phone: string | null
  email: string | null
  address: string | null
  notificationPreferences: NotificationPreferences | null
  createdAt: string
  plan: "trial" | "entry" | "core" | "premium" | "cancelled"
  trialEndsAt: string | null
  estimateDepositThreshold: number
  estimateDepositPercent: number
  stripeConnectOnboarded: boolean
  stripeConnectAccountId: string | null
  smsEnabled: boolean
}

export interface PricebookItem {
  id: string
  organizationId: string
  name: string
  description?: string | null
  category: "cooling" | "heating" | "parts" | "labor" | "maintenance"
  unit?: string | null
  unitPrice: number
  locked: boolean
  source: "admin" | "ai"
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface EstimateLine {
  id: string
  estimateId: string
  pricebookItemId?: string | null
  tier: "good" | "better" | "best"
  name: string
  quantity: number
  unitPrice: number
  locked: boolean
  source: "ai" | "manual"
}

export interface Estimate {
  id: string
  organizationId: string
  jobId: string
  token: string
  status: "draft" | "sent" | "approved" | "declined" | "expired"
  selectedTier?: "good" | "better" | "best" | null
  signatureData?: string | null
  signedAt?: string | null
  depositAmount?: number | null
  depositPaidAt?: string | null
  stripePaymentIntentId?: string | null
  sentAt?: string | null
  approvedAt?: string | null
  expiresAt?: string | null
  createdAt: string
  updatedAt: string
  lines: EstimateLine[]
  job?: { title: string; address?: string | null } | null
}
