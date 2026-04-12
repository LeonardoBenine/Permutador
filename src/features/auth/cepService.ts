export interface CepLookupResult {
  city: string
  state: string
  street: string
}

interface ViaCepResponse {
  bairro?: string
  cep?: string
  erro?: boolean
  localidade?: string
  logradouro?: string
  uf?: string
}

export async function lookupAddressByCep(rawCep: string): Promise<CepLookupResult> {
  const cep = rawCep.replace(/\D/g, '')

  if (cep.length !== 8) {
    throw new Error('Digite um CEP com 8 numeros para buscar endereco.')
  }

  const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`)

  if (!response.ok) {
    throw new Error('Nao foi possivel consultar o CEP no momento. Tente novamente.')
  }

  const data = (await response.json()) as ViaCepResponse

  if (data.erro) {
    throw new Error('CEP nao encontrado. Confira os numeros digitados.')
  }

  return {
    city: data.localidade?.trim() ?? '',
    state: data.uf?.trim() ?? '',
    street: data.logradouro?.trim() ?? '',
  }
}
