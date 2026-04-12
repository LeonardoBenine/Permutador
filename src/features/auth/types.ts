export type AuthMode = 'login' | 'register' | 'forgot'

export interface AuthUser {
  email: string
  name: string
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface AddressData {
  cep: string
  street: string
  number: string
  complement: string
  city: string
  state: string
}

export interface RegisterPayload {
  name: string
  email: string
  password: string
  address: AddressData
}

export interface RegisterFormData extends RegisterPayload {
  confirmPassword: string
}

export interface FeedbackMessage {
  tone: 'success' | 'error' | 'info'
  text: string
}
