export type JobStatus = "scheduled" | "in-progress" | "completed" | "on-hold" | "cancelled"
export type JobPriority = "low" | "medium" | "high" | "emergency"
export type JobType = "installation" | "repair" | "maintenance" | "inspection"

export interface Job {
  id: string
  title: string
  type: JobType
  status: JobStatus
  priority: JobPriority
  customer: string
  address: string
  technician: string
  scheduledDate: string
  estimatedDuration: string
  notes: string
}

export interface Technician {
  id: string
  name: string
  email: string
  phone: string
  specialization: string
  certifications: string[]
  status: "available" | "on-job" | "off-duty"
  rating: number
  jobsCompleted: number
  avatar: string
}

export interface Customer {
  id: string
  name: string
  email: string
  phone: string
  address: string
  type: "residential" | "commercial"
  totalJobs: number
  lastService: string
  status: "active" | "inactive"
}

export const jobs: Job[] = [
  {
    id: "JOB-001",
    title: "AC Unit Replacement",
    type: "installation",
    status: "in-progress",
    priority: "high",
    customer: "Marcus Chen",
    address: "1420 Cedar Blvd, Suite 200",
    technician: "Jake Morrison",
    scheduledDate: "2026-02-19",
    estimatedDuration: "4h",
    notes: "Replacing outdated Carrier unit with Trane XR15. Customer requested quiet operation model.",
  },
  {
    id: "JOB-002",
    title: "Furnace Diagnostic",
    type: "repair",
    status: "scheduled",
    priority: "emergency",
    customer: "Linda Patel",
    address: "882 Maple Dr",
    technician: "Sarah Kim",
    scheduledDate: "2026-02-19",
    estimatedDuration: "2h",
    notes: "No heat reported. Possible ignitor failure. Customer has elderly residents.",
  },
  {
    id: "JOB-003",
    title: "Quarterly HVAC Maintenance",
    type: "maintenance",
    status: "completed",
    priority: "low",
    customer: "Greenfield Properties",
    address: "3500 Industrial Pkwy",
    technician: "Mike Torres",
    scheduledDate: "2026-02-18",
    estimatedDuration: "3h",
    notes: "Routine filter change, coil cleaning, and refrigerant check on 4 rooftop units.",
  },
  {
    id: "JOB-004",
    title: "Ductwork Inspection",
    type: "inspection",
    status: "scheduled",
    priority: "medium",
    customer: "Oakridge Mall",
    address: "7700 Commerce Way",
    technician: "Jake Morrison",
    scheduledDate: "2026-02-20",
    estimatedDuration: "5h",
    notes: "Annual duct inspection for 120,000 sq ft commercial space. Check for leaks and insulation deterioration.",
  },
  {
    id: "JOB-005",
    title: "Heat Pump Installation",
    type: "installation",
    status: "on-hold",
    priority: "medium",
    customer: "Diana Ross",
    address: "45 Birch Lane",
    technician: "Sarah Kim",
    scheduledDate: "2026-02-21",
    estimatedDuration: "6h",
    notes: "Awaiting equipment delivery. Mitsubishi hyper-heat mini-split system.",
  },
  {
    id: "JOB-006",
    title: "Compressor Replacement",
    type: "repair",
    status: "in-progress",
    priority: "high",
    customer: "Summit Office Park",
    address: "1200 Executive Dr",
    technician: "Mike Torres",
    scheduledDate: "2026-02-19",
    estimatedDuration: "4h",
    notes: "Scroll compressor failure on 5-ton York unit. Parts on-site.",
  },
  {
    id: "JOB-007",
    title: "Thermostat Upgrade",
    type: "installation",
    status: "completed",
    priority: "low",
    customer: "Robert Hayes",
    address: "330 Elm Street",
    technician: "Jake Morrison",
    scheduledDate: "2026-02-17",
    estimatedDuration: "1h",
    notes: "Upgrade from mercury thermostat to Ecobee Smart Thermostat Premium.",
  },
  {
    id: "JOB-008",
    title: "Refrigerant Leak Repair",
    type: "repair",
    status: "scheduled",
    priority: "high",
    customer: "Cold Storage LLC",
    address: "8900 Warehouse Rd",
    technician: "Sarah Kim",
    scheduledDate: "2026-02-20",
    estimatedDuration: "3h",
    notes: "R-410A leak detected in evaporator coil. EPA compliance required.",
  },
]

