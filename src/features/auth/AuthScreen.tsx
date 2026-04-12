import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import brandLogo from '../../assets/logo-permutador-oficial.png'
import { authService } from './authService'
import { lookupAddressByCep } from './cepService'
import type {
  AuthMode,
  AuthUser,
  FeedbackMessage,
  LoginCredentials,
  RegisterFormData,
} from './types'
import {
  isValidCep,
  isValidEmail,
  normalizeCep,
  passwordError,
  stateError,
} from './validation'
import './AuthScreen.css'

const modeContent: Record<AuthMode, { title: string; subtitle: string }> = {
  forgot: {
    subtitle:
      'Informe seu e-mail e enviaremos um link para redefinir a senha.',
    title: 'Recuperar acesso',
  },
  login: {
    subtitle:
      'Entre na sua conta para continuar negociando ativos com seguranca.',
    title: 'Bem-vindo de volta',
  },
  register: {
    subtitle:
      'Crie sua conta com senha, endereco completo e confirmacao por e-mail.',
    title: 'Crie sua conta',
  },
}

const initialLoginForm: LoginCredentials = {
  email: '',
  password: '',
}

const initialRegisterForm: RegisterFormData = {
  address: {
    cep: '',
    city: '',
    complement: '',
    number: '',
    state: '',
    street: '',
  },
  confirmPassword: '',
  email: '',
  name: '',
  password: '',
}

function formatCep(value: string): string {
  const sanitized = normalizeCep(value)

  if (sanitized.length <= 5) {
    return sanitized
  }

  return `${sanitized.slice(0, 5)}-${sanitized.slice(5)}`
}

