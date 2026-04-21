import type { AuthUser } from '../auth/types'
import type {
  AssetRecord,
  AssetSwipeRecord,
  AssetType,
  EstimatedValueAudit,
  SwipeDecision,
} from './types'
import {
  FIPEZAP_RESIDENTIAL_CITY_M2,
  FIPEZAP_RESIDENTIAL_REFERENCE,
  FIPEZAP_RESIDENTIAL_SOURCE,
} from './fipezapResidentialSaleData'

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

const HOUSE_PRICE_PER_M2_BY_STATE: Record<string, number> = {
  DF: 7600,
  ES: 5800,
  GO: 5200,
  MG: 5600,
  PR: 5900,
  RJ: 8300,
  RS: 5600,
  SC: 6200,
  SP: 7800,
}

const LAND_PRICE_PER_M2_BY_STATE: Record<string, number> = {
  DF: 2600,
  ES: 1700,
  GO: 1300,
  MG: 1600,
  PR: 1800,
  RJ: 2800,
  RS: 1500,
  SC: 1900,
  SP: 2900,
}

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

let cachedCarBrands: FipeNamedCode[] | null = null
const cachedCarModelsByBrand = new Map<string, FipeNamedCode[]>()
const cachedCarYearsByModel = new Map<string, FipeNamedCode[]>()

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
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
    method:
      audit.method === 'fipe_api_v2_adjusted'
        ? 'fipe_api_v2_adjusted'
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

  const endPattern = /(?:-|,)\s*([^,/]+?)\s*\/\s*([a-z]{2})\s*$/i
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

function getFipeZapCityM2(city: string, state: string): number | null {
  const normalizedCity = normalizeFipeZapCity(city)
  const normalizedState = state.trim().toUpperCase()

  if (!normalizedCity || normalizedState.length !== 2) {
    return null
  }

  const key = `${normalizedCity}|${normalizedState}`
  return FIPEZAP_RESIDENTIAL_CITY_M2[key] ?? null
}

function estimatePropertyValue(payload: {
  address?: string
  bathrooms?: number
  bedrooms?: number
  builtArea?: number
  landArea: number
  ownerEmail: string
  type: 'house' | 'land'
}): {
  confidence: number
  estimatedValue: number
  quotedAt: string
  source: string
} {
  const ownerState = getOwnerState(payload.ownerEmail)
  const addressGeo = parseCityAndStateFromAddress(payload.address ?? '')
  const resolvedState =
    addressGeo.state.length === 2
      ? addressGeo.state
      : ownerState.length === 2
        ? ownerState
        : ''
  const fipeZapCityM2 = getFipeZapCityM2(addressGeo.city, resolvedState)
  const regionFactor = REGION_FACTOR_BY_STATE[resolvedState] ?? 0
  const hasAddress = Boolean(payload.address?.trim())
  const quotedAt = new Date().toISOString()
  const sourceWithReference = `${FIPEZAP_RESIDENTIAL_SOURCE} (${FIPEZAP_RESIDENTIAL_REFERENCE})`
  const source =
    fipeZapCityM2 !== null
      ? `${sourceWithReference} + ajustes de características do imóvel`
      : 'Heurística de mercado com fallback por UF (sem cobertura FIPEZAP da cidade)'

  if (payload.type === 'house') {
    const builtArea = Math.max(0, payload.builtArea ?? 0)
    const bathrooms = Math.max(0, payload.bathrooms ?? 0)
    const bedrooms = Math.max(0, payload.bedrooms ?? 0)
    const baseM2 = fipeZapCityM2 ?? HOUSE_PRICE_PER_M2_BY_STATE[resolvedState] ?? 4700

    const builtAreaComponent = builtArea * baseM2
    const landComponent = payload.landArea * (baseM2 * 0.2)
    const roomComponent = bedrooms * 22000 + bathrooms * 18000
    const addressFactor = hasAddress ? 0.015 : 0
    const totalFactor = regionFactor + addressFactor

    return {
      confidence: clamp(
        0.5 +
          (resolvedState ? 0.08 : 0) +
          (hasAddress ? 0.05 : 0) +
          (fipeZapCityM2 !== null ? 0.12 : 0) +
          (bedrooms + bathrooms > 0 ? 0.04 : 0),
        0.35,
        0.92,
      ),
      estimatedValue: Math.max(
        35000,
        Math.round((builtAreaComponent + landComponent + roomComponent) * (1 + totalFactor)),
      ),
      quotedAt,
      source,
    }
  }

  const baseM2 =
    fipeZapCityM2 !== null
      ? Math.round(fipeZapCityM2 * 0.34)
      : LAND_PRICE_PER_M2_BY_STATE[resolvedState] ?? 900
  const addressFactor = hasAddress ? 0.02 : 0
  const totalFactor = regionFactor + addressFactor

  return {
    confidence: clamp(
      0.46 +
        (resolvedState ? 0.07 : 0) +
        (hasAddress ? 0.05 : 0) +
        (fipeZapCityM2 !== null ? 0.1 : 0),
      0.32,
      0.9,
    ),
    estimatedValue: Math.max(20000, Math.round(payload.landArea * baseM2 * (1 + totalFactor))),
    quotedAt,
    source:
      fipeZapCityM2 !== null
        ? `${sourceWithReference} convertido para terreno + ajustes de região`
        : source,
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

  return {
    audit: {
      adjustments: payload.adjustments,
      baseValue,
      confidence: payload.manualEstimatedValue ? 0.45 : 0.3,
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

    return {
      audit: {
        adjustments: adjusted.adjustments,
        baseValue,
        confidence,
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
    landArea: number
    ownerEmail: string
    type: 'house' | 'land'
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
}
