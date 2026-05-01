import type { LoginCredentials, RegisterPayload } from './types'

interface StoredAddress {
  cep: string
  city: string
  complement: string
  number: string
  state: string
  street: string
}

interface StoredAccount {
  address?: StoredAddress
  confirmedAt?: string
  confirmationEmailSentAt?: string
  confirmationToken?: string
  createdAt: string
  email: string
  name: string
  password?: string
  provider: 'email' | 'google'
}

const ACCOUNTS_STORAGE_KEY = 'permutamatch.auth.accounts'
const TEMPORARY_RESET_PASSWORD = '123456'
const DEMO_EMAIL = 'demo@permutador.com.br'
const LEGACY_DEMO_EMAIL = 'demo@permutamatch.com'

const seedAccounts: StoredAccount[] = [
  {
    createdAt: new Date().toISOString(),
    email: DEMO_EMAIL,
    name: 'Conta Demo',
    password: TEMPORARY_RESET_PASSWORD,
    provider: 'email',
  },
]

const wait = (milliseconds = 900): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds)
  })

function normalizeAddress(address: unknown): StoredAddress {
  if (typeof address === 'string') {
    return {
      cep: '',
      city: '',
      complement: '',
      number: '',
      state: '',
      street: address.trim(),
    }
  }

  const value = (address ?? {}) as Partial<StoredAddress>

  return {
    cep: value.cep?.trim() ?? '',
    city: value.city?.trim() ?? '',
    complement: value.complement?.trim() ?? '',
    number: value.number?.trim() ?? '',
    state: value.state?.trim().toUpperCase() ?? '',
    street: value.street?.trim() ?? '',
  }
}

function normalizeStoredAccount(account: unknown): StoredAccount {
  const value = (account ?? {}) as Partial<StoredAccount>
  const normalizedEmail = normalizeEmail(value.email ?? '')

  return {
    address: value.address ? normalizeAddress(value.address) : undefined,
    confirmedAt:
      value.confirmedAt ??
      (normalizedEmail === DEMO_EMAIL || value.provider === 'google'
        ? value.createdAt ?? new Date().toISOString()
        : undefined),
    confirmationEmailSentAt: value.confirmationEmailSentAt,
    confirmationToken: value.confirmationToken,
    createdAt: value.createdAt ?? new Date().toISOString(),
    email: normalizedEmail === LEGACY_DEMO_EMAIL ? DEMO_EMAIL : normalizedEmail,
    name: value.name?.trim() || 'Usuário',
    password: value.password,
    provider: value.provider === 'google' ? 'google' : 'email',
  }
}

function readAccounts(): StoredAccount[] {
  const serialized = localStorage.getItem(ACCOUNTS_STORAGE_KEY)

  if (!serialized) {
    localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(seedAccounts))
    return seedAccounts
  }

  try {
    const parsed = JSON.parse(serialized) as unknown[]
    const normalizedParsed = parsed.map(normalizeStoredAccount)

    const hasDemo = normalizedParsed.some(
      (account) => normalizeEmail(account.email) === DEMO_EMAIL,
    )

    const nextAccounts = hasDemo
      ? normalizedParsed
      : [...normalizedParsed, seedAccounts[0]]

    writeAccounts(nextAccounts)

    return nextAccounts
  } catch {
    localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(seedAccounts))
    return seedAccounts
  }
}

function writeAccounts(accounts: StoredAccount[]) {
  localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts))
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function createConfirmationToken(): string {
  return crypto.randomUUID()
}

function createConfirmationUrl(token: string): string {
  return `${window.location.origin}${window.location.pathname}?confirmEmail=${encodeURIComponent(token)}`
}