export const technicians: Technician[] = [
  {
    id: "TECH-001",
    name: "Jake Morrison",
    email: "jake.morrison@coolairpro.com",
    phone: "(555) 234-5678",
    specialization: "Commercial HVAC Systems",
    certifications: ["EPA 608 Universal", "NATE Certified", "OSHA 30"],
    status: "on-job",
    rating: 4.9,
    jobsCompleted: 342,
    avatar: "JM",
  },
  {
    id: "TECH-002",
    name: "Sarah Kim",
    email: "sarah.kim@coolairpro.com",
    phone: "(555) 345-6789",
    specialization: "Residential Heat Pumps",
    certifications: ["EPA 608 Universal", "NATE Certified", "BPI Certified"],
    status: "available",
    rating: 4.8,
    jobsCompleted: 287,
    avatar: "SK",
  },
  {
    id: "TECH-003",
    name: "Mike Torres",
    email: "mike.torres@coolairpro.com",
    phone: "(555) 456-7890",
    specialization: "Industrial Refrigeration",
    certifications: ["EPA 608 Universal", "NATE Certified", "R-410A Certified"],
    status: "on-job",
    rating: 4.7,
    jobsCompleted: 412,
    avatar: "MT",
  },
  {
    id: "TECH-004",
    name: "Rachel Adams",
    email: "rachel.adams@coolairpro.com",
    phone: "(555) 567-8901",
    specialization: "Ductwork & Ventilation",
    certifications: ["EPA 608 Universal", "SMACNA Certified"],
    status: "off-duty",
    rating: 4.6,
    jobsCompleted: 198,
    avatar: "RA",
  },
  {
    id: "TECH-005",
    name: "Carlos Diaz",
    email: "carlos.diaz@coolairpro.com",
    phone: "(555) 678-9012",
    specialization: "Boiler Systems",
    certifications: ["EPA 608 Universal", "NATE Certified", "Boiler Operator License"],
    status: "available",
    rating: 4.8,
    jobsCompleted: 265,
    avatar: "CD",
  },
]

export const customers: Customer[] = [
  {
    id: "CUST-001",
    name: "Marcus Chen",
    email: "m.chen@email.com",
    phone: "(555) 111-2233",
    address: "1420 Cedar Blvd, Suite 200",
    type: "commercial",
    totalJobs: 12,
    lastService: "2026-02-19",
    status: "active",
  },
  {
    id: "CUST-002",
    name: "Linda Patel",
    email: "linda.patel@email.com",
    phone: "(555) 222-3344",
    address: "882 Maple Dr",
    type: "residential",
    totalJobs: 5,
    lastService: "2026-01-15",
    status: "active",
  },
  {
    id: "CUST-003",
    name: "Greenfield Properties",
    email: "service@greenfield.com",
    phone: "(555) 333-4455",
    address: "3500 Industrial Pkwy",
    type: "commercial",
    totalJobs: 24,
    lastService: "2026-02-18",
    status: "active",
  },
  {
    id: "CUST-004",
    name: "Oakridge Mall",
    email: "facilities@oakridge.com",
    phone: "(555) 444-5566",
    address: "7700 Commerce Way",
    type: "commercial",
    totalJobs: 18,
    lastService: "2025-12-10",
    status: "active",
  },
  {
    id: "CUST-005",
    name: "Diana Ross",
    email: "d.ross@email.com",
    phone: "(555) 555-6677",
    address: "45 Birch Lane",
    type: "residential",
    totalJobs: 3,
    lastService: "2025-11-20",
    status: "active",
  },
  {
    id: "CUST-006",
    name: "Summit Office Park",
    email: "ops@summitpark.com",
    phone: "(555) 666-7788",
    address: "1200 Executive Dr",
    type: "commercial",
    totalJobs: 31,
    lastService: "2026-02-19",
    status: "active",
  },
  {
    id: "CUST-007",
    name: "Robert Hayes",
    email: "r.hayes@email.com",
    phone: "(555) 777-8899",
    address: "330 Elm Street",
    type: "residential",
    totalJobs: 7,
    lastService: "2026-02-17",
    status: "inactive",
  },
  {
    id: "CUST-008",
    name: "Cold Storage LLC",
    email: "maint@coldstorage.com",
    phone: "(555) 888-9900",
    address: "8900 Warehouse Rd",
    type: "commercial",
    totalJobs: 15,
    lastService: "2026-01-28",
    status: "active",
  },
]

