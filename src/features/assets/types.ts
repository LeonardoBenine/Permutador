export type AssetType = 'car' | 'house' | 'apartment' | 'land'

interface AssetBase {
  createdAt: string
  description: string
  id: string
  ownerEmail: string
  ownerName: string
  photos: string[]
  type: AssetType
}

export interface CarAsset extends AssetBase {
  brand: string
  mileage: number
  model: string
  type: 'car'
  year: number
}

interface PropertyAssetBase extends AssetBase {
  address: string
  bathrooms: number
  bedrooms: number
  landArea: number
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

export interface AssetSwipeRecord {
  createdAt: string
  decision: SwipeDecision
  id: string
  ownerEmail: string
  ownAssetId: string
  targetAssetId: string
}

export interface CarAssetForm {
  brand: string
  mileage: string
  model: string
  photos: string[]
  year: string
}

export interface PropertyAssetForm {
  address: string
  bathrooms: string
  bedrooms: string
  builtArea: string
  description: string
  floor: string
  landArea: string
  photos: string[]
}
