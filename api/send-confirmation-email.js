function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export default async function handler(request, response) {
  const resendApiKey = process.env.RESEND_API_KEY
  const fromEmail =
    process.env.CONFIRMATION_FROM_EMAIL ?? 'Permutador <onboarding@resend.dev>'

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ error: 'Method not allowed' })
  }

  if (!resendApiKey) {
    return response.status(500).json({
      error: 'RESEND_API_KEY is not configured.',
    })
  }

  const { email = '', name = '' } = request.body ?? {}
  const normalizedEmail = String(email).trim().toLowerCase()
  const safeName = escapeHtml(String(name).trim() || 'novo usuario')

  if (!isValidEmail(normalizedEmail)) {
    return response.status(400).json({ error: 'Invalid email.' })
  }

  const resendResponse = await fetch('https://api.resend.com/emails', {
    body: JSON.stringify({
      from: fromEmail,
      html: `
      <main style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
        <h1 style="color: #f26b25;">Bem-vindo ao Permutador</h1>
        <p>Olá, ${safeName}.</p>
        <p>Seu cadastro foi criado com sucesso. Você já pode entrar no Permutador e começar a cadastrar seus carros para encontrar oportunidades de permuta.</p>
        <p style="margin-top: 24px;">Equipe Permutador</p>
      </main>
    `,
      subject: 'Confirmação de cadastro no Permutador',
      text: `Olá, ${String(name).trim() || 'novo usuario'}.\n\nSeu cadastro foi criado com sucesso. Você já pode entrar no Permutador e começar a cadastrar seus carros para encontrar oportunidades de permuta.\n\nEquipe Permutador`,
      to: [normalizedEmail],
    }),
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })

  const result = await resendResponse.json()

  if (!resendResponse.ok) {
    return response.status(502).json({
      error: result?.message ?? 'Resend failed to send email.',
    })
  }

  return response.status(200).json({
    id: result?.id,
    sentAt: new Date().toISOString(),
    to: normalizedEmail,
  })
}