export type MessagePriority = "normal" | "urgent"
export type ConversationChannel = "office-tech" | "office-customer" | "tech-customer" | "system"

export interface Message {
  id: string
  from: string
  fromRole: "technician" | "customer" | "dispatch" | "system"
  avatar: string
  subject: string
  preview: string
  body: string
  timestamp: string
  read: boolean
  priority: MessagePriority
  jobRef?: string
}

export interface Conversation {
  id: string
  channel: ConversationChannel
  participants: string[]
  lastMessage: string
  lastTimestamp: string
  unreadCount: number
  messages: Message[]
}

export const conversations: Conversation[] = [
  // --- OFFICE <-> TECHNICIAN ---
  {
    id: "CONV-001",
    channel: "office-tech",
    participants: ["Dispatch", "Jake Morrison"],
    lastMessage: "Compressor part ETA is 30 mins. Customer notified.",
    lastTimestamp: "2026-02-19T14:18:00",
    unreadCount: 2,
    messages: [
      {
        id: "MSG-001",
        from: "Jake Morrison",
        fromRole: "technician",
        avatar: "JM",
        subject: "JOB-001 - AC Unit Replacement Update",
        preview: "Old unit removed. Starting refrigerant line prep now.",
        body: "Old unit removed successfully. Starting refrigerant line prep now. The existing linesets are in good shape so we can reuse them. Should shave about 45 min off the estimate.",
        timestamp: "2026-02-19T13:42:00",
        read: true,
        priority: "normal",
        jobRef: "JOB-001",
      },
      {
        id: "MSG-002",
        from: "Dispatch",
        fromRole: "dispatch",
        avatar: "DP",
        subject: "Re: JOB-001 - AC Unit Replacement Update",
        preview: "Great news. Keep me posted on the Trane unit install.",
        body: "Great news on the linesets. Keep me posted on the Trane unit install. Customer asked for a completion estimate -- can you give me an updated ETA?",
        timestamp: "2026-02-19T13:55:00",
        read: true,
        priority: "normal",
        jobRef: "JOB-001",
      },
      {
        id: "MSG-003",
        from: "Jake Morrison",
        fromRole: "technician",
        avatar: "JM",
        subject: "Re: JOB-001 - AC Unit Replacement Update",
        preview: "Compressor part ETA is 30 mins. Customer notified.",
        body: "Compressor part ETA is 30 mins. Customer notified. Looking at a 4:30 PM wrap-up. Running the vacuum pump on the lines right now. Will send photo of the completed install.",
        timestamp: "2026-02-19T14:18:00",
        read: false,
        priority: "normal",
        jobRef: "JOB-001",
      },
    ],
  },
  {
    id: "CONV-002",
    channel: "office-tech",
    participants: ["Dispatch", "Sarah Kim"],
    lastMessage: "Heading to Maple Dr now. ETA 15 minutes.",
    lastTimestamp: "2026-02-19T14:05:00",
    unreadCount: 1,
    messages: [
      {
        id: "MSG-004",
        from: "Dispatch",
        fromRole: "dispatch",
        avatar: "DP",
        subject: "EMERGENCY: JOB-002 - Furnace Diagnostic",
        preview: "Priority call at 882 Maple Dr. Elderly residents, no heat.",
        body: "Priority call just came in. 882 Maple Dr -- Linda Patel residence. No heat, elderly residents on-site. Possible ignitor failure. You're the closest tech. Can you head over ASAP?",
        timestamp: "2026-02-19T13:50:00",
        read: true,
        priority: "urgent",
        jobRef: "JOB-002",
      },
      {
        id: "MSG-005",
        from: "Sarah Kim",
        fromRole: "technician",
        avatar: "SK",
        subject: "Re: EMERGENCY: JOB-002 - Furnace Diagnostic",
        preview: "Heading to Maple Dr now. ETA 15 minutes.",
        body: "Copy that. Wrapping up my current paperwork and heading to Maple Dr now. ETA 15 minutes. I've got replacement ignitors and flame sensors in the van. Will assess on-site and report back.",
        timestamp: "2026-02-19T14:05:00",
        read: false,
        priority: "urgent",
        jobRef: "JOB-002",
      },
    ],
  },
  {
    id: "CONV-003",
    channel: "office-tech",
    participants: ["Dispatch", "Mike Torres"],
    lastMessage: "Scroll compressor swap complete. Running test cycle now.",
    lastTimestamp: "2026-02-19T13:30:00",
    unreadCount: 0,
    messages: [
      {
        id: "MSG-006",
        from: "Mike Torres",
        fromRole: "technician",
        avatar: "MT",
        subject: "JOB-006 - Compressor Replacement Progress",
        preview: "On-site at Summit Office Park. Old compressor is out.",
        body: "On-site at Summit Office Park. Pulled the old scroll compressor -- confirmed burnout on the windings. New unit is prepped and I'm running a nitrogen purge on the lines before brazing. Should take about another hour.",
        timestamp: "2026-02-19T12:45:00",
        read: true,
        priority: "normal",
        jobRef: "JOB-006",
      },
      {
        id: "MSG-007",
        from: "Dispatch",
        fromRole: "dispatch",
        avatar: "DP",
        subject: "Re: JOB-006 - Compressor Replacement Progress",
        preview: "Good work. Building manager wants status update.",
        body: "Good work Mike. Building manager is asking for updates -- they've got a board meeting tomorrow and need the HVAC operational. Let me know as soon as the test cycle passes.",
        timestamp: "2026-02-19T13:00:00",
        read: true,
        priority: "normal",
        jobRef: "JOB-006",
      },
      {
        id: "MSG-008",
        from: "Mike Torres",
        fromRole: "technician",
        avatar: "MT",
        subject: "Re: JOB-006 - Compressor Replacement Progress",
        preview: "Scroll compressor swap complete. Running test cycle now.",
        body: "Scroll compressor swap complete. Brazing done, vacuum held at 500 microns for 30 minutes -- no leaks. Charged with R-410A to spec. Running the test cycle now. Compressor amps are within nameplate range. Should have final confirmation in 20 mins.",
        timestamp: "2026-02-19T13:30:00",
        read: true,
        priority: "normal",
        jobRef: "JOB-006",
      },
    ],
  },
  // --- OFFICE <-> CUSTOMER ---
  {
    id: "CONV-005",
    channel: "office-customer",
    participants: ["Dispatch", "Marcus Chen"],
    lastMessage: "Thanks for the update. What model did you end up going with?",
    lastTimestamp: "2026-02-19T11:30:00",
    unreadCount: 1,
    messages: [
      {
        id: "MSG-010",
        from: "Marcus Chen",
        fromRole: "customer",
        avatar: "MC",
        subject: "Question about AC replacement",
        preview: "Hi, I wanted to check on the status of the AC replacement.",
        body: "Hi, I wanted to check on the status of the AC replacement at my office on Cedar Blvd. Jake mentioned he'd be starting this morning. Is it still on track for today? We have client meetings tomorrow and need the space comfortable.",
        timestamp: "2026-02-19T10:15:00",
        read: true,
        priority: "normal",
        jobRef: "JOB-001",
      },
      {
        id: "MSG-011",
        from: "Dispatch",
        fromRole: "dispatch",
        avatar: "DP",
        subject: "Re: Question about AC replacement",
        preview: "Hi Marcus, yes Jake is on-site and making good progress.",
        body: "Hi Marcus, yes Jake is on-site and making good progress. The old unit has been removed and he's prepping the refrigerant lines now. We're estimating a 4:30 PM completion. The new Trane XR15 is a great unit -- very quiet operation as you requested.",
        timestamp: "2026-02-19T11:00:00",
        read: true,
        priority: "normal",
        jobRef: "JOB-001",
      },
      {
        id: "MSG-012",
        from: "Marcus Chen",
        fromRole: "customer",
        avatar: "MC",
        subject: "Re: Question about AC replacement",
        preview: "Thanks for the update. What model did you end up going with?",
        body: "Thanks for the update. That's great to hear. What model did you end up going with? I want to make sure it matches the specs we discussed. Also, will there be a follow-up inspection needed?",
        timestamp: "2026-02-19T11:30:00",
        read: false,
        priority: "normal",
        jobRef: "JOB-001",
      },
    ],
  },
  {
    id: "CONV-006",
    channel: "office-customer",
    participants: ["Dispatch", "Linda Patel"],
    lastMessage: "Sarah is on her way now. She should arrive by 2:20 PM.",
    lastTimestamp: "2026-02-19T14:08:00",
    unreadCount: 0,
    messages: [
      {
        id: "MSG-013",
        from: "Linda Patel",
        fromRole: "customer",
        avatar: "LP",
        subject: "No heat - urgent help needed",
        preview: "Our furnace stopped working and it's very cold.",
        body: "Our furnace stopped working overnight and it's very cold in the house. My husband is elderly and this is really concerning. We tried resetting the thermostat but nothing happened. Can someone come out today?",
        timestamp: "2026-02-19T13:30:00",
        read: true,
        priority: "urgent",
      },
      {
        id: "MSG-014",
        from: "Dispatch",
        fromRole: "dispatch",
        avatar: "DP",
        subject: "Re: No heat - urgent help needed",
        preview: "We're treating this as an emergency. Tech en route.",
        body: "Mrs. Patel, we're treating this as an emergency priority. Our technician Sarah Kim is wrapping up a nearby job and heading your way. She should arrive by 2:20 PM. She'll have all the parts needed for common furnace issues. Please stay warm in the meantime -- a space heater in one room can help.",
        timestamp: "2026-02-19T14:08:00",
        read: true,
        priority: "urgent",
        jobRef: "JOB-002",
      },
    ],
  },
  {
    id: "CONV-007",
    channel: "office-customer",
    participants: ["Dispatch", "Greenfield Properties"],
    lastMessage: "Confirmed. We'll have Carlos on-site Monday at 8 AM.",
    lastTimestamp: "2026-02-19T09:45:00",
    unreadCount: 0,
    messages: [
      {
        id: "MSG-015",
        from: "Greenfield Properties",
        fromRole: "customer",
        avatar: "GP",
        subject: "Quarterly maintenance scheduling",
        preview: "We need to schedule next week's rooftop unit service.",
        body: "Hi, we received the reminder about our quarterly maintenance. Can we schedule for Monday morning? Our tenants prefer work done before 10 AM to minimize disruption. All 4 rooftop units need servicing as usual.",
        timestamp: "2026-02-19T09:15:00",
        read: true,
        priority: "normal",
        jobRef: "JOB-003",
      },
      {
        id: "MSG-016",
        from: "Dispatch",
        fromRole: "dispatch",
        avatar: "DP",
        subject: "Re: Quarterly maintenance scheduling",
        preview: "Confirmed. We'll have Carlos on-site Monday at 8 AM.",
        body: "Confirmed. We'll have Carlos Diaz on-site Monday at 8 AM. He's handled your rooftop units before and knows the layout well. Standard scope: filter change, coil cleaning, refrigerant check on all 4 units. We'll aim to wrap up by 11 AM.",
        timestamp: "2026-02-19T09:45:00",
        read: true,
        priority: "normal",
        jobRef: "JOB-003",
      },
    ],
  },
  // --- TECHNICIAN <-> CUSTOMER ---
  {
    id: "CONV-008",
    channel: "tech-customer",
    participants: ["Jake Morrison", "Marcus Chen"],
    lastMessage: "Running the final test cycle. Should be done by 4:30.",
    lastTimestamp: "2026-02-19T15:00:00",
    unreadCount: 1,
    messages: [
      {
        id: "MSG-017",
        from: "Jake Morrison",
        fromRole: "technician",
        avatar: "JM",
        subject: "On-site at your office - AC install",
        preview: "Hi Marcus, I'm here at Cedar Blvd starting the install.",
        body: "Hi Marcus, I'm here at Cedar Blvd starting the AC replacement. Your office manager let me in and showed me the unit location. I'll be removing the old Carrier unit first -- there might be some noise for about 30 minutes during the removal. I'll keep the area clean.",
        timestamp: "2026-02-19T10:00:00",
        read: true,
        priority: "normal",
        jobRef: "JOB-001",
      },
      {
        id: "MSG-018",
        from: "Marcus Chen",
        fromRole: "customer",
        avatar: "MC",
        subject: "Re: On-site at your office - AC install",
        preview: "Thanks Jake. Is the new unit the quiet model we discussed?",
        body: "Thanks Jake. Is the new unit the Trane XR15 we discussed? We specifically need something quiet since the unit is near the conference room. Also, will you be able to set up the smart thermostat integration today?",
        timestamp: "2026-02-19T10:30:00",
        read: true,
        priority: "normal",
        jobRef: "JOB-001",
      },
      {
        id: "MSG-019",
        from: "Jake Morrison",
        fromRole: "technician",
        avatar: "JM",
        subject: "Re: On-site at your office - AC install",
        preview: "Yep, it's the XR15. Smart thermostat will be set up today.",
        body: "Yep, it's the Trane XR15 -- great unit, one of the quietest in its class. The smart thermostat integration is included in today's scope. I'll have it connected to your WiFi and you can control it from the Trane app. Good news -- the existing linesets are in great shape so we're ahead of schedule.",
        timestamp: "2026-02-19T11:15:00",
        read: true,
        priority: "normal",
        jobRef: "JOB-001",
      },
      {
        id: "MSG-020",
        from: "Jake Morrison",
        fromRole: "technician",
        avatar: "JM",
        subject: "Re: On-site at your office - AC install",
        preview: "Running the final test cycle. Should be done by 4:30.",
        body: "Update: new unit is mounted and refrigerant lines are connected. Running the vacuum pump now to check for leaks. Everything looking clean. I'll run a full test cycle after the vacuum holds. Should be completely done by 4:30 PM. The system will need about 24 hours to fully settle, so don't worry if it takes a bit to reach the set temperature tonight.",
        timestamp: "2026-02-19T15:00:00",
        read: false,
        priority: "normal",
        jobRef: "JOB-001",
      },
    ],
  },
  {
    id: "CONV-009",
    channel: "tech-customer",
    participants: ["Sarah Kim", "Diana Ross"],
    lastMessage: "I'll call you once the Mitsubishi unit arrives to schedule.",
    lastTimestamp: "2026-02-18T16:30:00",
    unreadCount: 0,
    messages: [
      {
        id: "MSG-021",
        from: "Sarah Kim",
        fromRole: "technician",
        avatar: "SK",
        subject: "Heat pump install - equipment update",
        preview: "Hi Diana, quick update on your mini-split installation.",
        body: "Hi Diana, quick update on your Mitsubishi hyper-heat mini-split installation. The unit is still on backorder but the distributor confirmed it should ship by end of this week. Once I have it in hand, I'll reach out to schedule the install. We'll need a full day for the job.",
        timestamp: "2026-02-18T15:00:00",
        read: true,
        priority: "normal",
        jobRef: "JOB-005",
      },
      {
        id: "MSG-022",
        from: "Diana Ross",
        fromRole: "customer",
        avatar: "DR",
        subject: "Re: Heat pump install - equipment update",
        preview: "Thanks for keeping me in the loop. Any day next week works.",
        body: "Thanks for keeping me in the loop, Sarah. I appreciate the heads up. Any day next week works for me -- I work from home so I'm flexible. Will you need access to the attic for the line run, or just the exterior wall?",
        timestamp: "2026-02-18T16:00:00",
        read: true,
        priority: "normal",
        jobRef: "JOB-005",
      },
      {
        id: "MSG-023",
        from: "Sarah Kim",
        fromRole: "technician",
        avatar: "SK",
        subject: "Re: Heat pump install - equipment update",
        preview: "I'll call you once the Mitsubishi unit arrives to schedule.",
        body: "We'll need both -- attic access for the line run and the exterior wall for the condenser bracket. I'll bring the wall bracket and all mounting hardware. I'll call you as soon as the Mitsubishi unit arrives to lock in a day. Thanks for being flexible!",
        timestamp: "2026-02-18T16:30:00",
        read: true,
        priority: "normal",
        jobRef: "JOB-005",
      },
    ],
  },
  // --- SYSTEM ---
  {
    id: "CONV-004",
    channel: "system",
    participants: ["System", "Dispatch"],
    lastMessage: "Scheduled maintenance reminder for Greenfield Properties.",
    lastTimestamp: "2026-02-19T08:00:00",
    unreadCount: 0,
    messages: [
      {
        id: "MSG-009",
        from: "System",
        fromRole: "system",
        avatar: "SY",
        subject: "Maintenance Reminder - Greenfield Properties",
        preview: "Scheduled maintenance reminder for Greenfield Properties.",
        body: "Automated reminder: Greenfield Properties (CUST-003) has quarterly HVAC maintenance scheduled for next week. 4 rooftop units require inspection, filter change, coil cleaning, and refrigerant level check. Please assign a technician and confirm the appointment.",
        timestamp: "2026-02-19T08:00:00",
        read: true,
        priority: "normal",
      },
    ],
  },
  {
    id: "CONV-010",
    channel: "system",
    participants: ["System", "Dispatch"],
    lastMessage: "EPA compliance report due in 5 days for Cold Storage LLC.",
    lastTimestamp: "2026-02-19T07:00:00",
    unreadCount: 0,
    messages: [
      {
        id: "MSG-024",
        from: "System",
        fromRole: "system",
        avatar: "SY",
        subject: "EPA Compliance Deadline - Cold Storage LLC",
        preview: "EPA compliance report due in 5 days for Cold Storage LLC.",
        body: "Automated alert: EPA Section 608 compliance report for Cold Storage LLC (CUST-008) refrigerant leak repair is due by Feb 24, 2026. R-410A leak was reported on JOB-008. Ensure all repair documentation, recovery amounts, and disposal records are filed before the deadline.",
        timestamp: "2026-02-19T07:00:00",
        read: true,
        priority: "normal",
        jobRef: "JOB-008",
      },
    ],
  },
]

