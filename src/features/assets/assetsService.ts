import type { AuthUser } from '../auth/types'
import type { AssetRecord, AssetSwipeRecord, SwipeDecision } from './types'

const ASSETS_STORAGE_KEY = 'permutador.assets'
const SWIPES_STORAGE_KEY = 'permutador.asset-swipes'

const marketplaceSeedAssets: AssetRecord[] = [
  {
    brand: 'Jeep',
    createdAt: '2026-03-05T14:00:00.000Z',
    description: 'SUV com revisoes em dia e unico dono.',
    id: 'seed-car-jeep-compass',
    mileage: 32000,
    model: 'Compass Longitude',
    ownerEmail: 'marcos.silva@market.permutador',
    ownerName: 'Marcos Silva',
    photos: [],
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
    id: 'seed-land-atibaia',
    landArea: 600,
    ownerEmail: 'paulo.nunes@market.permutador',
    ownerName: 'Paulo Nunes',
    photos: [],
    type: 'land',
  },
]

const wait = (milliseconds = 500): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds)
  })

function normalizeAsset(value: unknown): AssetRecord | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const asset = value as Partial<AssetRecord> & { photos?: unknown }

  if (!asset.type || !asset.id || !asset.createdAt || !asset.ownerEmail || !asset.ownerName) {
    return null
  }

  return {
    ...(asset as AssetRecord),
    photos: Array.isArray(asset.photos)
      ? asset.photos.filter((item): item is string => typeof item === 'string')
      : [],
  }
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

    return readAssets()
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
