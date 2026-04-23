export type AuthMode = 'login' | 'register' | 'forgot'

export interface AuthUser {
  email: string
  name: string
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterPayload {
  name: string
  email: string
  password: string
}

export interface RegisterFormData extends RegisterPayload {
  confirmPassword: string
}

export interface FeedbackMessage {
  tone: 'success' | 'error' | 'info'
  text: string
}
