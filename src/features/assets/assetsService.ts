import type { AuthUser } from '../auth/types'
import type {
  AssetRecord,
  AssetSwipeRecord,
  AssetType,
  EstimatedValueAudit,
  SwipeDecision,
} from './types'

const ASSETS_STORAGE_KEY = 'permutador.assets'
const SWIPES_STORAGE_KEY = 'permutador.asset-swipes'
const ACCOUNTS_STORAGE_KEY = 'permutamatch.auth.accounts'
const FIPE_API_BASE_URL = 'https://parallelum.com.br/fipe/api/v2'

const marketplaceSeedAssets: AssetRecord[] = [
  {
    brand: 'Jeep',
    cep: '01310930',
    city: 'Sao Paulo',
    createdAt: '2026-03-05T14:00:00.000Z',
    description: 'SUV com revisoes em dia e unico dono.',
    estimatedValue: 148000,
    id: 'seed-car-jeep-compass',
    mileage: 32000,
    model: 'Compass Longitude',
    ownerEmail: 'marcos.silva@market.permutador',
    ownerName: 'Marcos Silva',
    photos: [],
    state: 'SP',
    type: 'car',
    year: 2021,
  },
  {
    address: 'Rua das Acacias, 150 - Campinas/SP',
    bathrooms: 3,
    bedrooms: 4,
    builtArea: 215,
    createdAt: '2026-02-21T10:30:00.000Z',
    description: 'Casa em condominio fechado com espaco gourmet.',
    estimatedValue: 890000,
    id: 'seed-house-campinas',
    landArea: 360,
    ownerEmail: 'renata.costa@market.permutador',
    ownerName: 'Renata Costa',
    photos: [],
    type: 'house',
  },
  {
    address: 'Av. Beira Mar, 880 - Florianopolis/SC',
    bathrooms: 2,
    bedrooms: 3,
    builtArea: 120,
    createdAt: '2026-03-14T09:15:00.000Z',
    description: 'Apartamento com vista para o mar e vaga dupla.',
    estimatedValue: 1250000,
    floor: 11,
    id: 'seed-apartment-florianopolis',
    landArea: 120,
    ownerEmail: 'camila.souza@market.permutador',
    ownerName: 'Camila Souza',
    photos: [],
    type: 'apartment',
  },
  {
    address: 'Estrada do Sossego, 0 - Atibaia/SP',
    bathrooms: 0,
    bedrooms: 0,
    createdAt: '2026-01-18T18:45:00.000Z',
    description: 'Terreno plano em area de expansao urbana.',
    estimatedValue: 390000,
    id: 'seed-land-atibaia',
    landArea: 600,
    ownerEmail: 'paulo.nunes@market.permutador',
    ownerName: 'Paulo Nunes',
    photos: [],
    type: 'land',
  },
]

const TEST_USER_EMAIL_ALIASES = new Set([
  'demo@permutador.com.br',
  'test@permutador.com.br',
  'teste@permutador.com.br',
])
const TEST_USER_OWNER_NAME = 'Usuario Teste'

const REGION_FACTOR_BY_STATE: Record<string, number> = {
  AC: -0.012,
  AL: -0.008,
  AM: -0.012,
  AP: -0.012,
  BA: 0,
  CE: 0,
  DF: 0.02,
  ES: 0.005,
  GO: 0.004,
  MA: -0.012,
  MG: 0.01,
  MS: 0,
  MT: 0,
  PA: -0.01,
  PB: -0.008,
  PE: 0,
  PI: -0.012,
  PR: 0.01,
  RJ: 0.02,
  RN: -0.008,
  RO: -0.01,
  RR: -0.012,
  RS: 0.012,
  SC: 0.012,
  SE: -0.008,
  SP: 0.015,
  TO: -0.005,
}

const PROPERTY_SOURCE_TIMEOUT_MS = 12_000
const PROPERTY_MIN_PRICE = 40_000
const PROPERTY_MAX_PRICE = 50_000_000
const PROPERTY_MIN_COMPARABLES = 3

interface StoredAccountLike {
  address?: {
    state?: string
  }
  email?: string
}

interface FipeNamedCode {
  code: string
  name: string
}

interface FipeVehicleInfo {
  brand: string
  codeFipe: string
  fuel: string
  model: string
  modelYear: number
  price: string
  referenceMonth: string
}

type PropertyType = 'apartment' | 'house' | 'land'
type PropertyProviderId = 'zapimoveis' | 'vivareal' | 'quintoandar' | 'imovelweb'

interface PropertySource {
  id: PropertyProviderId
  name: string
  weight: number
}

interface PropertyComparable {
  area: number
  bathrooms: number | null
  bedrooms: number | null
  price: number
  provider: PropertySource
  rawText: string
  type: PropertyType | 'unknown'
}

interface PropertyComparableTarget {
  area: number
  city: string
  district: string
  state: string
  street: string
  type: PropertyType
}

interface PropertyComparableScored extends PropertyComparable {
  score: number
}

const PROPERTY_SOURCES: PropertySource[] = [
  { id: 'zapimoveis', name: 'Zap Imoveis', weight: 1 },
  { id: 'vivareal', name: 'Viva Real', weight: 1 },
  { id: 'quintoandar', name: 'QuintoAndar', weight: 0.9 },
  { id: 'imovelweb', name: 'Imovelweb', weight: 0.8 },
]

let cachedCarBrands: FipeNamedCode[] | null = null
const cachedCarModelsByBrand = new Map<string, FipeNamedCode[]>()
const cachedCarYearsByModel = new Map<string, FipeNamedCode[]>()

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function formatCurrencyLabel(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    currency: 'BRL',
    style: 'currency',
  }).format(value)
}

function formatFactorPercent(value: number): string {
  const percent = (value * 100).toFixed(2)
  return `${value >= 0 ? '+' : ''}${percent}%`
}

function createSeedPhoto(label: string, accentColor: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 520"><defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${accentColor}"/><stop offset="100%" stop-color="#1b1f2a"/></linearGradient></defs><rect width="800" height="520" fill="url(#bg)"/><text x="50%" y="48%" fill="white" font-family="Arial, sans-serif" font-size="56" text-anchor="middle">${label}</text><text x="50%" y="60%" fill="white" fill-opacity="0.8" font-family="Arial, sans-serif" font-size="26" text-anchor="middle">PermutaMatch</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const TEST_USER_SEED_PHOTOS: Record<AssetType, string> = {
  apartment: createSeedPhoto('Apartamento', '#6b46c1'),
  car: createSeedPhoto('Carro', '#0f766e'),
  house: createSeedPhoto('Casa', '#b45309'),
  land: createSeedPhoto('Terreno', '#15803d'),
}

const wait = (milliseconds = 500): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds)
  })