interface AuthScreenProps {
  onAuthenticated?: (user: AuthUser) => void
}

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>('login')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCepLoading, setIsCepLoading] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackMessage | null>(null)
  const [loginForm, setLoginForm] = useState<LoginCredentials>(initialLoginForm)
  const [registerForm, setRegisterForm] = useState<RegisterFormData>(
    initialRegisterForm,
  )
  const [forgotEmail, setForgotEmail] = useState('')

  const activeMode = useMemo(() => modeContent[mode], [mode])

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode)
    setFeedback(null)
  }

  function updateAddressField(
    field: keyof RegisterFormData['address'],
    value: string,
  ) {
    setRegisterForm((previous) => ({
      ...previous,
      address: {
        ...previous.address,
        [field]: value,
      },
    }))
  }

  async function handleCepLookup(options?: { silent?: boolean }) {
    const cep = normalizeCep(registerForm.address.cep)

    if (!isValidCep(cep)) {
      if (!options?.silent) {
        setFeedback({
          text: 'Digite um CEP valido com 8 numeros para buscar endereco.',
          tone: 'error',
        })
      }
      return
    }

    try {
      setIsCepLoading(true)
      const cepResult = await lookupAddressByCep(cep)

      setRegisterForm((previous) => ({
        ...previous,
        address: {
          ...previous.address,
          cep,
          city: cepResult.city || previous.address.city,
          state: (cepResult.state || previous.address.state).toUpperCase(),
          street: cepResult.street || previous.address.street,
        },
      }))

      if (!options?.silent) {
        setFeedback({
          text: 'Endereco carregado a partir do CEP.',
          tone: 'info',
        })
      }
    } catch (error) {
      if (!options?.silent) {
        setFeedback({
          text: (error as Error).message,
          tone: 'error',
        })
      }
    } finally {
      setIsCepLoading(false)
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!isValidEmail(loginForm.email)) {
      setFeedback({
        text: 'Digite um e-mail valido para entrar.',
        tone: 'error',
      })
      return
    }

    const invalidPassword = passwordError(loginForm.password)

    if (invalidPassword) {
      setFeedback({
        text: invalidPassword,
        tone: 'error',
      })
      return
    }

    try {
      setIsSubmitting(true)
      setFeedback(null)
      const result = await authService.login(loginForm)

      setFeedback({
        text: `Login realizado com sucesso. Ola, ${result.name}!`,
        tone: 'success',
      })
      onAuthenticated?.({ email: result.email, name: result.name })
    } catch (error) {
      setFeedback({
        text: (error as Error).message,
        tone: 'error',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!registerForm.name.trim()) {
      setFeedback({
        text: 'Preencha o nome para continuar.',
        tone: 'error',
      })
      return
    }

    if (!isValidEmail(registerForm.email)) {
      setFeedback({
        text: 'Digite um e-mail valido para criar conta.',
        tone: 'error',
      })
      return
    }

    const invalidPassword = passwordError(registerForm.password)

    if (invalidPassword) {
      setFeedback({
        text: invalidPassword,
        tone: 'error',
      })
      return
    }

    if (registerForm.password !== registerForm.confirmPassword) {
      setFeedback({
        text: 'As senhas nao conferem. Digite novamente.',
        tone: 'error',
      })
      return
    }

    if (!isValidCep(registerForm.address.cep)) {
      setFeedback({
        text: 'Digite um CEP valido com 8 numeros.',
        tone: 'error',
      })
      return
    }

    if (!registerForm.address.street.trim()) {
      setFeedback({
        text: 'Preencha o endereco (rua/avenida).',
        tone: 'error',
      })
      return
    }

    if (!registerForm.address.number.trim()) {
      setFeedback({
        text: 'Preencha o numero do endereco.',
        tone: 'error',
      })
      return
    }

    if (!registerForm.address.city.trim()) {
      setFeedback({
        text: 'Preencha a cidade.',
        tone: 'error',
      })
      return
    }

    const invalidState = stateError(registerForm.address.state)

    if (invalidState) {
      setFeedback({
        text: invalidState,
        tone: 'error',
      })
      return
    }

    try {
      setIsSubmitting(true)
      setFeedback(null)

      const result = await authService.register({
        address: {
          ...registerForm.address,
          cep: normalizeCep(registerForm.address.cep),
          state: registerForm.address.state.toUpperCase(),
        },
        email: registerForm.email,
        name: registerForm.name,
        password: registerForm.password,
      })

      setLoginForm({
        email: result.email,
        password: registerForm.password,
      })

      setRegisterForm(initialRegisterForm)
      changeMode('login')
      setFeedback({
        text: `Conta criada para ${result.name}. Enviamos e-mail de confirmacao para ${result.email}.`,
        tone: 'success',
      })
    } catch (error) {
      setFeedback({
        text: (error as Error).message,
        tone: 'error',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleForgotPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!isValidEmail(forgotEmail)) {
      setFeedback({
        text: 'Digite um e-mail valido para recuperar a senha.',
        tone: 'error',
      })
      return
    }

    try {
      setIsSubmitting(true)
      setFeedback(null)

      const result = await authService.requestPasswordReset(forgotEmail)

      setLoginForm({
        email: forgotEmail,
        password: '',
      })

      changeMode('login')
      setFeedback({
        text: `Enviamos a redefinicao para ${forgotEmail}. Em ambiente local, use senha temporaria ${result.temporaryPassword}.`,
        tone: 'info',
      })
      setForgotEmail('')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleGoogleSignIn() {
    try {
      setIsSubmitting(true)
      setFeedback(null)

      const provider = await authService.signInWithGoogle()

      setFeedback({
        text: `Conexao com ${provider.provider} iniciada com sucesso.`,
        tone: 'success',
      })
      onAuthenticated?.({ email: provider.email, name: provider.name })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-orb auth-orb-left" aria-hidden="true" />
      <div className="auth-orb auth-orb-right" aria-hidden="true" />

      <main className="auth-layout">
        <section className="auth-hero">
          <div className="auth-brand">
            <img className="auth-brand-logo" src={brandLogo} alt="Logo Permutador" />
          </div>

          <h2>Trocas inteligentes para quem quer agilidade e confianca</h2>
          <p>
            Acesse, negocie e acompanhe oportunidades de permuta com uma
            experiencia moderna e intuitiva.
          </p>

          <ul>
            <li>Login por e-mail e senha</li>
            <li>Recuperacao de senha por e-mail</li>
            <li>Cadastro com CEP e confirmacao de senha</li>
            <li>E-mail de confirmacao apos criar conta</li>
          </ul>

          <div className="auth-demo-box">
            <span>Conta de demonstracao</span>
            <strong>demo@permutador.com.br</strong>
            <small>Senha: 123456</small>
          </div>
        </section>

        <section className="auth-card" aria-live="polite">
          <header>
            <p className="auth-card-eyebrow">Autenticacao</p>
            <h1>{activeMode.title}</h1>
            <p>{activeMode.subtitle}</p>
          </header>

          <div className="auth-switcher" role="tablist" aria-label="Fluxos">
            <button
              className={mode === 'login' ? 'active' : ''}
              onClick={() => changeMode('login')}
              role="tab"
              type="button"
            >
              Entrar
            </button>
            <button
              className={mode === 'register' ? 'active' : ''}
              onClick={() => changeMode('register')}
              role="tab"
              type="button"
            >
              Criar conta
            </button>
          </div>

          {feedback ? (
            <p className={`auth-feedback ${feedback.tone}`}>{feedback.text}</p>
          ) : null}

          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="auth-form">
              <label htmlFor="login-email">E-mail</label>
              <input
                autoComplete="email"
                id="login-email"
                onChange={(event) =>
                  setLoginForm((previous) => ({
                    ...previous,
                    email: event.target.value,
                  }))
                }
                placeholder="voce@empresa.com"
                type="email"
                value={loginForm.email}
              />

              <label htmlFor="login-password">Senha</label>
              <input
                autoComplete="current-password"
                id="login-password"
                onChange={(event) =>
                  setLoginForm((previous) => ({
                    ...previous,
                    password: event.target.value,
                  }))
                }
                placeholder="Digite sua senha"
                type="password"
                value={loginForm.password}
              />

              <button className="auth-primary" disabled={isSubmitting} type="submit">
                {isSubmitting ? 'Entrando...' : 'Entrar'}
              </button>

              <button
                className="auth-link"
                onClick={() => {
                  setForgotEmail(loginForm.email)
                  changeMode('forgot')
                }}
                type="button"
              >
                Esqueci minha senha
              </button>
            </form>
          ) : null}

          {mode === 'register' ? (
            <form onSubmit={handleRegister} className="auth-form">
              <label htmlFor="register-name">Nome</label>
              <input
                autoComplete="name"
                id="register-name"
                onChange={(event) =>
                  setRegisterForm((previous) => ({
                    ...previous,
                    name: event.target.value,
                  }))
                }
                placeholder="Seu nome completo"
                type="text"
                value={registerForm.name}
              />

              <label htmlFor="register-email">E-mail</label>
              <input
                autoComplete="email"
                id="register-email"
                onChange={(event) =>
                  setRegisterForm((previous) => ({
                    ...previous,
                    email: event.target.value,
                  }))
                }
                placeholder="voce@empresa.com"
                type="email"
                value={registerForm.email}
              />

              <div className="auth-form-row">
                <div>
                  <label htmlFor="register-password">Senha</label>
                  <input
                    autoComplete="new-password"
                    id="register-password"
                    onChange={(event) =>
                      setRegisterForm((previous) => ({
                        ...previous,
                        password: event.target.value,
                      }))
                    }
                    placeholder="Crie uma senha"
                    type="password"
                    value={registerForm.password}
                  />
                </div>

                <div>
                  <label htmlFor="register-confirm-password">Confirmar senha</label>
                  <input
                    autoComplete="new-password"
                    id="register-confirm-password"
                    onChange={(event) =>
                      setRegisterForm((previous) => ({
                        ...previous,
                        confirmPassword: event.target.value,
                      }))
                    }
                    placeholder="Repita a senha"
                    type="password"
                    value={registerForm.confirmPassword}
                  />
                </div>
              </div>

              <div className="auth-form-row auth-form-row-cep">
                <div>
                  <label htmlFor="register-cep">CEP</label>
                  <input
                    autoComplete="postal-code"
                    id="register-cep"
                    inputMode="numeric"
                    onBlur={() => {
                      void handleCepLookup({ silent: true })
                    }}
                    onChange={(event) => {
                      updateAddressField('cep', normalizeCep(event.target.value))
                    }}
                    placeholder="00000-000"
                    type="text"
                    value={formatCep(registerForm.address.cep)}
                  />
                </div>

                <button
                  className="auth-secondary"
                  disabled={isSubmitting || isCepLoading}
                  onClick={() => {
                    void handleCepLookup()
                  }}
                  type="button"
                >
                  {isCepLoading ? 'Buscando CEP...' : 'Buscar CEP'}
                </button>
              </div>

              <label htmlFor="register-street">Endereco</label>
              <input
                autoComplete="street-address"
                id="register-street"
                onChange={(event) => {
                  updateAddressField('street', event.target.value)
                }}
                placeholder="Rua/Avenida"
                type="text"
                value={registerForm.address.street}
              />

              <div className="auth-form-row">
                <div>
                  <label htmlFor="register-number">Numero</label>
                  <input
                    autoComplete="off"
                    id="register-number"
                    onChange={(event) => {
                      updateAddressField('number', event.target.value)
                    }}
                    placeholder="123"
                    type="text"
                    value={registerForm.address.number}
                  />
                </div>

                <div>
                  <label htmlFor="register-complement">Complemento</label>
                  <input
                    autoComplete="off"
                    id="register-complement"
                    onChange={(event) => {
                      updateAddressField('complement', event.target.value)
                    }}
                    placeholder="Apto, bloco, sala (opcional)"
                    type="text"
                    value={registerForm.address.complement}
                  />
                </div>
              </div>

              <div className="auth-form-row auth-form-row-city">
                <div>
                  <label htmlFor="register-city">Cidade</label>
                  <input
                    autoComplete="address-level2"
                    id="register-city"
                    onChange={(event) => {
                      updateAddressField('city', event.target.value)
                    }}
                    placeholder="Cidade"
                    type="text"
                    value={registerForm.address.city}
                  />
                </div>

                <div>
                  <label htmlFor="register-state">Estado (UF)</label>
                  <input
                    autoComplete="address-level1"
                    id="register-state"
                    maxLength={2}
                    onChange={(event) => {
                      updateAddressField('state', event.target.value.toUpperCase())
                    }}
                    placeholder="SP"
                    type="text"
                    value={registerForm.address.state}
                  />
                </div>
              </div>

              <button className="auth-primary" disabled={isSubmitting} type="submit">
                {isSubmitting ? 'Criando conta...' : 'Criar conta'}
              </button>
            </form>
          ) : null}

          {mode === 'forgot' ? (
            <form onSubmit={handleForgotPassword} className="auth-form">
              <label htmlFor="forgot-email">E-mail da conta</label>
              <input
                autoComplete="email"
                id="forgot-email"
                onChange={(event) => setForgotEmail(event.target.value)}
                placeholder="voce@empresa.com"
                type="email"
                value={forgotEmail}
              />

              <button className="auth-primary" disabled={isSubmitting} type="submit">
                {isSubmitting ? 'Enviando...' : 'Enviar e-mail de redefinicao'}
              </button>

              <button
                className="auth-link"
                onClick={() => changeMode('login')}
                type="button"
              >
                Voltar para login
              </button>
            </form>
          ) : null}

          <div className="auth-divider">
            <span>ou</span>
          </div>

          <button
            className="auth-google"
            disabled={isSubmitting}
            onClick={handleGoogleSignIn}
            type="button"
          >
            <GoogleIcon />
            Entrar com Google
          </button>
        </section>
      </main>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M21.35 11.1h-9.18v2.98h5.26c-.23 1.52-1.74 4.45-5.26 4.45-3.16 0-5.73-2.62-5.73-5.86s2.57-5.86 5.73-5.86c1.8 0 3 0.77 3.69 1.43l2.51-2.44C16.82 4.37 14.73 3.5 12.17 3.5 7.21 3.5 3.2 7.53 3.2 12.67s4.01 9.17 8.97 9.17c5.18 0 8.61-3.64 8.61-8.76 0-.59-.06-1.03-.15-1.48Z"
        fill="currentColor"
      />
    </svg>
  )
}
