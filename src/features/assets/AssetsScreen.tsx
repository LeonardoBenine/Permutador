import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import brandLogo from '../../assets/logo-permutador-oficial.png'
import type { AuthUser } from '../auth/types'
import { lookupAddressByCep } from '../auth/cepService'
import { assetsService } from './assetsService'
import type {
  ApartmentAsset,
  AssetCompatibility,
  AssetMatchRecord,
  AssetProposalRecord,
  AssetRecord,
  AssetSwipeRecord,
  AssetType,
  CarAsset,
  CarAssetForm,
  HouseAsset,
  LandAsset,
  MatchStatus,
  PropertyAssetForm,
  SwipeDecision,
} from './types'
import './AssetsScreen.css'

interface AssetsScreenProps {
  onLogout: () => void
  user: AuthUser
}

interface AssetFeedback {
  text: string
  tone: 'error' | 'info' | 'success'
}

const MAX_PHOTOS_PER_ASSET = 8
const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024

const assetTypeLabels: Record<AssetType, string> = {
  apartment: 'Apartamento',
  car: 'Carro',
  house: 'Casa',
  land: 'Terreno',
}

const visibleAssetTypes: AssetType[] = ['car']

interface FipeOption {
  aliases?: string[]
  code: string
  name: string
  sourceCodes?: string[]
}

function createInitialCarForm(): CarAssetForm {
  return {
    brand: '',
    brandCode: '',
    cep: '',
    city: '',
    description: '',
    estimatedValue: '',
    mileage: '',
    model: '',
    modelCode: '',
    photos: [],
    state: '',
    yearCode: '',
    year: '',
  }
}

function createInitialPropertyForm(): PropertyAssetForm {
  return {
    address: '',
    bathrooms: '',
    bedrooms: '',
    builtArea: '',
    cep: '',
    city: '',
    complement: '',
    description: '',
    district: '',
    estimatedValue: '',
    floor: '',
    landArea: '',
    number: '',
    photos: [],
    state: '',
    street: '',
  }
}

function parsePositiveNumber(value: string): number {
  return Number(value.replace(',', '.'))
}

function normalizeCep(value: string): string {
  return value.replace(/\D/g, '').slice(0, 8)
}

function formatCep(value: string): string {
  const sanitized = normalizeCep(value)

  if (sanitized.length <= 5) {
    return sanitized
  }

  return `${sanitized.slice(0, 5)}-${sanitized.slice(5)}`
}

function buildPropertyAddress(form: Pick<
  PropertyAssetForm,
  'city' | 'complement' | 'district' | 'number' | 'state' | 'street'
>): string {
  const street = form.street.trim()
  const number = form.number.trim()
  const complement = form.complement.trim()
  const district = form.district.trim()
  const city = form.city.trim()
  const state = form.state.trim().toUpperCase()

  const streetWithNumber = [street, number].filter(Boolean).join(', ')
  const cityWithState = city && state ? `${city}/${state}` : city || state

  return [streetWithNumber, complement, district, cityWithState]
    .filter(Boolean)
    .join(' - ')
}

function hasResolvedPropertyAddress(form: PropertyAssetForm): boolean {
  const cep = normalizeCep(form.cep)

  return (
    cep.length === 8 &&
    Boolean(form.street.trim()) &&
    Boolean(form.city.trim()) &&
    form.state.trim().length === 2
  )
}

function parsePropertyAddress(address: string): Partial<PropertyAssetForm> {
  const trimmed = address.trim()

  if (!trimmed) {
    return {}
  }

  const cityStateMatch = trimmed.match(/(?:-|,)\s*([^,/-]+?)\s*\/\s*([a-z]{2})\s*$/i)
  const city = cityStateMatch?.[1]?.trim() ?? ''
  const state = cityStateMatch?.[2]?.trim().toUpperCase() ?? ''
  const withoutCityState =
    cityStateMatch && cityStateMatch.index !== undefined
      ? trimmed
          .slice(0, cityStateMatch.index)
          .replace(/[-,]\s*$/, '')
          .trim()
      : trimmed

  const sections = withoutCityState
    .split('-')
    .map((section) => section.trim())
    .filter(Boolean)
  const streetAndNumber = sections[0] ?? ''
  const district = sections[1] ?? ''
  const complement = sections.length > 2 ? sections.slice(2).join(' - ') : ''
  const streetNumberMatch = streetAndNumber.match(/^(.*?)(?:,\s*|\s+)(\d+[a-z0-9/-]*)$/i)
  const street = streetNumberMatch?.[1]?.trim() || streetAndNumber
  const number = streetNumberMatch?.[2]?.trim() ?? ''

  return {
    city,
    complement,
    district,
    number,
    state,
    street,
  }
}

function normalizeSearchValue(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function formatBrandListLabel(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ')

  if (!normalized) return ''

  const formatToken = (token: string) => {
    if (!token) return token
    if (token.length <= 3) return token.toUpperCase()
    return `${token[0].toUpperCase()}${token.slice(1)}`
  }

  return normalized
    .split(' ')
    .map((word) => word.split('-').map((part) => formatToken(part)).join('-'))
    .join(' ')
}

function brandDedupKey(value: string): string {
  const normalized = normalizeSearchValue(value).replace(/[^a-z0-9]/g, '')

  if (normalized === 'chery' || normalized === 'caoachery' || normalized === 'caoacherychery') {
    return 'chery'
  }

  return normalized
}

function mapPropertyEstimationError(error: unknown, fallbackMessage: string): string {
  const message = error instanceof Error ? normalizeSearchValue(error.message) : ''

  if (!message) {
    return fallbackMessage
  }

  if (
    message.includes('comparaveis') ||
    message.includes('preco medio por metro quadrado') ||
    message.includes('perfil de imovel')
  ) {
    return 'Não encontramos imóveis similares suficientes para calcular o valor por m² nesta região agora.'
  }

  if (message.includes('endereco insuficiente')) {
    return 'Complete CEP e número para montar um endereço válido.'
  }

  if (message.includes('area invalida')) {
    return 'Informe uma área válida para calcular o valor estimado.'
  }

  return fallbackMessage
}

function dedupeBrandOptions(brands: FipeOption[]): FipeOption[] {
  const grouped = new Map<string, FipeOption[]>()

  for (const brand of brands) {
    const key = brandDedupKey(brand.name)
    const existing = grouped.get(key) ?? []
    existing.push(brand)
    grouped.set(key, existing)
  }

  const deduped: FipeOption[] = []

  for (const group of grouped.values()) {
    const preferred = [...group].sort((a, b) => {
      const aHasSlash = a.name.includes('/') ? 1 : 0
      const bHasSlash = b.name.includes('/') ? 1 : 0

      if (aHasSlash !== bHasSlash) {
        return aHasSlash - bHasSlash
      }

      if (a.name.length !== b.name.length) {
        return a.name.length - b.name.length
      }

      return Number(a.code) - Number(b.code)
    })[0]

    const aliases = new Set<string>()

    for (const item of group) {
      const formattedName = formatBrandListLabel(item.name)

      if (formattedName) {
        aliases.add(formattedName)
      }

      for (const segment of item.name.split('/')) {
        const formattedSegment = formatBrandListLabel(segment)

        if (formattedSegment) {
          aliases.add(formattedSegment)
        }
      }
    }

    deduped.push({
      aliases: Array.from(aliases),
      code: preferred.code,
      name: formatBrandListLabel(preferred.name),
      sourceCodes: group.map((item) => item.code),
    })
  }

  return deduped.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

function createScopedModelCode(brandCode: string, modelCode: string): string {
  return `${brandCode}::${modelCode}`
}

function parseScopedModelCode(
  scopedModelCode: string,
  fallbackBrandCode: string,
): { brandCode: string; modelCode: string } {
  const parts = scopedModelCode.split('::')

  if (parts.length === 2) {
    const [brandCode = '', modelCode = ''] = parts
    return {
      brandCode: brandCode.trim(),
      modelCode: modelCode.trim(),
    }
  }

  return {
    brandCode: fallbackBrandCode.trim(),
    modelCode: scopedModelCode.trim(),
  }
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(value)
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    currency: 'BRL',
    style: 'currency',
  }).format(value)
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      const result = reader.result

      if (typeof result !== 'string') {
        reject(new Error('Não foi possível processar uma das imagens.'))
        return
      }

      resolve(result)
    }

    reader.onerror = () => {
      reject(new Error('Não foi possível processar uma das imagens.'))
    }

    reader.readAsDataURL(file)
  })
}

function propertyValidationError(
  form: PropertyAssetForm,
  options: {
    includeBuiltArea: boolean
    includeFloor: boolean
    includeLandArea?: boolean
    requireEstimatedValue?: boolean
  },
): string | null {
  if (options.requireEstimatedValue ?? true) {
    const estimatedValue = parsePositiveNumber(form.estimatedValue)

    if (Number.isNaN(estimatedValue) || estimatedValue <= 0) {
      return 'Informe o valor estimado com valor válido.'
    }
  }

  const cep = normalizeCep(form.cep)

  if (cep.length !== 8) {
    return 'Informe um CEP válido com 8 números.'
  }

  if (!hasResolvedPropertyAddress(form)) {
    return 'Busque um CEP válido para preencher rua, bairro, cidade e UF.'
  }

  if (!form.number.trim()) {
    return 'Informe o número do imóvel.'
  }

  if (options.includeLandArea ?? true) {
    const landArea = parsePositiveNumber(form.landArea)

    if (Number.isNaN(landArea) || landArea <= 0) {
      return 'Informe a metragem do terreno com valor válido.'
    }
  }

  if (options.includeBuiltArea) {
    const builtArea = parsePositiveNumber(form.builtArea)

    if (Number.isNaN(builtArea) || builtArea <= 0) {
      return 'Informe a área construída com valor válido.'
    }
  }

  const bathrooms = parsePositiveNumber(form.bathrooms)

  if (Number.isNaN(bathrooms) || bathrooms < 0) {
    return 'Informe a quantidade de banheiros com valor válido.'
  }

  const bedrooms = parsePositiveNumber(form.bedrooms)

  if (Number.isNaN(bedrooms) || bedrooms < 0) {
    return 'Informe a quantidade de quartos com valor válido.'
  }

  if (options.includeFloor) {
    const floor = parsePositiveNumber(form.floor)

    if (Number.isNaN(floor) || floor < 0) {
      return 'Informe o andar com valor válido.'
    }
  }

  return null
}

type AppMenu = 'assets' | 'discover' | 'matches'

function getAssetHeadline(asset: AssetRecord): string {
  if (asset.type === 'car') {
    return `${asset.brand} ${asset.model || 'Modelo nao informado'} ${asset.year}`
  }

  return asset.address
}

function createPropertyFormFromAsset(
  asset: HouseAsset | ApartmentAsset | LandAsset,
): PropertyAssetForm {
  const parsedAddress = parsePropertyAddress(asset.address)
  const street = (asset.street ?? parsedAddress.street ?? '').trim()
  const number = (asset.number ?? parsedAddress.number ?? '').trim()
  const complement = (asset.complement ?? parsedAddress.complement ?? '').trim()
  const district = (asset.district ?? parsedAddress.district ?? '').trim()
  const city = (asset.city ?? parsedAddress.city ?? '').trim()
  const state = (asset.state ?? parsedAddress.state ?? '').trim().toUpperCase()
  const cep = normalizeCep(asset.cep ?? '')

  const baseForm: PropertyAssetForm = {
    address: asset.address,
    bathrooms: String(asset.bathrooms),
    bedrooms: String(asset.bedrooms),
    builtArea: '',
    cep,
    city,
    complement,
    description: asset.description,
    district,
    estimatedValue: String(asset.estimatedValue),
    floor: '',
    landArea: String(asset.landArea),
    number,
    photos: [...asset.photos],
    state,
    street,
  }

  return {
    ...baseForm,
    address: buildPropertyAddress(baseForm) || asset.address,
    builtArea: 'builtArea' in asset ? String(asset.builtArea) : '',
    floor: 'floor' in asset ? String(asset.floor) : '',
  }
}

