export type AssetType = 'car' | 'house' | 'apartment' | 'land'

export interface EstimatedValueAudit {
  adjustments: {
    kmFactor: number
    regionFactor: number
    totalFactor: number
    yearFactor: number
  }
  baseValue: number
  confidence: number
  memory?: string[]
  method:
    | 'fipe_api_v2_adjusted'
    | 'manual_fallback'
    | 'property_public_base_adjusted'
    | 'property_market_comparables'
  quotedAt: string
  region: string
  source: string
  vehicleContext?: {
    brand?: string
    codeFipe?: string
    fuel?: string
    model?: string
    referenceMonth?: string
    yearCode?: string
  }
}

interface AssetBase {
  createdAt: string
  description: string
  estimatedValue: number
  estimatedValueAudit?: EstimatedValueAudit | null
  id: string
  ownerEmail: string
  ownerName: string
  photos: string[]
  type: AssetType
}

export interface CarAsset extends AssetBase {
  brand: string
  cep: string
  city: string
  mileage: number
  model: string
  state: string
  type: 'car'
  year: number
}

interface PropertyAssetBase extends AssetBase {
  address: string
  bathrooms: number
  bedrooms: number
  cep?: string
  city?: string
  complement?: string
  district?: string
  landArea: number
  number?: string
  state?: string
  street?: string
}

export interface HouseAsset extends PropertyAssetBase {
  builtArea: number
  type: 'house'
}

export interface ApartmentAsset extends PropertyAssetBase {
  builtArea: number
  floor: number
  type: 'apartment'
}

export interface LandAsset extends PropertyAssetBase {
  type: 'land'
}

export type AssetRecord = CarAsset | HouseAsset | ApartmentAsset | LandAsset

export type SwipeDecision = 'like' | 'pass'

export type MatchStatus = 'new' | 'negotiating' | 'declined' | 'closed'

export interface AssetCompatibility {
  distanceScore: number
  explanations: string[]
  locationScore: number
  mileageScore: number
  priceDelta: number
  priceDeltaPercent: number
  priceScore: number
  score: number
  yearScore: number
}

export interface AssetSwipeRecord {
  createdAt: string
  decision: SwipeDecision
  id: string
  ownerEmail: string
  ownAssetId: string
  targetAssetId: string
}

export interface AssetMatchRecord {
  compatibility: AssetCompatibility
  createdAt: string
  id: string
  ownerEmail: string
  ownAssetId: string
  status: MatchStatus
  targetAssetId: string
  targetOwnerEmail: string
  updatedAt: string
}

export interface AssetProposalRecord {
  cashAdjustment: number
  createdAt: string
  id: string
  matchId: string
  notes: string
  ownerEmail: string
  updatedAt: string
}

export interface CarAssetForm {
  brand: string
  brandCode: string
  cep: string
  city: string
  description: string
  estimatedValue: string
  mileage: string
  model: string
  modelCode: string
  photos: string[]
  state: string
  yearCode: string
  year: string
}

export interface PropertyAssetForm {
  address: string
  bathrooms: string
  bedrooms: string
  builtArea: string
  cep: string
  city: string
  complement: string
  description: string
  district: string
  estimatedValue: string
  floor: string
  landArea: string
  number: string
  photos: string[]
  state: string
  street: string
}
