const EMAIL_PATTERN = /^[\w.!#$%&'*+/=?^`{|}~-]+@[\w-]+(?:\.[\w-]+)+$/
const CEP_PATTERN = /^\d{8}$/

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim().toLowerCase())
}

export function passwordError(value: string): string | null {
  if (!value.trim()) {
    return 'Digite sua senha.'
  }

  if (value.length < 6) {
    return 'A senha precisa ter no minimo 6 caracteres.'
  }

  return null
}

export function normalizeCep(value: string): string {
  return value.replace(/\D/g, '').slice(0, 8)
}

export function isValidCep(value: string): boolean {
  return CEP_PATTERN.test(normalizeCep(value))
}

export function stateError(value: string): string | null {
  if (!value.trim()) {
    return 'Digite o estado (UF).'
  }

  if (value.trim().length !== 2) {
    return 'O estado precisa ter 2 letras (ex: SP).'
  }

  return null
}