function normalizeAssetAudit(value: unknown): EstimatedValueAudit | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const audit = value as Partial<EstimatedValueAudit>

  if (
    typeof audit.baseValue !== 'number' ||
    !Number.isFinite(audit.baseValue) ||
    typeof audit.confidence !== 'number' ||
    !Number.isFinite(audit.confidence) ||
    typeof audit.method !== 'string' ||
    typeof audit.quotedAt !== 'string' ||
    typeof audit.region !== 'string' ||
    typeof audit.source !== 'string' ||
    !audit.adjustments ||
    typeof audit.adjustments !== 'object'
  ) {
    return null
  }

  const adjustments = audit.adjustments as Partial<EstimatedValueAudit['adjustments']>

  if (
    typeof adjustments.kmFactor !== 'number' ||
    typeof adjustments.regionFactor !== 'number' ||
    typeof adjustments.totalFactor !== 'number' ||
    typeof adjustments.yearFactor !== 'number'
  ) {
    return null
  }

  return {
    adjustments: {
      kmFactor: adjustments.kmFactor,
      regionFactor: adjustments.regionFactor,
      totalFactor: adjustments.totalFactor,
      yearFactor: adjustments.yearFactor,
    },
    baseValue: audit.baseValue,
    confidence: clamp(audit.confidence, 0, 1),
    memory: Array.isArray(audit.memory)
      ? audit.memory.filter((item): item is string => typeof item === 'string')
      : undefined,
    method:
      audit.method === 'fipe_api_v2_adjusted'
        ? 'fipe_api_v2_adjusted'
        : audit.method === 'property_market_comparables'
          ? 'property_market_comparables'
        : audit.method === 'property_public_base_adjusted'
          ? 'property_public_base_adjusted'
          : 'manual_fallback',
    quotedAt: audit.quotedAt,
    region: audit.region,
    source: audit.source,
    vehicleContext:
      audit.vehicleContext && typeof audit.vehicleContext === 'object'
        ? {
            brand:
              typeof audit.vehicleContext.brand === 'string'
                ? audit.vehicleContext.brand
                : undefined,
            codeFipe:
              typeof audit.vehicleContext.codeFipe === 'string'
                ? audit.vehicleContext.codeFipe
                : undefined,
            fuel:
              typeof audit.vehicleContext.fuel === 'string'
                ? audit.vehicleContext.fuel
                : undefined,
            model:
              typeof audit.vehicleContext.model === 'string'
                ? audit.vehicleContext.model
                : undefined,
            referenceMonth:
              typeof audit.vehicleContext.referenceMonth === 'string'
                ? audit.vehicleContext.referenceMonth
                : undefined,
            yearCode:
              typeof audit.vehicleContext.yearCode === 'string'
                ? audit.vehicleContext.yearCode
                : undefined,
          }
        : undefined,
  }
}

function shouldRepairCarModel(value: string): boolean {
  const normalized = value.trim()
  const normalizedLower = normalized.toLowerCase().replace(/\s+/g, ' ')

  if (!normalized) {
    return true
  }

  // Historical corrupted records used "3200" from fallback constants.
  if (normalized === '3200') {
    return true
  }

  // Numeric-only high values are unlikely to be a valid car model label.
  if (/^\d+$/.test(normalized)) {
    const parsed = Number(normalized)
    return Number.isFinite(parsed) && parsed >= 10000
  }

  // Corrupted labels like "32000 flex" should not be used as model names.
  if (
    /^\d{4,}\s*(flex|gasolina|diesel|etanol|alcool|álcool|eletrico|elétrico|hibrido|híbrido|gnv)\b/.test(
      normalizedLower,
    )
  ) {
    return true
  }

  return false
}

function normalizeAsset(value: unknown): AssetRecord | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const asset = value as Partial<AssetRecord> & {
    estimatedValueAudit?: unknown
    photos?: unknown
  }

  if (!asset.type || !asset.id || !asset.createdAt || !asset.ownerEmail || !asset.ownerName) {
    return null
  }

  const estimatedValue =
    typeof asset.estimatedValue === 'number' &&
    Number.isFinite(asset.estimatedValue) &&
    asset.estimatedValue >= 0
      ? asset.estimatedValue
      : 0

  const normalizedCity =
    typeof (asset as { city?: unknown }).city === 'string'
      ? ((asset as { city: string }).city ?? '').trim()
      : ''
  const normalizedState =
    typeof (asset as { state?: unknown }).state === 'string'
      ? ((asset as { state: string }).state ?? '').trim().toUpperCase()
      : ''
  const normalizedCep =
    typeof (asset as { cep?: unknown }).cep === 'string'
      ? ((asset as { cep: string }).cep ?? '').replace(/\D/g, '').slice(0, 8)
      : ''
  const normalizedAudit = normalizeAssetAudit(asset.estimatedValueAudit)
  const rawCarModel =
    typeof (asset as { model?: unknown }).model === 'string'
      ? ((asset as { model: string }).model ?? '').trim()
      : ''
  const auditCarModel = normalizedAudit?.vehicleContext?.model?.trim() ?? ''
  const normalizedCarModel = shouldRepairCarModel(rawCarModel)
    ? shouldRepairCarModel(auditCarModel)
      ? ''
      : auditCarModel
    : rawCarModel

  const normalizedAsset = {
    ...(asset as AssetRecord),
    estimatedValue,
    estimatedValueAudit: normalizedAudit,
    photos: Array.isArray(asset.photos)
      ? asset.photos.filter((item): item is string => typeof item === 'string')
      : [],
  }

  if (asset.type === 'car') {
    return {
      ...normalizedAsset,
      cep: normalizedCep,
      city: normalizedCity,
      model: normalizedCarModel,
      state: normalizedState,
    } as AssetRecord
  }

  return normalizedAsset
}

function normalizeSwipe(value: unknown): AssetSwipeRecord | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const swipe = value as Partial<AssetSwipeRecord>

  if (
    !swipe.id ||
    !swipe.createdAt ||
    !swipe.ownerEmail ||
    !swipe.ownAssetId ||
    !swipe.targetAssetId
  ) {
    return null
  }

  if (swipe.decision !== 'like' && swipe.decision !== 'pass') {
    return null
  }

  return {
    createdAt: swipe.createdAt,
    decision: swipe.decision,
    id: swipe.id,
    ownerEmail: swipe.ownerEmail.trim().toLowerCase(),
    ownAssetId: swipe.ownAssetId,
    targetAssetId: swipe.targetAssetId,
  }
}

function readAssets(): AssetRecord[] {
  const serialized = localStorage.getItem(ASSETS_STORAGE_KEY)

  if (!serialized) {
    return []
  }

  try {
    const parsed = JSON.parse(serialized) as unknown[]
    const normalized = parsed
      .map((item) => normalizeAsset(item))
      .filter((item): item is AssetRecord => Boolean(item))

    writeAssets(normalized)

    return normalized
  } catch {
    return []
  }
}

function writeAssets(assets: AssetRecord[]) {
  localStorage.setItem(ASSETS_STORAGE_KEY, JSON.stringify(assets))
}