export interface Invoice {
  id: string
  jobId: string
  customer: string
  description: string
  amount: number
  status: "paid" | "pending" | "overdue"
  issuedDate: string
  dueDate: string
}

export const invoices: Invoice[] = [
  { id: "INV-001", jobId: "JOB-003", customer: "Greenfield Properties", description: "Quarterly HVAC Maintenance - 4 Rooftop Units", amount: 2400, status: "paid", issuedDate: "2026-02-18", dueDate: "2026-03-18" },
  { id: "INV-002", jobId: "JOB-007", customer: "Robert Hayes", description: "Ecobee Smart Thermostat Upgrade", amount: 650, status: "paid", issuedDate: "2026-02-17", dueDate: "2026-03-17" },
  { id: "INV-003", jobId: "JOB-001", customer: "Marcus Chen", description: "AC Unit Replacement - Trane XR15", amount: 8750, status: "pending", issuedDate: "2026-02-19", dueDate: "2026-03-19" },
  { id: "INV-004", jobId: "JOB-006", customer: "Summit Office Park", description: "Scroll Compressor Replacement - 5-Ton York", amount: 4200, status: "pending", issuedDate: "2026-02-19", dueDate: "2026-03-19" },
  { id: "INV-005", jobId: "JOB-002", customer: "Linda Patel", description: "Emergency Furnace Diagnostic & Ignitor Repair", amount: 890, status: "pending", issuedDate: "2026-02-19", dueDate: "2026-03-05" },
  { id: "INV-006", jobId: "JOB-004", customer: "Oakridge Mall", description: "Annual Ductwork Inspection - 120K sqft", amount: 3600, status: "overdue", issuedDate: "2026-01-15", dueDate: "2026-02-15" },
]

export const revenueData = [
  { month: "Sep", revenue: 38200, jobs: 22 },
  { month: "Oct", revenue: 41500, jobs: 25 },
  { month: "Nov", revenue: 35800, jobs: 20 },
  { month: "Dec", revenue: 29400, jobs: 16 },
  { month: "Jan", revenue: 44200, jobs: 28 },
  { month: "Feb", revenue: 47850, jobs: 24 },
]

export const dashboardStats = {
  activeJobs: 4,
  completedToday: 2,
  scheduledThisWeek: 8,
  revenue: 47850,
  techsAvailable: 2,
  techsOnJob: 2,
  emergencyCalls: 1,
  avgResponseTime: "42 min",
}
