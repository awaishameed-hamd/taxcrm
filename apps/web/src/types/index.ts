import { Role } from '@ca-firm/shared'

export interface User {
  id:           string
  userCode:     string
  email:        string
  fullName:     string
  role:         Role
  phone?:       string
  avatar?:      string
  isActive:     boolean
  createdAt:    string
  attendanceApplicable?: boolean
  clientProfile?: ClientProfile | null
}

export interface ClientProfile {
  id:           string
  userId:       string
  cnic?:        string
  dateOfBirth?: string
  address?:     string
  city?:        string
  province?:    string
  ntn?:         string
  strn?:        string
  businessName?: string
  businessType?: string
  traineeId?:   string
  trainee?:     { id: string; fullName: string }
  user:         { id: string; fullName: string; email: string; phone?: string; avatar?: string }
}

export interface Message {
  id:             string
  conversationId: string
  sender:         { id: string; fullName: string; role: Role; avatar?: string }
  content:        string
  type:           'TEXT' | 'FILE' | 'IMAGE'
  attachmentUrl?: string
  createdAt:      string
}

export interface Conversation {
  id:          string
  messages:    Message[]
  lastMessageAt?: string
}

export interface Notification {
  id:        string
  title:     string
  body:      string
  type:      string
  data?:     Record<string, unknown>
  isRead:    boolean
  createdAt: string
}