function readSwipes(): AssetSwipeRecord[] {
  const serialized = localStorage.getItem(SWIPES_STORAGE_KEY)

  if (!serialized) {
    return []
  }

  try {
    const parsed = JSON.parse(serialized) as unknown[]
    const normalized = parsed
      .map((item) => normalizeSwipe(item))
      .filter((item): item is AssetSwipeRecord => Boolean(item))

    writeSwipes(normalized)

    return normalized
  } catch {
    return []
  }
}

function writeSwipes(swipes: AssetSwipeRecord[]) {
  localStorage.setItem(SWIPES_STORAGE_KEY, JSON.stringify(swipes))
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function normalizeComparableText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function scoreTextMatch(candidate: string, target: string): number {
  const normalizedCandidate = normalizeComparableText(candidate)
  const normalizedTarget = normalizeComparableText(target)

  if (!normalizedCandidate || !normalizedTarget) {
    return 0
  }

  if (normalizedCandidate === normalizedTarget) {
    return 1
  }

  if (
    normalizedCandidate.includes(normalizedTarget) ||
    normalizedTarget.includes(normalizedCandidate)
  ) {
    const minLength = Math.min(normalizedCandidate.length, normalizedTarget.length)
    const maxLength = Math.max(normalizedCandidate.length, normalizedTarget.length)
    return 0.75 + (minLength / maxLength) * 0.2
  }

  const candidateTokens = normalizedCandidate.split(' ').filter(Boolean)
  const targetTokens = normalizedTarget.split(' ').filter(Boolean)

  if (candidateTokens.length === 0 || targetTokens.length === 0) {
    return 0
  }

  const targetSet = new Set(targetTokens)
  const matches = candidateTokens.filter((token) => targetSet.has(token)).length
  const tokenScore = matches / targetSet.size

  return tokenScore * 0.65
}

function pickBestByName(
  items: FipeNamedCode[],
  targetName: string,
): { score: number; value: FipeNamedCode | null } {
  let best: FipeNamedCode | null = null
  let bestScore = 0

  for (const item of items) {
    const score = scoreTextMatch(item.name, targetName)

    if (score > bestScore) {
      bestScore = score
      best = item
    }
  }

  return { score: bestScore, value: best }
}

function pickBestYear(
  years: FipeNamedCode[],
  targetYear: number,
): { score: number; value: FipeNamedCode | null } {
  const exact = years.find((year) => year.code.startsWith(`${targetYear}-`))

  if (exact) {
    return { score: 1, value: exact }
  }

  let best: FipeNamedCode | null = null
  let bestDiff = Number.POSITIVE_INFINITY

  for (const year of years) {
    const parsedYear = Number(year.code.split('-')[0])

    if (Number.isNaN(parsedYear)) {
      continue
    }

    const diff = Math.abs(parsedYear - targetYear)

    if (diff < bestDiff) {
      bestDiff = diff
      best = year
    }
  }

  if (!best || !Number.isFinite(bestDiff)) {
    return { score: 0, value: null }
  }

  return {
    score: clamp(1 - bestDiff * 0.12, 0.35, 0.9),
    value: best,
  }
}

function parsePriceToNumber(value: string): number {
  const cleaned = value.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')
  return Number(cleaned)
}

function getOwnerState(ownerEmail: string): string {
  const serialized = localStorage.getItem(ACCOUNTS_STORAGE_KEY)

  if (!serialized) {
    return ''
  }

  try {
    const parsed = JSON.parse(serialized) as StoredAccountLike[]
    const normalizedOwnerEmail = normalizeEmail(ownerEmail)

    const account = parsed.find(
      (item) => normalizeEmail(item.email ?? '') === normalizedOwnerEmail,
    )

    const state = account?.address?.state?.trim().toUpperCase() ?? ''

    if (state.length === 2) {
      return state
    }

    return ''
  } catch {
    return ''
  }
}

function calculatePriceWithAdjustments(payload: {
  baseValue: number
  mileage: number
  ownerState: string
  year: number
}) {
  const currentYear = new Date().getFullYear()
  const age = Math.max(0, currentYear - payload.year)
  const expectedMileage = Math.max(5000, age * 12000)
  const kmFactor = clamp(((expectedMileage - payload.mileage) / 1000) * 0.0015, -0.16, 0.12)
  const yearFactor = clamp(-age * 0.0025, -0.08, 0)
  const regionFactor = REGION_FACTOR_BY_STATE[payload.ownerState] ?? 0
  const totalFactor = clamp(kmFactor + yearFactor + regionFactor, -0.25, 0.2)

  const adjustedValue = Math.max(1000, Math.round(payload.baseValue * (1 + totalFactor)))

  return {
    adjustedValue,
    adjustments: {
      kmFactor,
      regionFactor,
      totalFactor,
      yearFactor,
    },
  }
}

function parseCityAndStateFromAddress(
  address: string,
): { city: string; state: string } {
  const trimmed = address.trim()

  if (!trimmed) {
    return { city: '', state: '' }
  }

  const endPattern = /(?:-|,)\s*([^,/-]+?)\s*\/\s*([a-z]{2})\s*$/i
  const endMatch = trimmed.match(endPattern)

  if (!endMatch) {
    return { city: '', state: '' }
  }

  return {
    city: (endMatch[1] ?? '').trim(),
    state: ((endMatch[2] ?? '').trim() || '').toUpperCase(),
  }
}

function normalizeFipeZapCity(city: string): string {
  return city
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

function toCitySlug(value: string): string {
  const normalized = normalizeFipeZapCity(value)
  return normalized.replace(/\s+/g, '-')
}

function parsePropertyAddressParts(address: string): {
  city: string
  district: string
  number: string
  state: string
  street: string
} {
  const trimmed = address.trim()

  if (!trimmed) {
    return {
      city: '',
      district: '',
      number: '',
      state: '',
      street: '',
    }
  }

  const cityState = parseCityAndStateFromAddress(trimmed)
  const city = cityState.city
  const state = cityState.state
  const cityStatePattern = /(?:-|,)\s*([^,/-]+?)\s*\/\s*[a-z]{2}\s*$/i
  const withoutCityState = trimmed.replace(cityStatePattern, '').trim()
  const sections = withoutCityState
    .split('-')
    .map((section) => section.trim())
    .filter(Boolean)
  const streetAndNumber = sections[0] ?? ''
  const district = sections[1] ?? ''
  const streetNumberMatch = streetAndNumber.match(/^(.*?)(?:,\s*|\s+)(\d+[a-z0-9/-]*)$/i)
  const street = streetNumberMatch?.[1]?.trim() || streetAndNumber.split(',')[0]?.trim() || streetAndNumber
  const number = streetNumberMatch?.[2]?.trim() ?? ''

  return { city, district, number, state, street }
}

function inferPropertyTypeFromSnippet(value: string): PropertyType | 'unknown' {
  const normalized = normalizeComparableText(value)

  if (!normalized) {
    return 'unknown'
  }

  if (/\b(terreno|lote|lotes|loteamento)\b/.test(normalized)) {
    return 'land'
  }

  if (/\b(apartamento|kitnet|studio|cobertura|flat)\b/.test(normalized)) {
    return 'apartment'
  }

  if (/\b(casa|sobrado|condominio)\b/.test(normalized)) {
    return 'house'
  }

  return 'unknown'
}

function parseComparableNumberRange(value: string): number | null {
  const numbers = value
    .split('-')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0)

  if (numbers.length === 0) {
    return null
  }

  if (numbers.length === 1) {
    return numbers[0]
  }

  return (numbers[0] + numbers[1]) / 2
}

function parseAreaFromComparableSnippet(value: string): number | null {
  const areaMatch = value.match(
    /(\d{1,4}(?:\s*-\s*\d{1,4})?)\s*(?:m²|m2|m\s*2|metros?\s+quadrados?)/i,
  )

  if (!areaMatch) {
    return null
  }

  return parseComparableNumberRange(areaMatch[1].replace(/\s+/g, ''))
}

function parseCountFromComparableSnippet(
  value: string,
  singular: string,
  plural = `${singular}s`,
): number | null {
  const match = value.match(
    new RegExp(
      `(\\d{1,2})(?:\\s*-\\s*\\d{1,2})?\\s*${singular}|(\\d{1,2})(?:\\s*-\\s*\\d{1,2})?\\s*${plural}`,
      'i',
    ),
  )
  const extracted = match?.[1] ?? match?.[2]

  if (!extracted) {
    return null
  }

  const parsed = Number(extracted)

  return Number.isFinite(parsed) ? parsed : null
}

function sanitizeComparableSourceText(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function looksLikeBlockedSourceResponse(value: string): boolean {
  const normalized = normalizeComparableText(value)

  if (!normalized) {
    return true
  }

  return (
    normalized.includes('performing security verification') ||
    normalized.includes('just a moment') ||
    normalized.includes('captcha') ||
    normalized.includes('access denied')
  )
}

function hasComparableMarketData(value: string): boolean {
  const hasPrice = /R\$\s?\d/.test(value)
  const hasArea =
    /(?:\bm²\b|\bm2\b|\bm\s*2\b|metros?\s+quadrados?)/i.test(value) ||
    /(\d{1,4}(?:\s*-\s*\d{1,4})?)\s*m²/i.test(value)

  return hasPrice && hasArea
}

function buildPropertySearchUrls(payload: {
  city: string
  state: string
  type: PropertyType
}): Array<{ provider: PropertySource; url: string }> {
  const citySlug = toCitySlug(payload.city)
  const stateLower = payload.state.toLowerCase()

  if (!citySlug || stateLower.length !== 2) {
    return []
  }

  const byType: Record<
    PropertyType,
    {
      imovelweb: string
      quintoandar: string
      vivareal: string
      zapimoveis: string
    }
  > = {
    apartment: {
      imovelweb: `https://www.imovelweb.com.br/apartamentos-venda-${citySlug}-${stateLower}.html`,
      quintoandar: `https://www.quintoandar.com.br/comprar/imovel/${citySlug}-${stateLower}-brasil/apartamento`,
      vivareal: `https://www.vivareal.com.br/venda/${stateLower}/${citySlug}/apartamento_residencial/`,
      zapimoveis: `https://www.zapimoveis.com.br/venda/apartamentos/${stateLower}+${citySlug}/`,
    },
    house: {
      imovelweb: `https://www.imovelweb.com.br/casas-venda-${citySlug}-${stateLower}.html`,
      quintoandar: `https://www.quintoandar.com.br/comprar/imovel/${citySlug}-${stateLower}-brasil/casa`,
      vivareal: `https://www.vivareal.com.br/venda/${stateLower}/${citySlug}/casa_residencial/`,
      zapimoveis: `https://www.zapimoveis.com.br/venda/casas/${stateLower}+${citySlug}/`,
    },
    land: {
      imovelweb: `https://www.imovelweb.com.br/terrenos-venda-${citySlug}-${stateLower}.html`,
      quintoandar: `https://www.quintoandar.com.br/comprar/imovel/${citySlug}-${stateLower}-brasil`,
      vivareal: `https://www.vivareal.com.br/venda/${stateLower}/${citySlug}/lote-terreno_residencial/`,
      zapimoveis: `https://www.zapimoveis.com.br/venda/terrenos-lotes-condominios/${stateLower}+${citySlug}/`,
    },
  }

  const urlsForType = byType[payload.type]

  return PROPERTY_SOURCES.map((provider) => ({
    provider,
    url: urlsForType[provider.id],
  }))
}

async function fetchTextWithTimeout(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => {
    controller.abort()
  }, timeoutMs)

  try {
    const response = await fetch(url, { signal: controller.signal })

    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`)
    }

    return await response.text()
  } finally {
    window.clearTimeout(timeoutId)
  }
}

function buildJinaMirrorUrl(targetUrl: string): string {
  const withoutProtocol = targetUrl.replace(/^https?:\/\//i, '')
  return `https://r.jina.ai/http://${withoutProtocol}`
}

async function fetchComparableSourceContent(targetUrl: string): Promise<string> {
  const mirrors = [
    buildJinaMirrorUrl(targetUrl),
    `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
  ]

  for (const mirrorUrl of mirrors) {
    try {
      const content = await fetchTextWithTimeout(mirrorUrl, PROPERTY_SOURCE_TIMEOUT_MS)
      const normalizedContent = sanitizeComparableSourceText(content)

      if (looksLikeBlockedSourceResponse(normalizedContent)) {
        continue
      }

      if (!hasComparableMarketData(normalizedContent)) {
        continue
      }

      return normalizedContent
    } catch {
      continue
    }
  }

  throw new Error('Comparable source unavailable')
}

function extractComparablesFromContent(
  content: string,
  provider: PropertySource,
): PropertyComparable[] {
  const comparables: PropertyComparable[] = []
  const dedupe = new Set<string>()
  const priceRegex = /R\$\s?(\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d{4,}(?:,\d{2})?)/gi
  let match = priceRegex.exec(content)

  while (match) {
    const fullPrice = match[0]
    const startIndex = match.index
    const rawPrice = parsePriceToNumber(fullPrice)

    if (
      Number.isFinite(rawPrice) &&
      rawPrice >= PROPERTY_MIN_PRICE &&
      rawPrice <= PROPERTY_MAX_PRICE
    ) {
      const beforePrice = content.slice(Math.max(0, startIndex - 24), startIndex).toLowerCase()
      const afterPrice = content
        .slice(startIndex + fullPrice.length, startIndex + fullPrice.length + 24)
        .toLowerCase()
      const isCondoOrTax =
        beforePrice.includes('cond') ||
        beforePrice.includes('iptu') ||
        afterPrice.includes('cond') ||
        afterPrice.includes('iptu')

      if (!isCondoOrTax) {
        const snippetStart = Math.max(0, startIndex - 520)
        const snippetEnd = Math.min(content.length, startIndex + 420)
        const snippet = content.slice(snippetStart, snippetEnd)
        const area = parseAreaFromComparableSnippet(snippet)

        if (area !== null && area >= 15) {
          const bedrooms =
            parseCountFromComparableSnippet(snippet, 'quarto') ??
            parseCountFromComparableSnippet(snippet, 'dormitorio') ??
            parseCountFromComparableSnippet(snippet, 'dorm') ??
            null
          const bathrooms =
            parseCountFromComparableSnippet(snippet, 'banheiro') ??
            parseCountFromComparableSnippet(snippet, 'banho') ??
            null
          const inferredType = inferPropertyTypeFromSnippet(snippet)
          const dedupeKey = `${provider.id}|${rawPrice}|${Math.round(area)}|${bedrooms ?? '-'}|${bathrooms ?? '-'}|${inferredType}`

          if (!dedupe.has(dedupeKey)) {
            dedupe.add(dedupeKey)
            comparables.push({
              area,
              bathrooms,
              bedrooms,
              price: rawPrice,
              provider,
              rawText: snippet,
              type: inferredType,
            })
          }
        }
      }
    }

    match = priceRegex.exec(content)
  }

  return comparables
}

function scoreComparableAgainstTarget(
  comparable: PropertyComparable,
  target: PropertyComparableTarget,
): number {
  const areaScore =
    target.area > 0
      ? clamp(1 - Math.abs(comparable.area - target.area) / target.area, 0, 1)
      : 0.45
  const typeScore =
    comparable.type === target.type ? 1 : comparable.type === 'unknown' ? 0.5 : 0.1
  const cityScore = target.city ? scoreTextMatch(comparable.rawText, target.city) : 0
  const districtScore = target.district ? scoreTextMatch(comparable.rawText, target.district) : 0
  const streetScore = target.street ? scoreTextMatch(comparable.rawText, target.street) : 0
  const stateScore =
    target.state && normalizeComparableText(comparable.rawText).includes(target.state.toLowerCase())
      ? 0.18
      : 0
  const locationScore = clamp(
    cityScore * 0.34 + districtScore * 0.38 + streetScore * 0.28 + stateScore,
    0,
    1,
  )
  const score = clamp(areaScore * 0.55 + locationScore * 0.3 + typeScore * 0.15, 0, 1)

  return score * comparable.provider.weight
}

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) {
    return 0
  }

  const safeP = clamp(p, 0, 1)
  const position = (sortedValues.length - 1) * safeP
  const lowerIndex = Math.floor(position)
  const upperIndex = Math.ceil(position)

  if (lowerIndex === upperIndex) {
    return sortedValues[lowerIndex]
  }

  const weight = position - lowerIndex
  return sortedValues[lowerIndex] * (1 - weight) + sortedValues[upperIndex] * weight
}

async function estimatePropertyValue(payload: {
  address?: string
  bathrooms?: number
  bedrooms?: number
  builtArea?: number
  floor?: number
  landArea: number
  ownerEmail: string
  type: PropertyType
}): Promise<{
  audit: EstimatedValueAudit
  confidence: number
  estimatedValue: number
  quotedAt: string
  source: string
}> {
  const ownerState = getOwnerState(payload.ownerEmail)
  const addressParts = parsePropertyAddressParts(payload.address ?? '')
  const resolvedState =
    addressParts.state.length === 2
      ? addressParts.state
      : ownerState.length === 2
        ? ownerState
        : ''
  const city = addressParts.city

  if (!city || resolvedState.length !== 2) {
    throw new Error('Endereco insuficiente para comparacao de mercado')
  }

  const targetArea =
    payload.type === 'land'
      ? Math.max(0, payload.landArea)
      : Math.max(0, payload.builtArea ?? 0)

  if (!Number.isFinite(targetArea) || targetArea <= 0) {
    throw new Error('Area invalida para comparacao')
  }

  const target: PropertyComparableTarget = {
    area: targetArea,
    city,
    district: addressParts.district,
    state: resolvedState,
    street: addressParts.street,
    type: payload.type,
  }

  const searchUrls = buildPropertySearchUrls({
    city,
    state: resolvedState,
    type: payload.type,
  })

  const comparableResult = await Promise.allSettled(
    searchUrls.map(async ({ provider, url }) => {
      const content = await fetchComparableSourceContent(url)
      return extractComparablesFromContent(content, provider)
    }),
  )

  const allComparables = comparableResult.flatMap((result) =>
    result.status === 'fulfilled' ? result.value : [],
  )

  const compatibleComparables = allComparables.filter(
    (comparable) => comparable.type === payload.type || comparable.type === 'unknown',
  )
  const rankedComparables: PropertyComparableScored[] = compatibleComparables
    .map((comparable) => ({
      ...comparable,
      score: scoreComparableAgainstTarget(comparable, target),
    }))
    .filter((comparable) => comparable.score > 0)
    .sort((a, b) => b.score - a.score)

  const strictSelection = rankedComparables.filter((comparable) => comparable.score >= 0.45).slice(0, 36)
  const primarySelection = rankedComparables.filter((comparable) => comparable.score >= 0.3).slice(0, 36)
  const relaxedSelection = rankedComparables.filter((comparable) => comparable.score >= 0.18).slice(0, 36)
  const fallbackSelection = rankedComparables.slice(0, 36)
  const selectedComparables =
    strictSelection.length >= PROPERTY_MIN_COMPARABLES
      ? strictSelection
      : primarySelection.length >= PROPERTY_MIN_COMPARABLES
        ? primarySelection
        : relaxedSelection.length >= PROPERTY_MIN_COMPARABLES
          ? relaxedSelection
          : fallbackSelection

  if (selectedComparables.length === 0) {
    throw new Error('Nao foi possivel encontrar comparaveis de mercado para esse perfil de imovel')
  }

  const scoredPricePerM2 = selectedComparables
    .map((comparable) => ({
      pricePerM2: comparable.price / comparable.area,
      score: comparable.score,
    }))
    .filter(
      (item) => Number.isFinite(item.pricePerM2) && item.pricePerM2 > 150 && item.pricePerM2 < 120000,
    )

  if (scoredPricePerM2.length === 0) {
    throw new Error('Nao foi possivel obter preco medio por metro quadrado')
  }

  const sortedPricePerM2 = [...scoredPricePerM2]
    .map((item) => item.pricePerM2)
    .sort((a, b) => a - b)
  const lowerBound = percentile(sortedPricePerM2, 0.12)
  const upperBound = percentile(sortedPricePerM2, 0.88)
  const trimmedPricePerM2 = scoredPricePerM2.filter(
    (item) => item.pricePerM2 >= lowerBound && item.pricePerM2 <= upperBound,
  )
  const finalPricePerM2 = (trimmedPricePerM2.length > 0 ? trimmedPricePerM2 : scoredPricePerM2).reduce(
    (accumulator, item) => {
      const weight = Math.max(0.14, item.score)

      return {
        total: accumulator.total + item.pricePerM2 * weight,
        weight: accumulator.weight + weight,
      }
    },
    { total: 0, weight: 0 },
  )

  if (!Number.isFinite(finalPricePerM2.total) || finalPricePerM2.weight <= 0) {
    throw new Error('Falha ao consolidar comparaveis')
  }

  const pricePerM2 = finalPricePerM2.total / finalPricePerM2.weight
  const estimatedValue = Math.max(20000, Math.round(pricePerM2 * targetArea))
  const quotedAt = new Date().toISOString()
  const sourceNames = Array.from(new Set(selectedComparables.map((item) => item.provider.name)))
  const source = `Comparaveis de mercado por m2: ${sourceNames.join(', ')}`
  const avgScore =
    selectedComparables.reduce((sum, item) => sum + item.score, 0) / selectedComparables.length
  const isLowCoverage = selectedComparables.length < PROPERTY_MIN_COMPARABLES
  const lowCoveragePenalty = isLowCoverage
    ? (PROPERTY_MIN_COMPARABLES - selectedComparables.length + 1) * 0.08
    : 0
  const confidence = clamp(
    0.32 +
      Math.min(selectedComparables.length, 20) * 0.018 +
      sourceNames.length * 0.1 +
      avgScore * 0.24 -
      lowCoveragePenalty,
    isLowCoverage ? 0.22 : 0.32,
    0.96,
  )
  const regionLabel = `${city}/${resolvedState}`
  const memory = [
    `Metodo: media de preco por m2 em anuncios similares (${payload.type}).`,
    `Comparaveis analisados: ${selectedComparables.length}`,
    `Fontes utilizadas: ${sourceNames.join(', ')}`,
    `Preco medio ajustado por m2: ${formatCurrencyLabel(pricePerM2)}`,
    `Area considerada (${payload.type === 'land' ? 'terreno' : 'construida'}): ${targetArea} m2`,
    `Valor estimado por comparacao: ${formatCurrencyLabel(estimatedValue)}`,
  ]
  if (isLowCoverage) {
    memory.push('Amostra de comparaveis reduzida; o valor pode variar conforme novas ofertas.')
  }

  return {
    audit: {
      adjustments: {
        kmFactor: 0,
        regionFactor: 0,
        totalFactor: 0,
        yearFactor: 0,
      },
      baseValue: Math.round(pricePerM2 * targetArea),
      confidence,
      memory,
      method: 'property_market_comparables',
      quotedAt,
      region: regionLabel,
      source,
    },
    confidence,
    estimatedValue,
    quotedAt,
    source,
  }
}
async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`FIPE API request failed (${response.status})`)
  }

  return (await response.json()) as T
}

async function listCarBrandsFromFipe(): Promise<FipeNamedCode[]> {
  if (cachedCarBrands) {
    return cachedCarBrands
  }

  const brands = await fetchJson<FipeNamedCode[]>(`${FIPE_API_BASE_URL}/cars/brands`)
  cachedCarBrands = brands
  return brands
}

async function listCarModelsFromFipe(brandId: string): Promise<FipeNamedCode[]> {
  if (cachedCarModelsByBrand.has(brandId)) {
    return cachedCarModelsByBrand.get(brandId) ?? []
  }

  const models = await fetchJson<FipeNamedCode[]>(
    `${FIPE_API_BASE_URL}/cars/brands/${brandId}/models`,
  )
  cachedCarModelsByBrand.set(brandId, models)
  return models
}

async function listCarYearsFromFipe(
  brandId: string,
  modelId: string,
): Promise<FipeNamedCode[]> {
  const cacheKey = `${brandId}:${modelId}`

  if (cachedCarYearsByModel.has(cacheKey)) {
    return cachedCarYearsByModel.get(cacheKey) ?? []
  }

  const years = await fetchJson<FipeNamedCode[]>(
    `${FIPE_API_BASE_URL}/cars/brands/${brandId}/models/${modelId}/years`,
  )
  cachedCarYearsByModel.set(cacheKey, years)
  return years
}

function buildManualFallbackAudit(payload: {
  adjustedValue: number
  adjustments: EstimatedValueAudit['adjustments']
  manualEstimatedValue?: number
  regionLabel: string
  year: number
}): { audit: EstimatedValueAudit; estimatedValue: number } {
  const baseValue = payload.manualEstimatedValue ?? Math.max(18000, (2030 - payload.year) * 3200)
  const baseSourceLabel = payload.manualEstimatedValue
    ? 'valor informado manualmente'
    : 'heuristica de ano/modelo (fallback)'
  const memory = [
    `Base (${baseSourceLabel}): ${formatCurrencyLabel(baseValue)}`,
    `Ajuste de km: ${formatFactorPercent(payload.adjustments.kmFactor)}`,
    `Ajuste de ano: ${formatFactorPercent(payload.adjustments.yearFactor)}`,
    `Ajuste de regiao (${payload.regionLabel}): ${formatFactorPercent(
      payload.adjustments.regionFactor,
    )}`,
    `Fator total: ${formatFactorPercent(payload.adjustments.totalFactor)}`,
    `Valor final estimado: ${formatCurrencyLabel(payload.adjustedValue)}`,
  ]

  return {
    audit: {
      adjustments: payload.adjustments,
      baseValue,
      confidence: payload.manualEstimatedValue ? 0.45 : 0.3,
      memory,
      method: 'manual_fallback',
      quotedAt: new Date().toISOString(),
      region: payload.regionLabel,
      source: payload.manualEstimatedValue
        ? 'Manual value with local adjustment'
        : 'Heuristic fallback without FIPE quote',
    },
    estimatedValue: payload.adjustedValue,
  }
}

async function estimateCarValueWithFipe(payload: {
  brand: string
  brandId?: string
  carCity?: string
  carState?: string
  manualEstimatedValue?: number
  mileage: number
  model: string
  modelId?: string
  ownerEmail: string
  yearCode?: string
  year: number
}): Promise<{ audit: EstimatedValueAudit; estimatedValue: number }> {
  const ownerState = getOwnerState(payload.ownerEmail)
  const carState = payload.carState?.trim().toUpperCase() ?? ''
  const regionState =
    carState.length === 2 ? carState : ownerState.length === 2 ? ownerState : ''
  const carCity = payload.carCity?.trim() ?? ''
  const regionLabel = carCity
    ? `${carCity}/${regionState || 'BR'}`
    : regionState || 'BR'

  try {
    const brands = await listCarBrandsFromFipe()
    let brandCode = payload.brandId?.trim() ?? ''
    let brandScore = 1

    if (!brandCode) {
      const brandMatch = pickBestByName(brands, payload.brand)

      if (!brandMatch.value || brandMatch.score < 0.45) {
        throw new Error('Brand not found in FIPE')
      }

      brandCode = brandMatch.value.code
      brandScore = brandMatch.score
    } else if (!brands.some((brand) => brand.code === brandCode)) {
      throw new Error('Invalid brand id')
    }

    const models = await listCarModelsFromFipe(brandCode)
    let modelCode = payload.modelId?.trim() ?? ''
    let modelScore = 1

    if (!modelCode) {
      const modelMatch = pickBestByName(models, payload.model)

      if (!modelMatch.value || modelMatch.score < 0.42) {
        throw new Error('Model not found in FIPE')
      }

      modelCode = modelMatch.value.code
      modelScore = modelMatch.score
    } else if (!models.some((model) => model.code === modelCode)) {
      throw new Error('Invalid model id')
    }

    const years = await listCarYearsFromFipe(brandCode, modelCode)
    let yearCode = payload.yearCode?.trim() ?? ''
    let yearScore = 1

    if (!yearCode) {
      const yearMatch = pickBestYear(years, payload.year)

      if (!yearMatch.value) {
        throw new Error('Year not found in FIPE')
      }

      yearCode = yearMatch.value.code
      yearScore = yearMatch.score
    } else if (!years.some((year) => year.code === yearCode)) {
      throw new Error('Invalid year code')
    }

    const fipeInfo = await fetchJson<FipeVehicleInfo>(
      `${FIPE_API_BASE_URL}/cars/brands/${brandCode}/models/${modelCode}/years/${yearCode}`,
    )

    const baseValue = parsePriceToNumber(fipeInfo.price)

    if (!Number.isFinite(baseValue) || baseValue <= 0) {
      throw new Error('Invalid FIPE value')
    }

    const adjusted = calculatePriceWithAdjustments({
      baseValue,
      mileage: payload.mileage,
      ownerState: regionState,
      year: payload.year,
    })

    const confidence = clamp(
      0.43 +
        brandScore * 0.2 +
        modelScore * 0.22 +
        yearScore * 0.1 +
        (regionState ? 0.05 : 0),
      0.35,
      0.98,
    )
    const memory = [
      `Base FIPE (${fipeInfo.referenceMonth}): ${formatCurrencyLabel(baseValue)}`,
      `Ajuste de km: ${formatFactorPercent(adjusted.adjustments.kmFactor)}`,
      `Ajuste de ano: ${formatFactorPercent(adjusted.adjustments.yearFactor)}`,
      `Ajuste de regiao (${regionLabel}): ${formatFactorPercent(adjusted.adjustments.regionFactor)}`,
      `Fator total: ${formatFactorPercent(adjusted.adjustments.totalFactor)}`,
      `Valor final estimado: ${formatCurrencyLabel(adjusted.adjustedValue)}`,
    ]

    return {
      audit: {
        adjustments: adjusted.adjustments,
        baseValue,
        confidence,
        memory,
        method: 'fipe_api_v2_adjusted',
        quotedAt: new Date().toISOString(),
        region: regionLabel,
        source: 'FIPE API v2 (parallelum.com.br)',
        vehicleContext: {
          brand: fipeInfo.brand,
          codeFipe: fipeInfo.codeFipe,
          fuel: fipeInfo.fuel,
          model: fipeInfo.model,
          referenceMonth: fipeInfo.referenceMonth,
          yearCode,
        },
      },
      estimatedValue: adjusted.adjustedValue,
    }
  } catch {
    const baseValue = payload.manualEstimatedValue ?? Math.max(18000, (2030 - payload.year) * 3200)
    const adjusted = calculatePriceWithAdjustments({
      baseValue,
      mileage: payload.mileage,
      ownerState: regionState,
      year: payload.year,
    })

    return buildManualFallbackAudit({
      adjustedValue: adjusted.adjustedValue,
      adjustments: adjusted.adjustments,
      manualEstimatedValue: payload.manualEstimatedValue,
      regionLabel,
      year: payload.year,
    })
  }
}

function isTestUserEmail(ownerEmail: string): boolean {
  const normalizedEmail = normalizeEmail(ownerEmail)

  if (TEST_USER_EMAIL_ALIASES.has(normalizedEmail)) {
    return true
  }

  const [localPart = ''] = normalizedEmail.split('@')
  return localPart === 'test' || localPart === 'teste'
}

function buildTestUserSeedAssets(ownerEmail: string): AssetRecord[] {
  const normalizedOwnerEmail = normalizeEmail(ownerEmail)
  const ownerKey = normalizedOwnerEmail.replace(/[^a-z0-9]/g, '-')

  return [
    {
      brand: 'Toyota',
      cep: '01310930',
      city: 'Sao Paulo',
      createdAt: '2026-04-01T09:00:00.000Z',
      description: 'Corolla XEi com revisoes em dia e camera de re.',
      estimatedValue: 112000,
      id: `seed-${ownerKey}-car`,
      mileage: 54000,
      model: 'Corolla XEi',
      ownerEmail: normalizedOwnerEmail,
      ownerName: TEST_USER_OWNER_NAME,
      photos: [TEST_USER_SEED_PHOTOS.car],
      state: 'SP',
      type: 'car',
      year: 2020,
    },
    {
      address: 'Rua das Flores, 230 - Sao Paulo/SP',
      bathrooms: 3,
      bedrooms: 4,
      builtArea: 180,
      createdAt: '2026-04-02T10:00:00.000Z',
      description: 'Casa com quintal amplo e espaco gourmet.',
      estimatedValue: 950000,
      id: `seed-${ownerKey}-house`,
      landArea: 250,
      ownerEmail: normalizedOwnerEmail,
      ownerName: TEST_USER_OWNER_NAME,
      photos: [TEST_USER_SEED_PHOTOS.house],
      type: 'house',
    },
    {
      address: 'Av. Paulista, 1500 - Sao Paulo/SP',
      bathrooms: 2,
      bedrooms: 3,
      builtArea: 98,
      createdAt: '2026-04-03T11:00:00.000Z',
      description: 'Apartamento reformado com 2 vagas e varanda.',
      estimatedValue: 780000,
      floor: 14,
      id: `seed-${ownerKey}-apartment`,
      landArea: 98,
      ownerEmail: normalizedOwnerEmail,
      ownerName: TEST_USER_OWNER_NAME,
      photos: [TEST_USER_SEED_PHOTOS.apartment],
      type: 'apartment',
    },
    {
      address: 'Estrada da Serra, 0 - Mairipora/SP',
      bathrooms: 0,
      bedrooms: 0,
      createdAt: '2026-04-04T12:00:00.000Z',
      description: 'Terreno plano com documentacao regularizada.',
      estimatedValue: 330000,
      id: `seed-${ownerKey}-land`,
      landArea: 720,
      ownerEmail: normalizedOwnerEmail,
      ownerName: TEST_USER_OWNER_NAME,
      photos: [TEST_USER_SEED_PHOTOS.land],
      type: 'land',
    },
  ]
}

function ensureTestUserSeedAssets(ownerEmail: string): AssetRecord[] {
  const currentAssets = readAssets()

  if (!isTestUserEmail(ownerEmail)) {
    return currentAssets
  }

  const seedAssets = buildTestUserSeedAssets(ownerEmail)
  const registeredIds = new Set(currentAssets.map((asset) => asset.id))
  const missingSeedAssets = seedAssets.filter((asset) => !registeredIds.has(asset.id))

  if (missingSeedAssets.length === 0) {
    return currentAssets
  }

  const nextAssets = [...missingSeedAssets, ...currentAssets]
  writeAssets(nextAssets)

  return nextAssets
}

function listAssetsWithMarketplaceSeed(): AssetRecord[] {
  const fromStorage = readAssets()
  const registeredIds = new Set(fromStorage.map((asset) => asset.id))
  const missingSeedAssets = marketplaceSeedAssets.filter(
    (asset) => !registeredIds.has(asset.id),
  )

  return [...fromStorage, ...missingSeedAssets]
}

export const assetsService = {
  listByOwner(ownerEmail: string) {
    const normalizedEmail = normalizeEmail(ownerEmail)
    const assetsWithSeed = ensureTestUserSeedAssets(ownerEmail)

    return assetsWithSeed
      .filter((asset) => normalizeEmail(asset.ownerEmail) === normalizedEmail)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
  },

  listMarketplaceAssets(ownerEmail: string) {
    const normalizedEmail = normalizeEmail(ownerEmail)

    return listAssetsWithMarketplaceSeed()
      .filter((asset) => normalizeEmail(asset.ownerEmail) !== normalizedEmail)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
  },

  listSwipeDecisions(ownerEmail: string) {
    const normalizedEmail = normalizeEmail(ownerEmail)

    return readSwipes()
      .filter((swipe) => swipe.ownerEmail === normalizedEmail)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
  },

  async listCarBrands() {
    return listCarBrandsFromFipe()
  },

  async listCarModels(brandId: string) {
    return listCarModelsFromFipe(brandId)
  },

  async listCarYears(brandId: string, modelId: string) {
    return listCarYearsFromFipe(brandId, modelId)
  },

  async estimateCarValue(payload: {
    brand: string
    brandId?: string
    carCity?: string
    carState?: string
    manualEstimatedValue?: number
    mileage: number
    model: string
    modelId?: string
    ownerEmail: string
    yearCode?: string
    year: number
  }) {
    return estimateCarValueWithFipe(payload)
  },

  async estimatePropertyValue(payload: {
    address?: string
    bathrooms?: number
    bedrooms?: number
    builtArea?: number
    floor?: number
    landArea: number
    ownerEmail: string
    type: 'apartment' | 'house' | 'land'
  }) {
    return estimatePropertyValue(payload)
  },

  saveSwipeDecision(payload: {
    decision: SwipeDecision
    ownerEmail: string
    ownAssetId: string
    targetAssetId: string
  }) {
    const normalizedOwner = normalizeEmail(payload.ownerEmail)
    const currentSwipes = readSwipes()

    const alreadyRegistered = currentSwipes.find(
      (swipe) =>
        swipe.ownerEmail === normalizedOwner &&
        swipe.ownAssetId === payload.ownAssetId &&
        swipe.targetAssetId === payload.targetAssetId,
    )

    const nextSwipe: AssetSwipeRecord = {
      createdAt: new Date().toISOString(),
      decision: payload.decision,
      id: alreadyRegistered?.id ?? crypto.randomUUID(),
      ownerEmail: normalizedOwner,
      ownAssetId: payload.ownAssetId,
      targetAssetId: payload.targetAssetId,
    }

    const nextSwipes = [
      nextSwipe,
      ...currentSwipes.filter((swipe) => swipe.id !== nextSwipe.id),
    ]
    writeSwipes(nextSwipes)

    return nextSwipe
  },

  resetSwipeDecisions(ownerEmail: string, ownAssetId?: string) {
    const normalizedOwner = normalizeEmail(ownerEmail)
    const nextSwipes = readSwipes().filter((swipe) => {
      if (swipe.ownerEmail !== normalizedOwner) {
        return true
      }

      if (!ownAssetId) {
        return false
      }

      return swipe.ownAssetId !== ownAssetId
    })

    writeSwipes(nextSwipes)

    return nextSwipes.filter((swipe) => swipe.ownerEmail === normalizedOwner)
  },

  async createAsset(
    user: AuthUser,
    payload: Omit<AssetRecord, 'createdAt' | 'id' | 'ownerEmail' | 'ownerName'>,
  ) {
    await wait()

    const currentAssets = readAssets()
    const nextAsset: AssetRecord = {
      ...payload,
      createdAt: new Date().toISOString(),
      id: crypto.randomUUID(),
      ownerEmail: normalizeEmail(user.email),
      ownerName: user.name.trim(),
      photos: Array.isArray(payload.photos) ? payload.photos : [],
    } as AssetRecord

    writeAssets([nextAsset, ...currentAssets])

    return nextAsset
  },

  async updateAsset(
    user: AuthUser,
    assetId: string,
    payload: Omit<AssetRecord, 'createdAt' | 'id' | 'ownerEmail' | 'ownerName'>,
  ) {
    await wait()

    const ownerEmail = normalizeEmail(user.email)
    const currentAssets = readAssets()
    const existingAsset = currentAssets.find(
      (asset) => asset.id === assetId && asset.ownerEmail === ownerEmail,
    )

    if (!existingAsset) {
      throw new Error('Ativo nao encontrado para edicao.')
    }

    const updatedAsset: AssetRecord = {
      ...payload,
      createdAt: existingAsset.createdAt,
      id: existingAsset.id,
      ownerEmail: existingAsset.ownerEmail,
      ownerName: existingAsset.ownerName,
      photos: Array.isArray(payload.photos) ? payload.photos : [],
    } as AssetRecord

    const nextAssets = currentAssets.map((asset) =>
      asset.id === existingAsset.id ? updatedAsset : asset,
    )

    writeAssets(nextAssets)

    return updatedAsset
  },

  async deleteAsset(user: AuthUser, assetId: string) {
    await wait()

    const ownerEmail = normalizeEmail(user.email)
    const currentAssets = readAssets()
    const existingAsset = currentAssets.find(
      (asset) => asset.id === assetId && asset.ownerEmail === ownerEmail,
    )

    if (!existingAsset) {
      throw new Error('Ativo nao encontrado para exclusao.')
    }

    const nextAssets = currentAssets.filter((asset) => asset.id !== assetId)
    writeAssets(nextAssets)

    const nextSwipes = readSwipes().filter(
      (swipe) => swipe.ownAssetId !== assetId && swipe.targetAssetId !== assetId,
    )
    writeSwipes(nextSwipes)

    return existingAsset
  },
}