async function sendConfirmationEmail(name: string, email: string, token: string) {
  const apiUrl = import.meta.env.VITE_CONFIRMATION_EMAIL_API_URL as
    | string
    | undefined

  if (apiUrl) {
    const response = await fetch(apiUrl, {
      body: JSON.stringify({
        confirmationUrl: createConfirmationUrl(token),
        email,
        name,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })

    if (!response.ok) {
      throw new Error('Não foi possível enviar o e-mail de confirmação.')
    }

    const result = (await response.json()) as {
      id?: string
      sentAt?: string
    }
    const sentAt = result.sentAt ?? new Date().toISOString()

    return {
      messageId: result.id ?? `api-confirm-${Date.now()}`,
      sentAt,
      to: email,
      userName: name,
    }
  }

  await wait(650)

  return {
    messageId: `mock-confirm-${Date.now()}`,
    sentAt: new Date().toISOString(),
    to: email,
    userName: name,
  }
}

export const authService = {
  confirmEmail(token: string) {
    const normalizedToken = token.trim()

    if (!normalizedToken) {
      throw new Error('Link de confirmação inválido.')
    }

    const accounts = readAccounts()
    const account = accounts.find((item) => item.confirmationToken === normalizedToken)

    if (!account) {
      throw new Error('Link de confirmação inválido ou expirado.')
    }

    const confirmedAt = new Date().toISOString()
    const nextAccounts = accounts.map((item) =>
      item.confirmationToken === normalizedToken
        ? {
            ...item,
            confirmedAt,
            confirmationToken: undefined,
          }
        : item,
    )

    writeAccounts(nextAccounts)

    return {
      confirmedAt,
      email: account.email,
      name: account.name,
    }
  },

  async login(payload: LoginCredentials) {
    await wait()

    const accounts = readAccounts()
    const email = normalizeEmail(payload.email)
    const account = accounts.find((item) => normalizeEmail(item.email) === email)

    if (!account) {
      throw new Error('Não encontramos uma conta com esse e-mail.')
    }

    if (!account.password) {
      throw new Error(
        'Sua conta ainda não possui senha. Clique em "Esqueci minha senha" para definir.',
      )
    }

    if (!account.confirmedAt) {
      throw new Error('Confirme seu e-mail antes de entrar. Enviamos o link no cadastro.')
    }

    if (payload.password !== account.password) {
      throw new Error('Senha incorreta. Tente novamente.')
    }

    return {
      email: account.email,
      name: account.name,
    }
  },

  async register(payload: RegisterPayload) {
    await wait()

    const accounts = readAccounts()
    const email = normalizeEmail(payload.email)
    const hasEmail = accounts.some((item) => normalizeEmail(item.email) === email)

    if (hasEmail) {
      throw new Error('Esse e-mail já possui cadastro.')
    }

    const confirmationToken = createConfirmationToken()
    const confirmation = await sendConfirmationEmail(
      payload.name.trim(),
      email,
      confirmationToken,
    )

    const nextAccount: StoredAccount = {
      confirmationEmailSentAt: confirmation.sentAt,
      confirmationToken,
      createdAt: new Date().toISOString(),
      email,
      name: payload.name.trim(),
      password: payload.password,
      provider: 'email',
    }

    writeAccounts([...accounts, nextAccount])

    return {
      confirmationSentAt: confirmation.sentAt,
      email,
      name: nextAccount.name,
    }
  },

  async requestPasswordReset(email: string) {
    await wait(850)

    const accounts = readAccounts()
    const normalized = normalizeEmail(email)

    const updatedAccounts = accounts.map((account) => {
      if (normalizeEmail(account.email) !== normalized) {
        return account
      }

      return {
        ...account,
        password: TEMPORARY_RESET_PASSWORD,
      }
    })

    writeAccounts(updatedAccounts)

    return {
      temporaryPassword: TEMPORARY_RESET_PASSWORD,
    }
  },

  async signInWithGoogle() {
    await wait(700)

    return {
      email: 'google.user@permutador.com.br',
      name: 'Usuário Google',
      provider: 'Google',
    }
  },
}
