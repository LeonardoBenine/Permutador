export interface CepLookupResult {
  city: string
  district: string
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
    throw new Error('Digite um CEP com 8 números para buscar endereço.')
  }

  const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`)

  if (!response.ok) {
    throw new Error('Não foi possível consultar o CEP no momento. Tente novamente.')
  }

  const data = (await response.json()) as ViaCepResponse

  if (data.erro) {
    throw new Error('CEP não encontrado. Confira os números digitados.')
  }

  return {
    city: data.localidade?.trim() ?? '',
    district: data.bairro?.trim() ?? '',
    state: data.uf?.trim() ?? '',
    street: data.logradouro?.trim() ?? '',
  }
}