export function AssetsScreen({ onLogout, user }: AssetsScreenProps) {
  const [assetType, setAssetType] = useState<AssetType>('car')
  const [activeMenu, setActiveMenu] = useState<AppMenu>('assets')
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null)
  const [isDeletingAsset, setIsDeletingAsset] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isEstimatingCarValue, setIsEstimatingCarValue] = useState(false)
  const [isLoadingCarCatalog, setIsLoadingCarCatalog] = useState(false)
  const [isLoadingCarModels, setIsLoadingCarModels] = useState(false)
  const [isLoadingCarYears, setIsLoadingCarYears] = useState(false)
  const [isLookingUpCarCep, setIsLookingUpCarCep] = useState(false)
  const [isLookingUpHouseCep, setIsLookingUpHouseCep] = useState(false)
  const [isLookingUpApartmentCep, setIsLookingUpApartmentCep] = useState(false)
  const [isLookingUpLandCep, setIsLookingUpLandCep] = useState(false)
  const [carEstimationError, setCarEstimationError] = useState<string | null>(null)
  const [carEstimationConfidence, setCarEstimationConfidence] = useState<number | null>(null)
  const [houseEstimationError, setHouseEstimationError] = useState<string | null>(null)
  const [houseEstimationConfidence, setHouseEstimationConfidence] = useState<number | null>(null)
  const [apartmentEstimationError, setApartmentEstimationError] = useState<string | null>(null)
  const [apartmentEstimationConfidence, setApartmentEstimationConfidence] =
    useState<number | null>(null)
  const [landEstimationError, setLandEstimationError] = useState<string | null>(null)
  const [landEstimationConfidence, setLandEstimationConfidence] = useState<number | null>(null)
  const [carCatalogError, setCarCatalogError] = useState<string | null>(null)
  const [carCepError, setCarCepError] = useState<string | null>(null)
  const [houseCepError, setHouseCepError] = useState<string | null>(null)
  const [apartmentCepError, setApartmentCepError] = useState<string | null>(null)
  const [landCepError, setLandCepError] = useState<string | null>(null)
  const [carBrands, setCarBrands] = useState<FipeOption[]>([])
  const [carModels, setCarModels] = useState<FipeOption[]>([])
  const [carYearOptions, setCarYearOptions] = useState<FipeOption[]>([])
  const [isEstimatingHouseValue, setIsEstimatingHouseValue] = useState(false)
  const [isEstimatingApartmentValue, setIsEstimatingApartmentValue] = useState(false)
  const [isEstimatingLandValue, setIsEstimatingLandValue] = useState(false)
  const [feedback, setFeedback] = useState<AssetFeedback | null>(null)
  const [swipeFeedback, setSwipeFeedback] = useState<AssetFeedback | null>(null)
  const [carForm, setCarForm] = useState<CarAssetForm>(createInitialCarForm)
  const [houseForm, setHouseForm] =
    useState<PropertyAssetForm>(createInitialPropertyForm)
  const [apartmentForm, setApartmentForm] =
    useState<PropertyAssetForm>(createInitialPropertyForm)
  const [landForm, setLandForm] =
    useState<PropertyAssetForm>(createInitialPropertyForm)
  const [assets, setAssets] = useState<AssetRecord[]>(() =>
    assetsService.listByOwner(user.email),
  )
  const [swipeRecords, setSwipeRecords] = useState<AssetSwipeRecord[]>(() =>
    assetsService.listSwipeDecisions(user.email),
  )
  const [matchRecords, setMatchRecords] = useState<AssetMatchRecord[]>(() =>
    assetsService.listMatches(user.email),
  )
  const [proposalRecords, setProposalRecords] = useState<AssetProposalRecord[]>(() =>
    assetsService.listProposals(user.email),
  )
  const [selectedOwnAssetId, setSelectedOwnAssetId] = useState('')
  const [proposalMatchId, setProposalMatchId] = useState<string | null>(null)
  const [proposalCashAdjustment, setProposalCashAdjustment] = useState('')
  const [proposalNotes, setProposalNotes] = useState('')

  const ownerFirstName = useMemo(
    () => user.name.trim().split(' ')[0] || 'Usuário',
    [user.name],
  )

  const selectedOwnAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedOwnAssetId) ?? null,
    [assets, selectedOwnAssetId],
  )
  const editingAsset = useMemo(
    () => assets.find((asset) => asset.id === editingAssetId) ?? null,
    [assets, editingAssetId],
  )

  const rankedMarketplaceAssets = useMemo(
    () => assetsService.listRankedMarketplaceAssets(user.email, selectedOwnAsset),
    [selectedOwnAsset, user.email],
  )
  const allVisibleAssets = useMemo(
    () => [...assets, ...assetsService.listMarketplaceAssets(user.email)],
    [assets, user.email],
  )

  const swipesForSelectedAsset = useMemo(
    () => swipeRecords.filter((swipe) => swipe.ownAssetId === selectedOwnAssetId),
    [selectedOwnAssetId, swipeRecords],
  )

  const seenTargetIds = useMemo(
    () => new Set(swipesForSelectedAsset.map((swipe) => swipe.targetAssetId)),
    [swipesForSelectedAsset],
  )

  const tinderQueue = useMemo(
    () =>
      rankedMarketplaceAssets.filter((item) => {
        return !seenTargetIds.has(item.asset.id)
      }),
    [rankedMarketplaceAssets, seenTargetIds],
  )

  const currentCandidateItem = tinderQueue[0] ?? null
  const currentCandidate = currentCandidateItem?.asset ?? null
  const currentCompatibility = currentCandidateItem?.compatibility ?? null
  const proposalMatch = useMemo(
    () => matchRecords.find((match) => match.id === proposalMatchId) ?? null,
    [matchRecords, proposalMatchId],
  )
  const proposalOwnAsset = useMemo(
    () =>
      proposalMatch
        ? allVisibleAssets.find((asset) => asset.id === proposalMatch.ownAssetId) ?? null
        : null,
    [allVisibleAssets, proposalMatch],
  )
  const proposalTargetAsset = useMemo(
    () =>
      proposalMatch
        ? allVisibleAssets.find((asset) => asset.id === proposalMatch.targetAssetId) ?? null
        : null,
    [allVisibleAssets, proposalMatch],
  )

  const likesCount = swipesForSelectedAsset.filter(
    (swipe) => swipe.decision === 'like',
  ).length
  const passesCount = swipesForSelectedAsset.filter(
    (swipe) => swipe.decision === 'pass',
  ).length

  useEffect(() => {
    if (assets.length === 0) {
      setSelectedOwnAssetId('')
      return
    }

    setSelectedOwnAssetId((previous) => {
      if (previous && assets.some((asset) => asset.id === previous)) {
        return previous
      }

      return assets[0].id
    })
  }, [assets])

  useEffect(() => {
    let isCancelled = false
    setIsLoadingCarCatalog(true)
    setCarCatalogError(null)

    void assetsService
      .listCarBrands()
      .then((brands) => {
        if (isCancelled) {
          return
        }

        setCarBrands(dedupeBrandOptions(brands))
        setIsLoadingCarCatalog(false)
      })
      .catch(() => {
        if (isCancelled) {
          return
        }

        setIsLoadingCarCatalog(false)
        setCarCatalogError('Nao foi possivel carregar marcas FIPE.')
      })

    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    if (!carForm.brandCode) {
      setCarModels([])
      setCarYearOptions([])
      return
    }

    let isCancelled = false
    setIsLoadingCarModels(true)
    setCarCatalogError(null)

    const selectedBrand =
      carBrands.find((brand) => brand.code === carForm.brandCode) ?? null
    const sourceBrandCodes =
      selectedBrand?.sourceCodes && selectedBrand.sourceCodes.length > 0
        ? selectedBrand.sourceCodes
        : [carForm.brandCode]

    void Promise.all(
      sourceBrandCodes.map((sourceBrandCode) =>
        assetsService.listCarModels(sourceBrandCode).then((models) => ({
          models,
          sourceBrandCode,
        })),
      ),
    )
      .then((modelGroups) => {
        if (isCancelled) {
          return
        }

        const mergedModels: FipeOption[] = modelGroups.flatMap((group) =>
          group.models.map((model) => ({
            code: createScopedModelCode(group.sourceBrandCode, model.code),
            name: model.name,
          })),
        )

        setCarModels(mergedModels)
        setIsLoadingCarModels(false)
      })
      .catch(() => {
        if (isCancelled) {
          return
        }

        setIsLoadingCarModels(false)
        setCarCatalogError('Nao foi possivel carregar modelos FIPE.')
      })

    return () => {
      isCancelled = true
    }
  }, [carBrands, carForm.brandCode])

  useEffect(() => {
    if (!carForm.brandCode || !carForm.modelCode) {
      setCarYearOptions([])
      return
    }

    const { brandCode: sourceBrandCode, modelCode: sourceModelCode } =
      parseScopedModelCode(carForm.modelCode, carForm.brandCode)

    if (!sourceBrandCode || !sourceModelCode) {
      setCarYearOptions([])
      return
    }

    let isCancelled = false
    setIsLoadingCarYears(true)
    setCarCatalogError(null)

    void assetsService
      .listCarYears(sourceBrandCode, sourceModelCode)
      .then((years) => {
        if (isCancelled) {
          return
        }

        setCarYearOptions(years)
        setIsLoadingCarYears(false)
      })
      .catch(() => {
        if (isCancelled) {
          return
        }

        setIsLoadingCarYears(false)
        setCarCatalogError('Nao foi possivel carregar versoes FIPE.')
      })

    return () => {
      isCancelled = true
    }
  }, [carForm.brandCode, carForm.modelCode])

  useEffect(() => {
    if (!carForm.model || carForm.modelCode || carModels.length === 0) {
      return
    }

    const matchedModel = findOptionByName(carModels, carForm.model)

    if (!matchedModel) {
      return
    }

    setCarForm((previous) => ({
      ...previous,
      modelCode: matchedModel.code,
    }))
  }, [carForm.model, carForm.modelCode, carModels])

  useEffect(() => {
    if (!carForm.brand || carForm.brandCode || carBrands.length === 0) {
      return
    }

    const matchedBrand = findOptionByName(carBrands, carForm.brand)

    if (!matchedBrand) {
      return
    }

    setCarForm((previous) => ({
      ...previous,
      brandCode: matchedBrand.code,
    }))
  }, [carBrands, carForm.brand, carForm.brandCode])

  useEffect(() => {
    if (!carForm.year || carForm.yearCode || carYearOptions.length === 0) {
      return
    }

    const matchedYearCode =
      carYearOptions.find((yearOption) => yearOption.code.startsWith(`${carForm.year}-`))
        ?.code ?? ''

    if (!matchedYearCode) {
      return
    }

    setCarForm((previous) => ({
      ...previous,
      yearCode: matchedYearCode,
    }))
  }, [carForm.year, carForm.yearCode, carYearOptions])

  useEffect(() => {
    if (assetType !== 'car') {
      setIsLookingUpCarCep(false)
      setCarCepError(null)
      return
    }

    const cep = normalizeCep(carForm.cep)

    if (cep.length !== 8) {
      setIsLookingUpCarCep(false)
      setCarCepError(null)
      return
    }

    let isCancelled = false
    setIsLookingUpCarCep(true)
    setCarCepError(null)

    const timeoutId = window.setTimeout(() => {
      void lookupAddressByCep(cep)
        .then((address) => {
          if (isCancelled) {
            return
          }

          const city = address.city.trim()
          const state = address.state.trim().toUpperCase()

          setCarForm((previous) => ({
            ...previous,
            city,
            state,
          }))
          setIsLookingUpCarCep(false)
        })
        .catch((error) => {
          if (isCancelled) {
            return
          }

          setCarForm((previous) => ({
            ...previous,
            city: '',
            state: '',
          }))
          setIsLookingUpCarCep(false)
          setCarCepError((error as Error).message)
        })
    }, 350)

    return () => {
      isCancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [assetType, carForm.cep])

  useEffect(() => {
    if (assetType !== 'house') {
      setIsLookingUpHouseCep(false)
      setHouseCepError(null)
      return
    }

    const cep = normalizeCep(houseForm.cep)

    if (cep.length !== 8) {
      setIsLookingUpHouseCep(false)
      setHouseCepError(null)
      return
    }

    let isCancelled = false
    setIsLookingUpHouseCep(true)
    setHouseCepError(null)

    const timeoutId = window.setTimeout(() => {
      void lookupAddressByCep(cep)
        .then((address) => {
          if (isCancelled) {
            return
          }

          const city = address.city.trim()
          const district = address.district.trim()
          const state = address.state.trim().toUpperCase()
          const street = address.street.trim()

          setHouseForm((previous) => {
            const nextForm = {
              ...previous,
              city: city || previous.city,
              district: district || previous.district,
              state: state || previous.state,
              street: street || previous.street,
            }

            return {
              ...nextForm,
              address: buildPropertyAddress(nextForm),
            }
          })
          setIsLookingUpHouseCep(false)
        })
        .catch((error) => {
          if (isCancelled) {
            return
          }

          setHouseForm((previous) => {
            const nextForm = {
              ...previous,
              city: '',
              district: '',
              state: '',
              street: '',
            }

            return {
              ...nextForm,
              address: buildPropertyAddress(nextForm),
            }
          })
          setIsLookingUpHouseCep(false)
          setHouseCepError((error as Error).message)
        })
    }, 350)

    return () => {
      isCancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [assetType, houseForm.cep])

  useEffect(() => {
    if (assetType !== 'apartment') {
      setIsLookingUpApartmentCep(false)
      setApartmentCepError(null)
      return
    }

    const cep = normalizeCep(apartmentForm.cep)

    if (cep.length !== 8) {
      setIsLookingUpApartmentCep(false)
      setApartmentCepError(null)
      return
    }

    let isCancelled = false
    setIsLookingUpApartmentCep(true)
    setApartmentCepError(null)

    const timeoutId = window.setTimeout(() => {
      void lookupAddressByCep(cep)
        .then((address) => {
          if (isCancelled) {
            return
          }

          const city = address.city.trim()
          const district = address.district.trim()
          const state = address.state.trim().toUpperCase()
          const street = address.street.trim()

          setApartmentForm((previous) => {
            const nextForm = {
              ...previous,
              city: city || previous.city,
              district: district || previous.district,
              state: state || previous.state,
              street: street || previous.street,
            }

            return {
              ...nextForm,
              address: buildPropertyAddress(nextForm),
            }
          })
          setIsLookingUpApartmentCep(false)
        })
        .catch((error) => {
          if (isCancelled) {
            return
          }

          setApartmentForm((previous) => {
            const nextForm = {
              ...previous,
              city: '',
              district: '',
              state: '',
              street: '',
            }

            return {
              ...nextForm,
              address: buildPropertyAddress(nextForm),
            }
          })
          setIsLookingUpApartmentCep(false)
          setApartmentCepError((error as Error).message)
        })
    }, 350)

    return () => {
      isCancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [assetType, apartmentForm.cep])

  useEffect(() => {
    if (assetType !== 'land') {
      setIsLookingUpLandCep(false)
      setLandCepError(null)
      return
    }

    const cep = normalizeCep(landForm.cep)

    if (cep.length !== 8) {
      setIsLookingUpLandCep(false)
      setLandCepError(null)
      return
    }

    let isCancelled = false
    setIsLookingUpLandCep(true)
    setLandCepError(null)

    const timeoutId = window.setTimeout(() => {
      void lookupAddressByCep(cep)
        .then((address) => {
          if (isCancelled) {
            return
          }

          const city = address.city.trim()
          const district = address.district.trim()
          const state = address.state.trim().toUpperCase()
          const street = address.street.trim()

          setLandForm((previous) => {
            const nextForm = {
              ...previous,
              city: city || previous.city,
              district: district || previous.district,
              state: state || previous.state,
              street: street || previous.street,
            }

            return {
              ...nextForm,
              address: buildPropertyAddress(nextForm),
            }
          })
          setIsLookingUpLandCep(false)
        })
        .catch((error) => {
          if (isCancelled) {
            return
          }

          setLandForm((previous) => {
            const nextForm = {
              ...previous,
              city: '',
              district: '',
              state: '',
              street: '',
            }

            return {
              ...nextForm,
              address: buildPropertyAddress(nextForm),
            }
          })
          setIsLookingUpLandCep(false)
          setLandCepError((error as Error).message)
        })
    }, 350)

    return () => {
      isCancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [assetType, landForm.cep])

  useEffect(() => {
    if (assetType !== 'car') {
      setIsEstimatingCarValue(false)
      setCarEstimationError(null)
      setCarEstimationConfidence(null)
      return
    }

    const brand = carForm.brand.trim()
    const cep = normalizeCep(carForm.cep)
    const city = carForm.city.trim()
    const model = carForm.model.trim()
    const state = carForm.state.trim().toUpperCase()
    const year = parsePositiveNumber(carForm.year)
    const mileage = parsePositiveNumber(carForm.mileage)
    const { brandCode: sourceBrandCode, modelCode: sourceModelCode } =
      parseScopedModelCode(carForm.modelCode, carForm.brandCode)

    if (
      !brand ||
      cep.length !== 8 ||
      !city ||
      !model ||
      isLookingUpCarCep ||
      state.length !== 2 ||
      Number.isNaN(year) ||
      year < 1900 ||
      year > new Date().getFullYear() + 1 ||
      Number.isNaN(mileage) ||
      mileage < 0
    ) {
      setIsEstimatingCarValue(false)
      setCarEstimationError(null)
      setCarEstimationConfidence(null)
      setCarForm((previous) =>
        previous.estimatedValue
          ? {
              ...previous,
              estimatedValue: '',
            }
          : previous,
      )
      return
    }

    let isCancelled = false
    setIsEstimatingCarValue(true)
    setCarEstimationError(null)

    const timeoutId = window.setTimeout(() => {
      void assetsService
        .estimateCarValue({
          brand,
          brandId: sourceBrandCode || undefined,
          carCity: city,
          carState: state,
          mileage,
          model,
          modelId: sourceModelCode || undefined,
          ownerEmail: user.email,
          yearCode: carForm.yearCode || undefined,
          year,
        })
        .then((valuation) => {
          if (isCancelled) {
            return
          }

          setCarForm((previous) => ({
            ...previous,
            estimatedValue: String(valuation.estimatedValue),
          }))
          setCarEstimationConfidence(valuation.audit.confidence)
          setIsEstimatingCarValue(false)
        })
        .catch(() => {
          if (isCancelled) {
            return
          }

          setIsEstimatingCarValue(false)
          setCarEstimationConfidence(null)
          setCarEstimationError(
            'Nao foi possivel calcular o valor estimado por IA agora.',
          )
        })
    }, 450)

    return () => {
      isCancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [
    assetType,
    carForm.brand,
    carForm.brandCode,
    carForm.cep,
    carForm.city,
    carForm.mileage,
    carForm.model,
    carForm.modelCode,
    carForm.state,
    carForm.year,
    carForm.yearCode,
    isLookingUpCarCep,
    user.email,
  ])

  useEffect(() => {
    if (assetType !== 'house') {
      setIsEstimatingHouseValue(false)
      setHouseEstimationError(null)
      setHouseEstimationConfidence(null)
      return
    }

    const builtArea = parsePositiveNumber(houseForm.builtArea)
    const landArea = parsePositiveNumber(houseForm.landArea)
    const address = buildPropertyAddress(houseForm)
    const hasResolvedAddress = hasResolvedPropertyAddress(houseForm)

    if (
      Number.isNaN(builtArea) ||
      builtArea <= 0 ||
      !hasResolvedAddress ||
      isLookingUpHouseCep
    ) {
      setIsEstimatingHouseValue(false)
      setHouseEstimationError(null)
      setHouseEstimationConfidence(null)
      setHouseForm((previous) =>
        previous.estimatedValue
          ? {
              ...previous,
              estimatedValue: '',
            }
          : previous,
      )
      return
    }

    let isCancelled = false
    setIsEstimatingHouseValue(true)
    setHouseEstimationError(null)

    const timeoutId = window.setTimeout(() => {
      void assetsService
        .estimatePropertyValue({
          address,
          builtArea,
          landArea: Number.isFinite(landArea) && landArea > 0 ? landArea : builtArea,
          ownerEmail: user.email,
          type: 'house',
        })
        .then((valuation) => {
          if (isCancelled) {
            return
          }

          setHouseForm((previous) => ({
            ...previous,
            estimatedValue: String(valuation.estimatedValue),
          }))
          setHouseEstimationConfidence(valuation.audit.confidence)
          setIsEstimatingHouseValue(false)
        })
        .catch((error) => {
          if (isCancelled) {
            return
          }

          setIsEstimatingHouseValue(false)
          setHouseEstimationConfidence(null)
          setHouseEstimationError(
            mapPropertyEstimationError(error, 'Não foi possível calcular o valor da casa agora.'),
          )
        })
    }, 450)

    return () => {
      isCancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [
    assetType,
    houseForm.builtArea,
    houseForm.cep,
    houseForm.city,
    houseForm.complement,
    houseForm.district,
    houseForm.landArea,
    houseForm.number,
    houseForm.state,
    houseForm.street,
    isLookingUpHouseCep,
    user.email,
  ])

  useEffect(() => {
    if (assetType !== 'apartment') {
      setIsEstimatingApartmentValue(false)
      setApartmentEstimationError(null)
      setApartmentEstimationConfidence(null)
      return
    }

    const builtArea = parsePositiveNumber(apartmentForm.builtArea)
    const address = buildPropertyAddress(apartmentForm)
    const hasResolvedAddress = hasResolvedPropertyAddress(apartmentForm)

    if (
      Number.isNaN(builtArea) ||
      builtArea <= 0 ||
      !hasResolvedAddress ||
      isLookingUpApartmentCep
    ) {
      setIsEstimatingApartmentValue(false)
      setApartmentEstimationError(null)
      setApartmentEstimationConfidence(null)
      setApartmentForm((previous) =>
        previous.estimatedValue
          ? {
              ...previous,
              estimatedValue: '',
            }
          : previous,
      )
      return
    }

    let isCancelled = false
    setIsEstimatingApartmentValue(true)
    setApartmentEstimationError(null)

    const timeoutId = window.setTimeout(() => {
      void assetsService
        .estimatePropertyValue({
          address,
          builtArea,
          landArea: builtArea,
          ownerEmail: user.email,
          type: 'apartment',
        })
        .then((valuation) => {
          if (isCancelled) {
            return
          }

          setApartmentForm((previous) => ({
            ...previous,
            estimatedValue: String(valuation.estimatedValue),
          }))
          setApartmentEstimationConfidence(valuation.audit.confidence)
          setIsEstimatingApartmentValue(false)
        })
        .catch((error) => {
          if (isCancelled) {
            return
          }

          setIsEstimatingApartmentValue(false)
          setApartmentEstimationConfidence(null)
          setApartmentEstimationError(
            mapPropertyEstimationError(
              error,
              'Não foi possível calcular o valor do apartamento agora.',
            ),
          )
        })
    }, 450)

    return () => {
      isCancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [
    apartmentForm.builtArea,
    apartmentForm.cep,
    apartmentForm.city,
    apartmentForm.complement,
    apartmentForm.district,
    apartmentForm.number,
    apartmentForm.state,
    apartmentForm.street,
    assetType,
    isLookingUpApartmentCep,
    user.email,
  ])

  useEffect(() => {
    if (assetType !== 'land') {
      setIsEstimatingLandValue(false)
      setLandEstimationError(null)
      setLandEstimationConfidence(null)
      return
    }

    const landArea = parsePositiveNumber(landForm.landArea)
    const address = buildPropertyAddress(landForm)
    const hasResolvedAddress = hasResolvedPropertyAddress(landForm)

    if (Number.isNaN(landArea) || landArea <= 0 || !hasResolvedAddress || isLookingUpLandCep) {
      setIsEstimatingLandValue(false)
      setLandEstimationError(null)
      setLandEstimationConfidence(null)
      setLandForm((previous) =>
        previous.estimatedValue
          ? {
              ...previous,
              estimatedValue: '',
            }
          : previous,
      )
      return
    }

    let isCancelled = false
    setIsEstimatingLandValue(true)
    setLandEstimationError(null)

    const timeoutId = window.setTimeout(() => {
      void assetsService
        .estimatePropertyValue({
          address,
          landArea,
          ownerEmail: user.email,
          type: 'land',
        })
        .then((valuation) => {
          if (isCancelled) {
            return
          }

          setLandForm((previous) => ({
            ...previous,
            estimatedValue: String(valuation.estimatedValue),
          }))
          setLandEstimationConfidence(valuation.audit.confidence)
          setIsEstimatingLandValue(false)
        })
        .catch((error) => {
          if (isCancelled) {
            return
          }

          setIsEstimatingLandValue(false)
          setLandEstimationConfidence(null)
          setLandEstimationError(
            mapPropertyEstimationError(error, 'Não foi possível calcular o valor do terreno agora.'),
          )
        })
    }, 450)

    return () => {
      isCancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [
    assetType,
    landForm.cep,
    landForm.city,
    landForm.complement,
    landForm.district,
    landForm.landArea,
    landForm.number,
    landForm.state,
    landForm.street,
    isLookingUpLandCep,
    user.email,
  ])

  function findOptionByName(options: FipeOption[], value: string): FipeOption | null {
    const normalized = normalizeSearchValue(value)

    if (!normalized) {
      return null
    }

    return (
      options.find((option) => {
        const candidates = [option.name, ...(option.aliases ?? [])]

        return candidates.some(
          (candidate) => normalizeSearchValue(candidate) === normalized,
        )
      }) ??
      null
    )
  }

  function clearFeedback() {
    if (feedback) {
      setFeedback(null)
    }
  }

  function resetAllForms() {
    setCarForm(createInitialCarForm())
    setCarCepError(null)
    setIsLookingUpCarCep(false)
    setCarEstimationError(null)
    setCarEstimationConfidence(null)
    setHouseForm(createInitialPropertyForm())
    setIsLookingUpHouseCep(false)
    setHouseCepError(null)
    setIsEstimatingHouseValue(false)
    setHouseEstimationError(null)
    setHouseEstimationConfidence(null)
    setApartmentForm(createInitialPropertyForm())
    setIsLookingUpApartmentCep(false)
    setApartmentCepError(null)
    setIsEstimatingApartmentValue(false)
    setApartmentEstimationError(null)
    setApartmentEstimationConfidence(null)
    setLandForm(createInitialPropertyForm())
    setIsLookingUpLandCep(false)
    setLandCepError(null)
    setIsEstimatingLandValue(false)
    setLandEstimationError(null)
    setLandEstimationConfidence(null)
  }

  function upsertAssetList(nextAsset: AssetRecord, isEditing: boolean) {
    setAssets((previous) =>
      isEditing
        ? previous.map((asset) => (asset.id === nextAsset.id ? nextAsset : asset))
        : [nextAsset, ...previous],
    )
  }

  function getCurrentPhotos(type: AssetType): string[] {
    if (type === 'car') return carForm.photos
    if (type === 'house') return houseForm.photos
    if (type === 'apartment') return apartmentForm.photos
    return landForm.photos
  }

  function appendPhotos(type: AssetType, photosToAdd: string[]) {
    if (type === 'car') {
      setCarForm((previous) => ({
        ...previous,
        photos: [...previous.photos, ...photosToAdd],
      }))
      return
    }

    if (type === 'house') {
      setHouseForm((previous) => ({
        ...previous,
        photos: [...previous.photos, ...photosToAdd],
      }))
      return
    }

    if (type === 'apartment') {
      setApartmentForm((previous) => ({
        ...previous,
        photos: [...previous.photos, ...photosToAdd],
      }))
      return
    }

    setLandForm((previous) => ({
      ...previous,
      photos: [...previous.photos, ...photosToAdd],
    }))
  }

  function removePhoto(type: AssetType, index: number) {
    clearFeedback()

    if (type === 'car') {
      setCarForm((previous) => ({
        ...previous,
        photos: previous.photos.filter((_, photoIndex) => photoIndex !== index),
      }))
      return
    }

    if (type === 'house') {
      setHouseForm((previous) => ({
        ...previous,
        photos: previous.photos.filter((_, photoIndex) => photoIndex !== index),
      }))
      return
    }

    if (type === 'apartment') {
      setApartmentForm((previous) => ({
        ...previous,
        photos: previous.photos.filter((_, photoIndex) => photoIndex !== index),
      }))
      return
    }

    setLandForm((previous) => ({
      ...previous,
      photos: previous.photos.filter((_, photoIndex) => photoIndex !== index),
    }))
  }

  async function handlePhotoSelection(
    type: AssetType,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const input = event.currentTarget
    const selectedFiles = Array.from(input.files ?? [])
    input.value = ''

    if (selectedFiles.length === 0) return

    clearFeedback()

    const currentPhotos = getCurrentPhotos(type)
    const availableSlots = Math.max(0, MAX_PHOTOS_PER_ASSET - currentPhotos.length)

    if (availableSlots === 0) {
      setFeedback({
        text: `Limite de ${MAX_PHOTOS_PER_ASSET} fotos por ativo atingido.`,
        tone: 'error',
      })
      return
    }

    const oversizedFiles = selectedFiles.filter(
      (file) => file.size > MAX_PHOTO_SIZE_BYTES,
    )
    const nonImageFiles = selectedFiles.filter(
      (file) => !file.type.startsWith('image/'),
    )

    const validFiles = selectedFiles
      .filter((file) => file.type.startsWith('image/'))
      .filter((file) => file.size <= MAX_PHOTO_SIZE_BYTES)
      .slice(0, availableSlots)

    if (validFiles.length === 0) {
      setFeedback({ text: 'Nenhuma imagem válida foi selecionada.', tone: 'error' })
      return
    }

    try {
      const photoUrls = await Promise.all(validFiles.map((file) => readFileAsDataUrl(file)))
      appendPhotos(type, photoUrls)

      if (oversizedFiles.length > 0 || nonImageFiles.length > 0) {
        setFeedback({
          text: 'Alguns arquivos foram ignorados. Use apenas imagens até 5MB.',
          tone: 'info',
        })
      }
    } catch (error) {
      setFeedback({ text: (error as Error).message, tone: 'error' })
    }
  }

  function updatePropertyForm(
    type: 'house' | 'apartment' | 'land',
    field: keyof PropertyAssetForm,
    value: string,
  ) {
    clearFeedback()

    const updateFormState = (previous: PropertyAssetForm): PropertyAssetForm => {
      const normalizedValue =
        field === 'cep'
          ? normalizeCep(value)
          : field === 'state'
            ? value.toUpperCase()
            : value
      const nextForm = {
        ...previous,
        [field]: normalizedValue,
      }

      if (
        field === 'cep' ||
        field === 'city' ||
        field === 'complement' ||
        field === 'district' ||
        field === 'number' ||
        field === 'state' ||
        field === 'street'
      ) {
        return {
          ...nextForm,
          address: buildPropertyAddress(nextForm),
        }
      }

      return nextForm
    }

    if (type === 'house') {
      setHouseForm(updateFormState)
      return
    }

    if (type === 'apartment') {
      setApartmentForm(updateFormState)
      return
    }

    setLandForm(updateFormState)
  }

  function startEditingAsset(asset: AssetRecord) {
    setEditingAssetId(asset.id)
    setAssetType(asset.type)
    setIsLookingUpCarCep(false)
    setCarCepError(null)
    setIsLookingUpHouseCep(false)
    setHouseCepError(null)
    setIsLookingUpApartmentCep(false)
    setApartmentCepError(null)
    setIsLookingUpLandCep(false)
    setLandCepError(null)
    setHouseEstimationError(null)
    setHouseEstimationConfidence(null)
    setApartmentEstimationError(null)
    setApartmentEstimationConfidence(null)
    setLandEstimationError(null)
    setLandEstimationConfidence(null)

    if (asset.type === 'car') {
      const matchedBrand = findOptionByName(carBrands, asset.brand)
      setCarEstimationConfidence(asset.estimatedValueAudit?.confidence ?? null)
      setCarForm({
        brand: asset.brand,
        brandCode: matchedBrand?.code ?? '',
        cep: asset.cep || '',
        city: asset.city || '',
        description: asset.description || '',
        estimatedValue: String(asset.estimatedValue),
        mileage: String(asset.mileage),
        model: asset.model,
        modelCode: '',
        photos: [...asset.photos],
        state: asset.state || '',
        yearCode: asset.estimatedValueAudit?.vehicleContext?.yearCode ?? '',
        year: String(asset.year),
      })
    } else if (asset.type === 'house') {
      setCarEstimationConfidence(null)
      setHouseEstimationConfidence(asset.estimatedValueAudit?.confidence ?? null)
      setHouseForm(createPropertyFormFromAsset(asset))
    } else if (asset.type === 'apartment') {
      setCarEstimationConfidence(null)
      setApartmentEstimationConfidence(asset.estimatedValueAudit?.confidence ?? null)
      setApartmentForm(createPropertyFormFromAsset(asset))
    } else {
      setCarEstimationConfidence(null)
      setLandEstimationConfidence(asset.estimatedValueAudit?.confidence ?? null)
      setLandForm(createPropertyFormFromAsset(asset))
    }

    setFeedback({
      text: `Editando ${assetTypeLabels[asset.type]}. Ajuste os campos e salve novamente.`,
      tone: 'info',
    })
  }

  function cancelEditingAsset() {
    setEditingAssetId(null)
    resetAllForms()
    setFeedback({
      text: 'Edição cancelada. Você pode cadastrar um novo ativo.',
      tone: 'info',
    })
  }


  async function handleDeleteAsset(asset: AssetRecord) {
    if (isDeletingAsset || isSaving) {
      return
    }

    const label = assetTypeLabels[asset.type].toLowerCase()
    const shouldDelete = window.confirm(
      `Tem certeza que deseja apagar este ${label}? Esta acao nao pode ser desfeita.`,
    )

    if (!shouldDelete) {
      return
    }

    try {
      setIsDeletingAsset(true)
      setFeedback(null)
      await assetsService.deleteAsset(user, asset.id)
      setAssets((previous) => previous.filter((item) => item.id !== asset.id))
      setSwipeRecords(assetsService.listSwipeDecisions(user.email))
      setMatchRecords(assetsService.listMatches(user.email))
      setProposalRecords(assetsService.listProposals(user.email))
      setSwipeFeedback(null)

      if (editingAssetId === asset.id) {
        setEditingAssetId(null)
        resetAllForms()
      }

      setFeedback({
        text: `${assetTypeLabels[asset.type]} apagado com sucesso.`,
        tone: 'success',
      })
    } catch (error) {
      setFeedback({
        text: (error as Error).message,
        tone: 'error',
      })
    } finally {
      setIsDeletingAsset(false)
    }
  }

  async function handleDeleteEditingAsset() {
    if (!editingAsset) {
      setFeedback({
        text: 'Ativo em edicao nao encontrado para exclusao.',
        tone: 'error',
      })
      return
    }

    await handleDeleteAsset(editingAsset)
  }
  function handleSwipeDecision(decision: SwipeDecision) {
    if (!selectedOwnAssetId || !currentCandidate) {
      return
    }

    const savedSwipe = assetsService.saveSwipeDecision({
      decision,
      ownerEmail: user.email,
      ownAssetId: selectedOwnAssetId,
      targetAssetId: currentCandidate.id,
    })

    setSwipeRecords((previous) => [
      savedSwipe,
      ...previous.filter((swipe) => swipe.id !== savedSwipe.id),
    ])
    const nextMatches = assetsService.listMatches(user.email)
    const latestMatch = nextMatches.find(
      (match) =>
        (match.ownAssetId === selectedOwnAssetId &&
          match.targetAssetId === currentCandidate.id) ||
        (match.ownAssetId === currentCandidate.id &&
          match.targetAssetId === selectedOwnAssetId),
    )

    setMatchRecords(nextMatches)
    setSwipeFeedback({
      text:
        decision === 'like'
          ? latestMatch
            ? 'Oportunidade criada em Matches. Você já pode abrir uma proposta.'
            : 'Interesse enviado. A oportunidade foi salva em Matches.'
          : 'Ativo pulado. Vamos para o próximo.',
      tone: decision === 'like' ? 'success' : 'info',
    })
  }

  function handleResetSwipeStack() {
    if (!selectedOwnAssetId) {
      return
    }

    const nextOwnerSwipes = assetsService.resetSwipeDecisions(
      user.email,
      selectedOwnAssetId,
    )
    setSwipeRecords(nextOwnerSwipes)
    setMatchRecords(assetsService.listMatches(user.email))
    setSwipeFeedback({
      text: 'Pilha reiniciada. Os ativos voltaram para avaliação.',
      tone: 'info',
    })
  }

  function handleUndoLastSwipe() {
    if (!selectedOwnAssetId) {
      return
    }

    const nextOwnerSwipes = assetsService.undoLastSwipeDecision(
      user.email,
      selectedOwnAssetId,
    )
    setSwipeRecords(nextOwnerSwipes)
    setMatchRecords(assetsService.listMatches(user.email))
    setProposalRecords(assetsService.listProposals(user.email))
    setSwipeFeedback({
      text: 'Última avaliação desfeita. O carro voltou para a fila.',
      tone: 'info',
    })
  }

  function handleMatchStatusChange(matchId: string, status: MatchStatus) {
    assetsService.updateMatchStatus(matchId, status)
    setMatchRecords(assetsService.listMatches(user.email))
  }

  function handleOpenProposal(match: AssetMatchRecord) {
    const existingProposal = proposalRecords.find(
      (proposal) => proposal.matchId === match.id,
    )
    const suggestedCashAdjustment = Math.max(0, match.compatibility.priceDelta)

    setProposalMatchId(match.id)
    setProposalCashAdjustment(
      String(existingProposal?.cashAdjustment ?? Math.round(suggestedCashAdjustment)),
    )
    setProposalNotes(existingProposal?.notes ?? '')
  }

  function handleCloseProposal() {
    setProposalMatchId(null)
    setProposalCashAdjustment('')
    setProposalNotes('')
  }

  function handleSaveProposal() {
    if (!proposalMatch) {
      return
    }

    const savedProposal = assetsService.saveProposal({
      cashAdjustment: parsePositiveNumber(proposalCashAdjustment || '0'),
      matchId: proposalMatch.id,
      notes: proposalNotes,
      ownerEmail: user.email,
    })

    setProposalRecords((previous) => [
      savedProposal,
      ...previous.filter((proposal) => proposal.id !== savedProposal.id),
    ])
    setMatchRecords(assetsService.listMatches(user.email))
    handleCloseProposal()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      setIsSaving(true)
      setFeedback(null)

      if (assetType === 'car') {
        setCarCepError(null)

        if (!carForm.brand.trim() || !carForm.model.trim()) {
          throw new Error('Preencha marca e modelo do carro.')
        }

        const cep = normalizeCep(carForm.cep)

        if (cep.length !== 8) {
          throw new Error('Informe um CEP valido com 8 numeros para o carro.')
        }

        if (isLookingUpCarCep) {
          throw new Error('Aguarde a consulta do CEP terminar para salvar o carro.')
        }

        let city = carForm.city.trim()
        let state = carForm.state.trim().toUpperCase()

        if (!city || state.length !== 2) {
          try {
            const address = await lookupAddressByCep(cep)
            city = address.city.trim()
            state = address.state.trim().toUpperCase()
            setCarForm((previous) => ({
              ...previous,
              city,
              state,
            }))
            setCarCepError(null)
          } catch (error) {
            const message = (error as Error).message
            setCarCepError(message)
            throw new Error(message)
          }
        }

        if (!city || state.length !== 2) {
          throw new Error('Nao foi possivel identificar cidade/UF a partir do CEP.')
        }

        const year = parsePositiveNumber(carForm.year)

        if (
          Number.isNaN(year) ||
          year < 1900 ||
          year > new Date().getFullYear() + 1
        ) {
          throw new Error('Informe um ano válido para o carro.')
        }

        const mileage = parsePositiveNumber(carForm.mileage)

        if (Number.isNaN(mileage) || mileage < 0) {
          throw new Error('Informe a quilometragem com valor válido.')
        }

        const { brandCode: sourceBrandCode, modelCode: sourceModelCode } =
          parseScopedModelCode(carForm.modelCode, carForm.brandCode)

        const valuation = await assetsService.estimateCarValue({
          brand: carForm.brand.trim(),
          brandId: sourceBrandCode || undefined,
          carCity: city,
          carState: state,
          mileage,
          model: carForm.model.trim(),
          modelId: sourceModelCode || undefined,
          ownerEmail: user.email,
          yearCode: carForm.yearCode || undefined,
          year,
        })

        const isEditing = Boolean(editingAssetId)
        const savedAsset = editingAssetId
          ? await assetsService.updateAsset(user, editingAssetId, {
              brand: carForm.brand.trim(),
              cep,
              city,
              description: carForm.description.trim(),
              estimatedValue: valuation.estimatedValue,
              estimatedValueAudit: valuation.audit,
              mileage,
              model: carForm.model.trim(),
              photos: carForm.photos,
              state,
              type: 'car',
              year,
            } as Omit<CarAsset, 'createdAt' | 'id' | 'ownerEmail' | 'ownerName'>)
          : await assetsService.createAsset(user, {
              brand: carForm.brand.trim(),
              cep,
              city,
              description: carForm.description.trim(),
              estimatedValue: valuation.estimatedValue,
              estimatedValueAudit: valuation.audit,
              mileage,
              model: carForm.model.trim(),
              photos: carForm.photos,
              state,
              type: 'car',
              year,
            } as Omit<CarAsset, 'createdAt' | 'id' | 'ownerEmail' | 'ownerName'>)

        upsertAssetList(savedAsset, isEditing)
        setCarForm(createInitialCarForm())
        setEditingAssetId(null)
        setFeedback({
          text: `${
            isEditing ? 'Carro atualizado com sucesso.' : 'Carro cadastrado com sucesso.'
          } Valor estimado em ${formatCurrency(
            valuation.estimatedValue,
          )} (confianca: ${Math.round(valuation.audit.confidence * 100)}%).`,
          tone: 'success',
        })
        setCarEstimationConfidence(valuation.audit.confidence)
        return
      }

      if (assetType === 'house') {
        if (isLookingUpHouseCep) {
          throw new Error('Aguarde a busca do CEP da casa para continuar.')
        }

        const error = propertyValidationError(houseForm, {
          includeBuiltArea: true,
          includeFloor: false,
          requireEstimatedValue: false,
        })

        if (error) {
          throw new Error(error)
        }

        const composedAddress = buildPropertyAddress(houseForm)
        const valuation = await assetsService.estimatePropertyValue({
          address: composedAddress,
          bathrooms: parsePositiveNumber(houseForm.bathrooms),
          bedrooms: parsePositiveNumber(houseForm.bedrooms),
          builtArea: parsePositiveNumber(houseForm.builtArea),
          landArea: parsePositiveNumber(houseForm.landArea),
          ownerEmail: user.email,
          type: 'house',
        })
        setHouseForm((previous) => ({
          ...previous,
          address: composedAddress,
          estimatedValue: String(valuation.estimatedValue),
        }))
        setHouseEstimationConfidence(valuation.audit.confidence)

        const isEditing = Boolean(editingAssetId)
        const savedAsset = editingAssetId
          ? await assetsService.updateAsset(user, editingAssetId, {
              address: composedAddress,
              bathrooms: parsePositiveNumber(houseForm.bathrooms),
              bedrooms: parsePositiveNumber(houseForm.bedrooms),
              builtArea: parsePositiveNumber(houseForm.builtArea),
              cep: normalizeCep(houseForm.cep),
              city: houseForm.city.trim(),
              complement: houseForm.complement.trim(),
              description: houseForm.description.trim(),
              district: houseForm.district.trim(),
              estimatedValue: valuation.estimatedValue,
              estimatedValueAudit: valuation.audit,
              landArea: parsePositiveNumber(houseForm.landArea),
              number: houseForm.number.trim(),
              photos: houseForm.photos,
              state: houseForm.state.trim().toUpperCase(),
              street: houseForm.street.trim(),
              type: 'house',
            } as Omit<HouseAsset, 'createdAt' | 'id' | 'ownerEmail' | 'ownerName'>)
          : await assetsService.createAsset(user, {
              address: composedAddress,
              bathrooms: parsePositiveNumber(houseForm.bathrooms),
              bedrooms: parsePositiveNumber(houseForm.bedrooms),
              builtArea: parsePositiveNumber(houseForm.builtArea),
              cep: normalizeCep(houseForm.cep),
              city: houseForm.city.trim(),
              complement: houseForm.complement.trim(),
              description: houseForm.description.trim(),
              district: houseForm.district.trim(),
              estimatedValue: valuation.estimatedValue,
              estimatedValueAudit: valuation.audit,
              landArea: parsePositiveNumber(houseForm.landArea),
              number: houseForm.number.trim(),
              photos: houseForm.photos,
              state: houseForm.state.trim().toUpperCase(),
              street: houseForm.street.trim(),
              type: 'house',
            } as Omit<HouseAsset, 'createdAt' | 'id' | 'ownerEmail' | 'ownerName'>)

        upsertAssetList(savedAsset, isEditing)
        setHouseForm(createInitialPropertyForm())
        setEditingAssetId(null)
        setFeedback({
          text: isEditing ? 'Casa atualizada com sucesso.' : 'Casa cadastrada com sucesso.',
          tone: 'success',
        })
        return
      }

      if (assetType === 'apartment') {
        if (isLookingUpApartmentCep) {
          throw new Error('Aguarde a busca do CEP do apartamento para continuar.')
        }

        const error = propertyValidationError(apartmentForm, {
          includeBuiltArea: true,
          includeFloor: true,
          includeLandArea: false,
          requireEstimatedValue: false,
        })

        if (error) {
          throw new Error(error)
        }

        const apartmentLandArea = parsePositiveNumber(apartmentForm.builtArea)
        const composedAddress = buildPropertyAddress(apartmentForm)
        const valuation = await assetsService.estimatePropertyValue({
          address: composedAddress,
          bathrooms: parsePositiveNumber(apartmentForm.bathrooms),
          bedrooms: parsePositiveNumber(apartmentForm.bedrooms),
          builtArea: parsePositiveNumber(apartmentForm.builtArea),
          floor: parsePositiveNumber(apartmentForm.floor),
          landArea: apartmentLandArea,
          ownerEmail: user.email,
          type: 'apartment',
        })
        setApartmentForm((previous) => ({
          ...previous,
          estimatedValue: String(valuation.estimatedValue),
        }))
        setApartmentEstimationConfidence(valuation.audit.confidence)

        const isEditing = Boolean(editingAssetId)
        const savedAsset = editingAssetId
          ? await assetsService.updateAsset(user, editingAssetId, {
              address: composedAddress,
              bathrooms: parsePositiveNumber(apartmentForm.bathrooms),
              bedrooms: parsePositiveNumber(apartmentForm.bedrooms),
              builtArea: parsePositiveNumber(apartmentForm.builtArea),
              cep: normalizeCep(apartmentForm.cep),
              city: apartmentForm.city.trim(),
              complement: apartmentForm.complement.trim(),
              description: apartmentForm.description.trim(),
              district: apartmentForm.district.trim(),
              estimatedValue: valuation.estimatedValue,
              estimatedValueAudit: valuation.audit,
              floor: parsePositiveNumber(apartmentForm.floor),
              landArea: apartmentLandArea,
              number: apartmentForm.number.trim(),
              photos: apartmentForm.photos,
              state: apartmentForm.state.trim().toUpperCase(),
              street: apartmentForm.street.trim(),
              type: 'apartment',
            } as Omit<ApartmentAsset, 'createdAt' | 'id' | 'ownerEmail' | 'ownerName'>)
          : await assetsService.createAsset(user, {
              address: composedAddress,
              bathrooms: parsePositiveNumber(apartmentForm.bathrooms),
              bedrooms: parsePositiveNumber(apartmentForm.bedrooms),
              builtArea: parsePositiveNumber(apartmentForm.builtArea),
              cep: normalizeCep(apartmentForm.cep),
              city: apartmentForm.city.trim(),
              complement: apartmentForm.complement.trim(),
              description: apartmentForm.description.trim(),
              district: apartmentForm.district.trim(),
              estimatedValue: valuation.estimatedValue,
              estimatedValueAudit: valuation.audit,
              floor: parsePositiveNumber(apartmentForm.floor),
              landArea: apartmentLandArea,
              number: apartmentForm.number.trim(),
              photos: apartmentForm.photos,
              state: apartmentForm.state.trim().toUpperCase(),
              street: apartmentForm.street.trim(),
              type: 'apartment',
            } as Omit<ApartmentAsset, 'createdAt' | 'id' | 'ownerEmail' | 'ownerName'>)

        upsertAssetList(savedAsset, isEditing)
        setApartmentForm(createInitialPropertyForm())
        setEditingAssetId(null)
        setFeedback({
          text: isEditing
            ? 'Apartamento atualizado com sucesso.'
            : 'Apartamento cadastrado com sucesso.',
          tone: 'success',
        })
        return
      }

      if (isLookingUpLandCep) {
        throw new Error('Aguarde a busca do CEP do terreno para continuar.')
      }

      const landError = propertyValidationError(landForm, {
        includeBuiltArea: false,
        includeFloor: false,
        requireEstimatedValue: false,
      })

      if (landError) {
        throw new Error(landError)
      }

      const composedAddress = buildPropertyAddress(landForm)
      const valuation = await assetsService.estimatePropertyValue({
        address: composedAddress,
        landArea: parsePositiveNumber(landForm.landArea),
        ownerEmail: user.email,
        type: 'land',
      })
      setLandForm((previous) => ({
        ...previous,
        address: composedAddress,
        estimatedValue: String(valuation.estimatedValue),
      }))
      setLandEstimationConfidence(valuation.audit.confidence)

      const isEditing = Boolean(editingAssetId)
      const savedAsset = editingAssetId
        ? await assetsService.updateAsset(user, editingAssetId, {
            address: composedAddress,
            bathrooms: parsePositiveNumber(landForm.bathrooms),
            bedrooms: parsePositiveNumber(landForm.bedrooms),
            cep: normalizeCep(landForm.cep),
            city: landForm.city.trim(),
            complement: landForm.complement.trim(),
            description: landForm.description.trim(),
            district: landForm.district.trim(),
            estimatedValue: valuation.estimatedValue,
            estimatedValueAudit: valuation.audit,
            landArea: parsePositiveNumber(landForm.landArea),
            number: landForm.number.trim(),
            photos: landForm.photos,
            state: landForm.state.trim().toUpperCase(),
            street: landForm.street.trim(),
            type: 'land',
          } as Omit<LandAsset, 'createdAt' | 'id' | 'ownerEmail' | 'ownerName'>)
        : await assetsService.createAsset(user, {
            address: composedAddress,
            bathrooms: parsePositiveNumber(landForm.bathrooms),
            bedrooms: parsePositiveNumber(landForm.bedrooms),
            cep: normalizeCep(landForm.cep),
            city: landForm.city.trim(),
            complement: landForm.complement.trim(),
            description: landForm.description.trim(),
            district: landForm.district.trim(),
            estimatedValue: valuation.estimatedValue,
            estimatedValueAudit: valuation.audit,
            landArea: parsePositiveNumber(landForm.landArea),
            number: landForm.number.trim(),
            photos: landForm.photos,
            state: landForm.state.trim().toUpperCase(),
            street: landForm.street.trim(),
            type: 'land',
          } as Omit<LandAsset, 'createdAt' | 'id' | 'ownerEmail' | 'ownerName'>)

      upsertAssetList(savedAsset, isEditing)
      setLandForm(createInitialPropertyForm())
      setEditingAssetId(null)
      setFeedback({
        text: isEditing ? 'Terreno atualizado com sucesso.' : 'Terreno cadastrado com sucesso.',
        tone: 'success',
      })
    } catch (error) {
      setFeedback({ text: (error as Error).message, tone: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="assets-page">
      <div className="assets-orb assets-orb-left" aria-hidden="true" />
      <div className="assets-orb assets-orb-right" aria-hidden="true" />

      <main className="app-shell">
        <aside className="app-sidebar">
          <img className="app-sidebar-logo" src={brandLogo} alt="Logo Permutador" />

          <nav className="app-sidebar-nav" aria-label="Menu principal">
            <button
              className={activeMenu === 'assets' ? 'active' : ''}
              onClick={() => {
                setActiveMenu('assets')
                setSwipeFeedback(null)
              }}
              type="button"
            >
              Meus Carros
            </button>
            <button
              className={activeMenu === 'discover' ? 'active' : ''}
              onClick={() => {
                setActiveMenu('discover')
                setFeedback(null)
              }}
              type="button"
            >
              Descobrir
            </button>
            <button
              className={activeMenu === 'matches' ? 'active' : ''}
              onClick={() => {
                setActiveMenu('matches')
                setFeedback(null)
                setSwipeFeedback(null)
              }}
              type="button"
            >
              Matches
            </button>
          </nav>

          <button className="app-sidebar-logout" type="button" onClick={onLogout}>
            Sair
          </button>
        </aside>

        <section className="app-main">
          <header className="assets-header">
            <div className="assets-user">
              <p>
                <strong>{ownerFirstName}</strong>, bem-vindo de volta
              </p>
              <span>
                {activeMenu === 'assets'
                  ? 'Gerencie os seus carros'
                  : activeMenu === 'discover'
                    ? 'Descubra trocas com melhor compatibilidade'
                    : 'Acompanhe interesses e negociações'}
                </span>
              </div>
            </header>

          <div className="app-main-content">
            {activeMenu === 'assets' ? (
              <div className="assets-layout">
              <section className="assets-form-card">
                <div className="assets-form-header">
                  <p>Cadastro de ativos</p>
                  <h1>
                    {editingAssetId
                      ? `Editando ${assetTypeLabels[assetType]}`
                      : 'Adicione seus ativos para iniciar as permutas'}
                  </h1>
                </div>

                {visibleAssetTypes.length > 1 ? (
                  <div
                    className="assets-type-switcher"
                    role="tablist"
                    aria-label="Tipos de ativos"
                  >
                    {visibleAssetTypes.map((type) => (
                      <button
                        key={type}
                        className={assetType === type ? 'active' : ''}
                        onClick={() => {
                          setAssetType(type)
                          setFeedback(null)
                          setEditingAssetId(null)
                        }}
                        role="tab"
                        type="button"
                      >
                        {assetTypeLabels[type]}
                      </button>
                    ))}
                  </div>
                ) : null}

                {feedback ? (
                  <p className={`assets-feedback ${feedback.tone}`}>{feedback.text}</p>
                ) : null}

                <form className="assets-form" onSubmit={handleSubmit}>
                  {assetType === 'car' ? (
                    <>
                      <div className="assets-grid-two">
                        <div>
                          <label htmlFor="car-brand">Marca</label>
                          <input
                            id="car-brand"
                            list="car-brand-options"
                            onChange={(event) => {
                              clearFeedback()
                              const nextBrand = event.target.value
                              const matchedBrand = findOptionByName(carBrands, nextBrand)
                              setCarForm((previous) => ({
                                ...previous,
                                brand: nextBrand,
                                brandCode: matchedBrand?.code ?? '',
                                model: '',
                                modelCode: '',
                                year: '',
                                yearCode: '',
                              }))
                            }}
                            placeholder="Ex: Toyota"
                            type="text"
                            value={carForm.brand}
                          />
                          <datalist id="car-brand-options">
                            {carBrands.map((brand) => (
                              <option key={brand.code} value={brand.name} />
                            ))}
                          </datalist>
                          {isLoadingCarCatalog ? (
                            <small>Carregando marcas FIPE...</small>
                          ) : null}
                        </div>

                        <div>
                          <label htmlFor="car-model">Modelo</label>
                          <input
                            id="car-model"
                            list="car-model-options"
                            disabled={!carForm.brandCode}
                            onChange={(event) => {
                              clearFeedback()
                              const nextModel = event.target.value
                              const matchedModel = findOptionByName(carModels, nextModel)
                              setCarForm((previous) => ({
                                ...previous,
                                model: nextModel,
                                modelCode: matchedModel?.code ?? '',
                                year: '',
                                yearCode: '',
                              }))
                            }}
                            placeholder={
                              carForm.brandCode
                                ? 'Ex: Corolla XEi'
                                : 'Selecione a marca primeiro'
                            }
                            type="text"
                            value={carForm.model}
                          />
                          <datalist id="car-model-options">
                            {carModels.map((model) => (
                              <option key={model.code} value={model.name} />
                            ))}
                          </datalist>
                          {isLoadingCarModels ? (
                            <small>Carregando modelos FIPE...</small>
                          ) : null}
                        </div>
                      </div>

                      <div className="assets-grid-two">
                        <div>
                          <label htmlFor="car-version">
                            Versão FIPE (ano/combustível)
                          </label>
                          <select
                            id="car-version"
                            disabled={!carForm.modelCode}
                            onChange={(event) => {
                              clearFeedback()
                              const selectedYearCode = event.target.value
                              const selectedYear = selectedYearCode
                                ? selectedYearCode.split('-')[0]
                                : ''
                              setCarForm((previous) => ({
                                ...previous,
                                year: selectedYear,
                                yearCode: selectedYearCode,
                              }))
                            }}
                            value={carForm.yearCode}
                          >
                            <option value="">
                              {carForm.modelCode
                                ? 'Selecione uma versão'
                                : 'Selecione o modelo primeiro'}
                            </option>
                            {carYearOptions.map((yearOption) => (
                              <option key={yearOption.code} value={yearOption.code}>
                                {yearOption.name}
                              </option>
                            ))}
                          </select>
                          {isLoadingCarYears ? (
                            <small>Carregando versões FIPE...</small>
                          ) : null}
                        </div>

                        <div>
                          <label htmlFor="car-mileage">Quilometragem</label>
                          <input
                            id="car-mileage"
                            inputMode="numeric"
                            onChange={(event) => {
                              clearFeedback()
                              setCarForm((previous) => ({
                                ...previous,
                                mileage: event.target.value,
                              }))
                            }}
                            placeholder="Ex: 45000"
                            type="text"
                            value={carForm.mileage}
                          />
                        </div>
                      </div>

                      <div className="assets-grid-two">
                        <div>
                          <label htmlFor="car-cep">CEP do carro</label>
                          <input
                            id="car-cep"
                            inputMode="numeric"
                            maxLength={9}
                            onChange={(event) => {
                              clearFeedback()
                              setCarCepError(null)
                              const cep = normalizeCep(event.target.value)
                              setCarForm((previous) => ({
                                ...previous,
                                cep,
                                city: '',
                                state: '',
                              }))
                            }}
                            placeholder="Ex: 01310-930"
                            type="text"
                            value={formatCep(carForm.cep)}
                          />
                          {isLookingUpCarCep ? (
                            <small>Buscando cidade/UF pelo CEP...</small>
                          ) : null}
                          {carCepError ? (
                            <small className="assets-feedback error">{carCepError}</small>
                          ) : null}
                        </div>

                        <div>
                          <label htmlFor="car-region">Cidade/UF</label>
                          <input
                            id="car-region"
                            placeholder="Preenchido automaticamente via CEP"
                            readOnly
                            type="text"
                            value={
                              carForm.city.trim() && carForm.state.trim()
                                ? `${carForm.city.trim()}/${carForm.state.trim().toUpperCase()}`
                                : ''
                            }
                          />
                        </div>
                      </div>

                      <label htmlFor="car-description">Observações do carro</label>
                      <textarea
                        id="car-description"
                        onChange={(event) => {
                          clearFeedback()
                          setCarForm((previous) => ({
                            ...previous,
                            description: event.target.value,
                          }))
                        }}
                        placeholder="Ex: revisões em dia, pneus novos, único dono..."
                        rows={3}
                        value={carForm.description}
                      />
                      {carCatalogError ? (
                        <small className="assets-feedback error">{carCatalogError}</small>
                      ) : null}

                      <label htmlFor="car-estimated-value">
                        Valor estimado por IA (R$)
                      </label>
                      <input
                        id="car-estimated-value"
                        inputMode="decimal"
                        placeholder="Calculado automaticamente"
                        readOnly
                        type="text"
                        value={carForm.estimatedValue}
                      />
                      <small>
                        {isEstimatingCarValue
                          ? 'Calculando valor estimado por IA...'
                          : 'O valor será calculado automaticamente via FIPE com ajustes por km, ano e região.'}
                      </small>
                      {carEstimationConfidence !== null ? (
                        <small>
                          Nivel de confianca: {Math.round(carEstimationConfidence * 100)}%
                        </small>
                      ) : null}
                      {carEstimationError ? (
                        <small className="assets-feedback error">{carEstimationError}</small>
                      ) : null}

                      <PhotoUploader
                        inputId="car-photos"
                        photos={carForm.photos}
                        onPhotoRemove={(index) => {
                          removePhoto('car', index)
                        }}
                        onPhotoSelect={(event) => {
                          void handlePhotoSelection('car', event)
                        }}
                      />
                    </>
                  ) : null}

                  {assetType === 'house' ? (
                    <>
                      <PropertyFields
                        cepError={houseCepError}
                        form={houseForm}
                        estimatedConfidence={houseEstimationConfidence}
                        estimatedError={houseEstimationError}
                        estimatedHint="O valor será calculado automaticamente por comparáveis de mercado (Zap, Viva Real, QuintoAndar e Imovelweb)."
                        estimatedLabel="Valor estimado por IA (R$)"
                        estimatedReadOnly
                        includeBuiltArea
                        isLookingUpCep={isLookingUpHouseCep}
                        isEstimatingValue={isEstimatingHouseValue}
                        onFieldChange={(field, value) => {
                          updatePropertyForm('house', field, value)
                        }}
                      />
                      <PhotoUploader
                        inputId="house-photos"
                        photos={houseForm.photos}
                        onPhotoRemove={(index) => {
                          removePhoto('house', index)
                        }}
                        onPhotoSelect={(event) => {
                          void handlePhotoSelection('house', event)
                        }}
                      />
                    </>
                  ) : null}

                  {assetType === 'apartment' ? (
                    <>
                      <PropertyFields
                        cepError={apartmentCepError}
                        form={apartmentForm}
                        estimatedConfidence={apartmentEstimationConfidence}
                        estimatedError={apartmentEstimationError}
                        estimatedHint="O valor será calculado automaticamente por comparáveis de mercado (Zap, Viva Real, QuintoAndar e Imovelweb)."
                        estimatedLabel="Valor estimado por IA (R$)"
                        estimatedReadOnly
                        includeBuiltArea
                        includeFloor
                        includeLandArea={false}
                        isLookingUpCep={isLookingUpApartmentCep}
                        isEstimatingValue={isEstimatingApartmentValue}
                        onFieldChange={(field, value) => {
                          updatePropertyForm('apartment', field, value)
                        }}
                      />
                      <PhotoUploader
                        inputId="apartment-photos"
                        photos={apartmentForm.photos}
                        onPhotoRemove={(index) => {
                          removePhoto('apartment', index)
                        }}
                        onPhotoSelect={(event) => {
                          void handlePhotoSelection('apartment', event)
                        }}
                      />
                    </>
                  ) : null}

                  {assetType === 'land' ? (
                    <>
                      <PropertyFields
                        cepError={landCepError}
                        form={landForm}
                        estimatedConfidence={landEstimationConfidence}
                        estimatedError={landEstimationError}
                        estimatedHint="O valor será calculado automaticamente por comparáveis de mercado (Zap, Viva Real, QuintoAndar e Imovelweb)."
                        estimatedLabel="Valor estimado por IA (R$)"
                        estimatedReadOnly
                        isLookingUpCep={isLookingUpLandCep}
                        isEstimatingValue={isEstimatingLandValue}
                        onFieldChange={(field, value) => {
                          updatePropertyForm('land', field, value)
                        }}
                      />
                      <PhotoUploader
                        inputId="land-photos"
                        photos={landForm.photos}
                        onPhotoRemove={(index) => {
                          removePhoto('land', index)
                        }}
                        onPhotoSelect={(event) => {
                          void handlePhotoSelection('land', event)
                        }}
                      />
                    </>
                  ) : null}

                  <div className="assets-actions">
                    <button
                      className="assets-submit"
                      disabled={isSaving || isDeletingAsset}
                      type="submit"
                    >
                      {isSaving
                        ? 'Salvando ativo...'
                        : editingAssetId
                          ? `Atualizar ${assetTypeLabels[assetType]}`
                          : `Cadastrar ${assetTypeLabels[assetType]}`}
                    </button>

                    {editingAssetId ? (
                      <button
                        className="assets-cancel"
                        disabled={isSaving || isDeletingAsset}
                        onClick={cancelEditingAsset}
                        type="button"
                      >
                        Cancelar edição
                      </button>
                    ) : null}

                    {editingAssetId ? (
                      <button
                        className="assets-delete"
                        disabled={isSaving || isDeletingAsset}
                        onClick={() => {
                          void handleDeleteEditingAsset()
                        }}
                        type="button"
                      >
                        {isDeletingAsset ? 'Apagando ativo...' : 'Apagar ativo'}
                      </button>
                    ) : null}
                  </div>
                </form>
              </section>

              <aside className="assets-list-card">
                <div className="assets-list-header">
                  <h2>Ativos cadastrados</h2>
                  <span>{assets.length}</span>
                </div>

                {assets.length === 0 ? (
                  <p className="assets-empty">
                    Nenhum ativo cadastrado ainda. Preencha o formulário ao lado para
                    começar.
                  </p>
                ) : (
                  <div className="assets-list">
                    {assets.map((asset) => (
                      <article className="asset-item" key={asset.id}>
                        <header>
                          <strong>{assetTypeLabels[asset.type]}</strong>
                          <span>{formatDate(asset.createdAt)}</span>
                        </header>

                        {asset.photos.length > 0 ? (
                          <div className="asset-photo-strip">
                            {asset.photos.slice(0, 3).map((photo, index) => (
                              <img
                                key={`${asset.id}-photo-${index}`}
                                src={photo}
                                alt={`Foto ${index + 1} do ativo`}
                              />
                            ))}
                            {asset.photos.length > 3 ? (
                              <span>+{asset.photos.length - 3}</span>
                            ) : null}
                          </div>
                        ) : null}

                        <ul>
                          {asset.type === 'car' ? (
                            <>
                              <li>Marca: {asset.brand}</li>
                              <li>Modelo: {asset.model || 'Nao informado'}</li>
                              <li>Ano: {asset.year}</li>
                              <li>
                                Cidade/UF: {(asset.city || 'Nao informado')}/{(asset.state || '--')}
                              </li>
                              <li>CEP: {asset.cep ? formatCep(asset.cep) : 'Nao informado'}</li>
                              <li>Km: {formatNumber(asset.mileage)}</li>
                              <li>Valor estimado: {formatCurrency(asset.estimatedValue)}</li>
                              {asset.description ? (
                                <li>Observações: {asset.description}</li>
                              ) : null}
                              {asset.estimatedValueAudit ? (
                                <>
                                  <li>Fonte: {asset.estimatedValueAudit.source}</li>
                                  <li>
                                    Cotacao: {formatDateTime(asset.estimatedValueAudit.quotedAt)}
                                  </li>
                                  <li>
                                    Confianca:{' '}
                                    {Math.round(asset.estimatedValueAudit.confidence * 100)}%
                                  </li>
                                </>
                              ) : null}
                            </>
                          ) : null}

                          {asset.type !== 'car' ? (
                            <>
                              <li>Endereço: {asset.address}</li>
                              <li>Valor estimado: {formatCurrency(asset.estimatedValue)}</li>
                              {asset.type !== 'apartment' ? (
                                <li>Terreno: {formatNumber(asset.landArea)} m²</li>
                              ) : null}
                              {asset.type !== 'land' ? (
                                <li>
                                  Área construída: {formatNumber(asset.builtArea)} m²
                                </li>
                              ) : null}
                              <li>Banheiros: {formatNumber(asset.bathrooms)}</li>
                              <li>Quartos: {formatNumber(asset.bedrooms)}</li>
                              {asset.type === 'apartment' ? (
                                <li>Andar: {formatNumber(asset.floor)}</li>
                              ) : null}
                              {asset.description ? (
                                <li>Descrição: {asset.description}</li>
                              ) : null}
                              {asset.estimatedValueAudit ? (
                                <>
                                  <li>Fonte: {asset.estimatedValueAudit.source}</li>
                                  <li>
                                    Cotacao: {formatDateTime(asset.estimatedValueAudit.quotedAt)}
                                  </li>
                                  <li>
                                    Confianca:{' '}
                                    {Math.round(asset.estimatedValueAudit.confidence * 100)}%
                                  </li>
                                </>
                              ) : null}
                            </>
                          ) : null}
                        </ul>

                        <div className="asset-item-actions">
                          <button
                            className="asset-edit"
                            onClick={() => {
                              startEditingAsset(asset)
                            }}
                            type="button"
                          >
                            Editar ativo
                          </button>
                          <button
                            className="asset-delete"
                            disabled={isSaving || isDeletingAsset}
                            onClick={() => {
                              void handleDeleteAsset(asset)
                            }}
                            type="button"
                          >
                            {isDeletingAsset ? 'Apagando...' : 'Apagar ativo'}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </aside>
              </div>
            ) : activeMenu === 'discover' ? (
              <section className="tinder-layout">
                <article className="tinder-card-shell">
                <div className="tinder-header">
                  <p>Descobrir trocas</p>
                  <h2>Veja carros ranqueados por compatibilidade</h2>
                </div>

                {assets.length === 0 ? (
                  <div className="tinder-empty">
                    <p>
                      Você precisa cadastrar ao menos um carro para descobrir trocas.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveMenu('assets')
                      }}
                    >
                      Cadastrar meu primeiro carro
                    </button>
                  </div>
                ) : (
                  <>
                    <label htmlFor="tinder-own-asset">Carro que você quer trocar</label>
                    <select
                      id="tinder-own-asset"
                      value={selectedOwnAssetId}
                      onChange={(event) => {
                        setSelectedOwnAssetId(event.target.value)
                        setSwipeFeedback(null)
                      }}
                    >
                      {assets.map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          {assetTypeLabels[asset.type]} - {getAssetHeadline(asset)}
                        </option>
                      ))}
                    </select>

                    <div className="tinder-stats">
                      <span>
                        <strong>{likesCount}</strong>
                        <small>Troco</small>
                      </span>
                      <span>
                        <strong>{passesCount}</strong>
                        <small>Passo</small>
                      </span>
                      <span>
                        <strong>{tinderQueue.length}</strong>
                        <small>Pendentes</small>
                      </span>
                      <span>
                        <strong>{matchRecords.length}</strong>
                        <small>Matches</small>
                      </span>
                    </div>

                    {swipeFeedback ? (
                      <p className={`assets-feedback ${swipeFeedback.tone}`}>
                        {swipeFeedback.text}
                      </p>
                    ) : null}

                    {selectedOwnAsset && currentCandidate ? (
                      <>
                        <div className="tinder-discovery-grid">
                          <div className="tinder-own-summary">
                            <TinderAssetCard
                            asset={selectedOwnAsset}
                            badge="Seu ativo"
                            ownerLabel={ownerFirstName}
                              compact
                            />
                          </div>
                          <div className="tinder-candidate-panel">
                          <TinderAssetCard
                            asset={currentCandidate}
                            badge="Possível troca"
                            ownerLabel={currentCandidate.ownerName}
                              compatibility={currentCompatibility}
                          />
                            {currentCompatibility ? (
                              <CompatibilityPanel compatibility={currentCompatibility} />
                            ) : null}
                          </div>
                        </div>

                        <div className="tinder-actions">
                          <button
                            className="tinder-pass"
                            onClick={() => {
                              handleSwipeDecision('pass')
                            }}
                            type="button"
                          >
                            <span aria-hidden="true">×</span>
                            Passar
                          </button>
                          <button
                            className="tinder-undo"
                            disabled={swipesForSelectedAsset.length === 0}
                            onClick={handleUndoLastSwipe}
                            type="button"
                          >
                            <span aria-hidden="true">↶</span>
                            Voltar
                          </button>
                          <button
                            className="tinder-like"
                            onClick={() => {
                              handleSwipeDecision('like')
                            }}
                            type="button"
                          >
                            <span aria-hidden="true">♥</span>
                            Gostei
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="tinder-empty">
                        <p>Você avaliou todos os carros disponíveis para essa pilha.</p>
                      </div>
                    )}

                    <button
                      className="tinder-reset"
                      onClick={handleResetSwipeStack}
                      type="button"
                    >
                      Reiniciar avaliação desse carro
                    </button>
                  </>
                )}
                </article>
              </section>
            ) : (
              <section className="matches-layout">
                <article className="matches-card-shell">
                  <div className="tinder-header">
                    <p>Matches</p>
                    <h2>Oportunidades salvas para negociação</h2>
                  </div>

                  {matchRecords.length === 0 ? (
                    <div className="tinder-empty">
                      <p>
                        Nenhum interesse salvo ainda. Curta carros em Descobrir para
                        montar sua lista de oportunidades.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveMenu('discover')
                        }}
                      >
                        Descobrir carros
                      </button>
                    </div>
                  ) : (
                    <div className="matches-list">
                      {matchRecords.map((match) => {
                        const ownAsset =
                          allVisibleAssets.find((asset) => asset.id === match.ownAssetId) ??
                          null
                        const targetAsset =
                          allVisibleAssets.find((asset) => asset.id === match.targetAssetId) ??
                          null

                        return (
                          <MatchCard
                            key={match.id}
                            match={match}
                            proposal={
                              proposalRecords.find(
                                (proposal) => proposal.matchId === match.id,
                              ) ?? null
                            }
                            ownAsset={ownAsset}
                            targetAsset={targetAsset}
                            onOpenProposal={handleOpenProposal}
                            onStatusChange={handleMatchStatusChange}
                          />
                        )
                      })}
                    </div>
                  )}
                </article>
              </section>
            )}
          </div>
        </section>
      </main>

      {proposalMatch && proposalOwnAsset && proposalTargetAsset ? (
        <ProposalModal
          cashAdjustment={proposalCashAdjustment}
          match={proposalMatch}
          notes={proposalNotes}
          ownAsset={proposalOwnAsset}
          targetAsset={proposalTargetAsset}
          onCashAdjustmentChange={setProposalCashAdjustment}
          onClose={handleCloseProposal}
          onNotesChange={setProposalNotes}
          onSave={handleSaveProposal}
        />
      ) : null}
    </div>
  )
}

interface TinderAssetCardProps {
  asset: AssetRecord
  badge: string
  compact?: boolean
  compatibility?: AssetCompatibility | null
  ownerLabel: string
}

function TinderAssetCard({
  asset,
  badge,
  compact = false,
  compatibility = null,
  ownerLabel,
}: TinderAssetCardProps) {
  const coverPhoto = asset.photos[0]

  return (
    <article className={`tinder-asset-card ${compact ? 'compact' : ''}`}>
      <div className="tinder-card-topline">
        <span className="tinder-badge">{badge}</span>
        {compatibility ? (
          <span className="tinder-score">{compatibility.score}%</span>
        ) : null}
      </div>
      <p className="tinder-owner">{ownerLabel}</p>
      <strong>{getAssetHeadline(asset)}</strong>

      {coverPhoto ? (
        <img src={coverPhoto} alt={`Foto de ${assetTypeLabels[asset.type]}`} />
      ) : (
        <div className="tinder-photo-placeholder">Sem foto</div>
      )}

      <ul>
        {asset.type === 'car' ? (
          <>
            <li>
              <span>Marca</span>
              <strong>{asset.brand}</strong>
            </li>
            <li>
              <span>Modelo</span>
              <strong>{asset.model || 'Nao informado'}</strong>
            </li>
            <li>
              <span>Ano</span>
              <strong>{asset.year}</strong>
            </li>
            <li>
              <span>Cidade/UF</span>
              <strong>
                {(asset.city || 'Nao informado')}/{(asset.state || '--')}
              </strong>
            </li>
            <li>
              <span>CEP</span>
              <strong>{asset.cep ? formatCep(asset.cep) : 'Nao informado'}</strong>
            </li>
            <li>
              <span>Km</span>
              <strong>{formatNumber(asset.mileage)}</strong>
            </li>
            <li>
              <span>Valor estimado</span>
              <strong>{formatCurrency(asset.estimatedValue)}</strong>
            </li>
            {asset.description ? (
              <li>
                <span>Observações</span>
                <strong>{asset.description}</strong>
              </li>
            ) : null}
          </>
        ) : (
          <>
            <li>
              <span>Endereço</span>
              <strong>{asset.address}</strong>
            </li>
            <li>
              <span>Valor estimado</span>
              <strong>{formatCurrency(asset.estimatedValue)}</strong>
            </li>
            {asset.type !== 'apartment' ? (
              <li>
                <span>Terreno</span>
                <strong>{formatNumber(asset.landArea)} m²</strong>
              </li>
            ) : null}
            {asset.type !== 'land' ? (
              <li>
                <span>Área construída</span>
                <strong>{formatNumber(asset.builtArea)} m²</strong>
              </li>
            ) : null}
            <li>
              <span>Banheiros</span>
              <strong>{formatNumber(asset.bathrooms)}</strong>
            </li>
            <li>
              <span>Quartos</span>
              <strong>{formatNumber(asset.bedrooms)}</strong>
            </li>
            {asset.type === 'apartment' ? (
              <li>
                <span>Andar</span>
                <strong>{formatNumber(asset.floor)}</strong>
              </li>
            ) : null}
          </>
        )}
      </ul>
    </article>
  )
}

function CompatibilityPanel({ compatibility }: { compatibility: AssetCompatibility }) {
  return (
    <aside className="compatibility-panel">
      <header>
        <span>Compatibilidade</span>
        <strong>{compatibility.score}%</strong>
      </header>
      <div className="compatibility-bars">
        <CompatibilityBar label="Valor" value={compatibility.priceScore} />
        <CompatibilityBar label="Local" value={compatibility.locationScore} />
        <CompatibilityBar label="Ano" value={compatibility.yearScore} />
        <CompatibilityBar label="Km" value={compatibility.mileageScore} />
      </div>
      <ul>
        {compatibility.explanations.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </aside>
  )
}

function CompatibilityBar({ label, value }: { label: string; value: number }) {
  const percent = Math.round(value * 100)

  return (
    <div className="compatibility-bar">
      <span>{label}</span>
      <div>
        <i style={{ width: `${percent}%` }} />
      </div>
      <strong>{percent}%</strong>
    </div>
  )
}

function getMatchStatusLabel(status: MatchStatus): string {
  const labels: Record<MatchStatus, string> = {
    closed: 'Fechado',
    declined: 'Recusado',
    new: 'Novo',
    negotiating: 'Em negociação',
  }

  return labels[status]
}

interface MatchCardProps {
  match: AssetMatchRecord
  onOpenProposal: (match: AssetMatchRecord) => void
  onStatusChange: (matchId: string, status: MatchStatus) => void
  ownAsset: AssetRecord | null
  proposal: AssetProposalRecord | null
  targetAsset: AssetRecord | null
}

function MatchCard({
  match,
  onOpenProposal,
  onStatusChange,
  ownAsset,
  proposal,
  targetAsset,
}: MatchCardProps) {
  return (
    <article className="match-card">
      <header>
        <div>
          <span>{getMatchStatusLabel(match.status)}</span>
          <h3>
            {targetAsset ? getAssetHeadline(targetAsset) : 'Carro indisponível'}
          </h3>
        </div>
        <strong>{match.compatibility.score}%</strong>
      </header>

      <div className="match-card-assets">
        {ownAsset ? (
          <TinderAssetCard asset={ownAsset} badge="Seu carro" ownerLabel="Você" compact />
        ) : null}
        {targetAsset ? (
          <TinderAssetCard
            asset={targetAsset}
            badge="Interesse"
            ownerLabel={targetAsset.ownerName}
            compact
          />
        ) : null}
      </div>

      <CompatibilityPanel compatibility={match.compatibility} />

      {proposal ? (
        <div className="proposal-summary">
          <span>Proposta aberta</span>
          <strong>Torna: {formatCurrency(proposal.cashAdjustment)}</strong>
          {proposal.notes ? <p>{proposal.notes}</p> : null}
        </div>
      ) : null}

      <div className="match-actions">
        <button
          className="primary"
          onClick={() => {
            onOpenProposal(match)
          }}
          type="button"
        >
          Abrir proposta
        </button>
        <button
          className={match.status === 'new' ? 'active' : ''}
          onClick={() => {
            onStatusChange(match.id, 'new')
          }}
          type="button"
        >
          Novo
        </button>
        <button
          className={match.status === 'negotiating' ? 'active' : ''}
          onClick={() => {
            onStatusChange(match.id, 'negotiating')
          }}
          type="button"
        >
          Negociar
        </button>
        <button
          className={match.status === 'closed' ? 'active' : ''}
          onClick={() => {
            onStatusChange(match.id, 'closed')
          }}
          type="button"
        >
          Fechar
        </button>
        <button
          className={match.status === 'declined' ? 'active danger' : 'danger'}
          onClick={() => {
            onStatusChange(match.id, 'declined')
          }}
          type="button"
        >
          Recusar
        </button>
      </div>
    </article>
  )
}

interface ProposalModalProps {
  cashAdjustment: string
  match: AssetMatchRecord
  notes: string
  onCashAdjustmentChange: (value: string) => void
  onClose: () => void
  onNotesChange: (value: string) => void
  onSave: () => void
  ownAsset: AssetRecord
  targetAsset: AssetRecord
}

function ProposalModal({
  cashAdjustment,
  match,
  notes,
  onCashAdjustmentChange,
  onClose,
  onNotesChange,
  onSave,
  ownAsset,
  targetAsset,
}: ProposalModalProps) {
  return (
    <div className="proposal-modal-backdrop" role="presentation">
      <section
        aria-labelledby="proposal-modal-title"
        className="proposal-modal"
        role="dialog"
      >
        <header>
          <div>
            <span>Proposta de permuta</span>
            <h2 id="proposal-modal-title">Abrir proposta</h2>
          </div>
          <button aria-label="Fechar proposta" onClick={onClose} type="button">
            ×
          </button>
        </header>

        <div className="proposal-assets">
          <TinderAssetCard asset={ownAsset} badge="Seu carro" ownerLabel="Você" compact />
          <TinderAssetCard
            asset={targetAsset}
            badge="Carro desejado"
            ownerLabel={targetAsset.ownerName}
            compact
          />
        </div>

        <CompatibilityPanel compatibility={match.compatibility} />

        <div className="proposal-form">
          <label htmlFor="proposal-cash-adjustment">Valor de torna</label>
          <input
            id="proposal-cash-adjustment"
            inputMode="numeric"
            onChange={(event) => {
              onCashAdjustmentChange(event.target.value.replace(/\D/g, ''))
            }}
            type="text"
            value={cashAdjustment}
          />
          <small>
            Diferença estimada: {formatCurrency(Math.abs(match.compatibility.priceDelta))}
          </small>

          <label htmlFor="proposal-notes">Observações da proposta</label>
          <textarea
            id="proposal-notes"
            onChange={(event) => {
              onNotesChange(event.target.value)
            }}
            placeholder="Ex: aceito avaliar torna, vistoria e transferência nesta semana."
            rows={4}
            value={notes}
          />
        </div>

        <div className="proposal-modal-actions">
          <button className="proposal-save" onClick={onSave} type="button">
            Salvar proposta
          </button>
          <button className="proposal-cancel" onClick={onClose} type="button">
            Cancelar
          </button>
        </div>
      </section>
    </div>
  )
}

interface PropertyFieldsProps {
  cepError?: string | null
  estimatedConfidence?: number | null
  estimatedError?: string | null
  estimatedHint?: string
  estimatedLabel?: string
  estimatedReadOnly?: boolean
  form: PropertyAssetForm
  includeBuiltArea?: boolean
  includeFloor?: boolean
  includeLandArea?: boolean
  isLookingUpCep?: boolean
  isEstimatingValue?: boolean
  onFieldChange: (field: keyof PropertyAssetForm, value: string) => void
}

function PropertyFields({
  cepError = null,
  estimatedConfidence = null,
  estimatedError = null,
  estimatedHint = '',
  estimatedLabel = 'Valor estimado (R$)',
  estimatedReadOnly = false,
  form,
  includeBuiltArea = false,
  includeFloor = false,
  includeLandArea = true,
  isLookingUpCep = false,
  isEstimatingValue = false,
  onFieldChange,
}: PropertyFieldsProps) {
  return (
    <>
      <label htmlFor="property-cep">CEP do imóvel</label>
      <input
        id="property-cep"
        inputMode="numeric"
        onChange={(event) => {
          onFieldChange('cep', normalizeCep(event.target.value))
        }}
        placeholder="Ex: 01310-930"
        type="text"
        value={formatCep(form.cep)}
      />
      <small>
        {isLookingUpCep
          ? 'Buscando endereço pelo CEP...'
          : 'Rua, bairro, cidade e UF são preenchidos automaticamente pelo CEP.'}
      </small>
      {cepError ? <small className="assets-feedback error">{cepError}</small> : null}

      <div className="assets-grid-two">
        <div>
          <label htmlFor="property-street">Rua</label>
          <input id="property-street" readOnly type="text" value={form.street} />
        </div>
        <div>
          <label htmlFor="property-district">Bairro</label>
          <input id="property-district" readOnly type="text" value={form.district} />
        </div>
      </div>

      <div className="assets-grid-two">
        <div>
          <label htmlFor="property-city">Cidade</label>
          <input id="property-city" readOnly type="text" value={form.city} />
        </div>
        <div>
          <label htmlFor="property-state">UF</label>
          <input id="property-state" readOnly type="text" value={form.state} />
        </div>
      </div>

      <div className="assets-grid-two">
        <div>
          <label htmlFor="property-number">Número</label>
          <input
            id="property-number"
            onChange={(event) => {
              onFieldChange('number', event.target.value)
            }}
            placeholder="Ex: 250"
            type="text"
            value={form.number}
          />
        </div>
        <div>
          <label htmlFor="property-complement">Complemento</label>
          <input
            id="property-complement"
            onChange={(event) => {
              onFieldChange('complement', event.target.value)
            }}
            placeholder="Ex: Bloco A, apto 21"
            type="text"
            value={form.complement}
          />
        </div>
      </div>

      {form.address ? (
        <small className="assets-address-preview">Endereço montado: {form.address}</small>
      ) : null}

      {includeLandArea || includeBuiltArea ? (
        <div
          className={
            includeLandArea && includeBuiltArea ? 'assets-grid-two' : 'assets-grid-single'
          }
        >
          {includeLandArea ? (
            <div>
              <label htmlFor="property-land-area">Metragem do terreno (m²)</label>
              <input
                id="property-land-area"
                inputMode="decimal"
                onChange={(event) => {
                  onFieldChange('landArea', event.target.value)
                }}
                placeholder="Ex: 250"
                type="text"
                value={form.landArea}
              />
            </div>
          ) : null}

          {includeBuiltArea ? (
            <div>
              <label htmlFor="property-built-area">Área construída (m²)</label>
              <input
                id="property-built-area"
                inputMode="decimal"
                onChange={(event) => {
                  onFieldChange('builtArea', event.target.value)
                }}
                placeholder="Ex: 180"
                type="text"
                value={form.builtArea}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="assets-grid-two">
        <div>
          <label htmlFor="property-bathrooms">Quantidade de banheiros</label>
          <input
            id="property-bathrooms"
            inputMode="numeric"
            onChange={(event) => {
              onFieldChange('bathrooms', event.target.value)
            }}
            placeholder="Ex: 3"
            type="text"
            value={form.bathrooms}
          />
        </div>

        <div>
          <label htmlFor="property-bedrooms">Quantidade de quartos</label>
          <input
            id="property-bedrooms"
            inputMode="numeric"
            onChange={(event) => {
              onFieldChange('bedrooms', event.target.value)
            }}
            placeholder="Ex: 4"
            type="text"
            value={form.bedrooms}
          />
        </div>
      </div>

      {includeFloor ? (
        <>
          <label htmlFor="property-floor">Andar</label>
          <input
            id="property-floor"
            inputMode="numeric"
            onChange={(event) => {
              onFieldChange('floor', event.target.value)
            }}
            placeholder="Ex: 12"
            type="text"
            value={form.floor}
          />
        </>
      ) : null}

      <label htmlFor="property-description">Descrição</label>
      <textarea
        id="property-description"
        onChange={(event) => {
          onFieldChange('description', event.target.value)
        }}
        placeholder="Adicione detalhes relevantes do ativo"
        rows={4}
        value={form.description}
      />

      <label htmlFor="property-estimated-value">{estimatedLabel}</label>
      <input
        id="property-estimated-value"
        inputMode="decimal"
        onChange={(event) => {
          if (!estimatedReadOnly) {
            onFieldChange('estimatedValue', event.target.value)
          }
        }}
        placeholder={estimatedReadOnly ? 'Calculado automaticamente' : 'Ex: 450000'}
        readOnly={estimatedReadOnly}
        type="text"
        value={form.estimatedValue}
      />
      {estimatedReadOnly ? (
        <>
          <small>
            {isEstimatingValue
              ? 'Calculando valor estimado por IA...'
              : estimatedHint || 'O valor será calculado automaticamente por IA.'}
          </small>
          {estimatedConfidence !== null ? (
            <small>Nível de confiança: {Math.round(estimatedConfidence * 100)}%</small>
          ) : null}
          {estimatedError ? (
            <small className="assets-feedback error">{estimatedError}</small>
          ) : null}
        </>
      ) : null}
    </>
  )
}

interface PhotoUploaderProps {
  inputId: string
  onPhotoRemove: (index: number) => void
  onPhotoSelect: (event: ChangeEvent<HTMLInputElement>) => void
  photos: string[]
}

function PhotoUploader({
  inputId,
  onPhotoRemove,
  onPhotoSelect,
  photos,
}: PhotoUploaderProps) {
  return (
    <div className="assets-photo-field">
      <label htmlFor={inputId}>Fotos do ativo</label>
      <input
        id={inputId}
        accept="image/*"
        multiple
        onChange={onPhotoSelect}
        type="file"
      />
      <small>Você pode enviar até 8 fotos por ativo (máx. 5MB cada).</small>

      {photos.length > 0 ? (
        <div className="assets-photo-grid">
          {photos.map((photo, index) => (
            <figure className="assets-photo-item" key={`${inputId}-${index}`}>
              <img src={photo} alt={`Foto do ativo ${index + 1}`} />
              <button
                type="button"
                onClick={() => {
                  onPhotoRemove(index)
                }}
              >
                Remover
              </button>
            </figure>
          ))}
        </div>
      ) : null}
    </div>
  )
}








