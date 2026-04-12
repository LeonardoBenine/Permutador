import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import brandLogo from '../../assets/logo-permutador-oficial.png'
import type { AuthUser } from '../auth/types'
import { assetsService } from './assetsService'
import type {
  ApartmentAsset,
  AssetRecord,
  AssetSwipeRecord,
  AssetType,
  CarAsset,
  CarAssetForm,
  HouseAsset,
  LandAsset,
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

function createInitialCarForm(): CarAssetForm {
  return {
    brand: '',
    mileage: '',
    model: '',
    photos: [],
    year: '',
  }
}

function createInitialPropertyForm(): PropertyAssetForm {
  return {
    address: '',
    bathrooms: '',
    bedrooms: '',
    builtArea: '',
    description: '',
    floor: '',
    landArea: '',
    photos: [],
  }
}

function parsePositiveNumber(value: string): number {
  return Number(value.replace(',', '.'))
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(value)
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('pt-BR', {
    day: '2-digit',
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
        reject(new Error('Nao foi possivel processar uma das imagens.'))
        return
      }

      resolve(result)
    }

    reader.onerror = () => {
      reject(new Error('Nao foi possivel processar uma das imagens.'))
    }

    reader.readAsDataURL(file)
  })
}

function propertyValidationError(
  form: PropertyAssetForm,
  options: { includeBuiltArea: boolean; includeFloor: boolean },
): string | null {
  if (!form.address.trim()) {
    return 'Preencha o endereco do imovel.'
  }

  const landArea = parsePositiveNumber(form.landArea)

  if (Number.isNaN(landArea) || landArea <= 0) {
    return 'Informe a metragem do terreno com valor valido.'
  }

  if (options.includeBuiltArea) {
    const builtArea = parsePositiveNumber(form.builtArea)

    if (Number.isNaN(builtArea) || builtArea <= 0) {
      return 'Informe a area construida com valor valido.'
    }
  }

  const bathrooms = parsePositiveNumber(form.bathrooms)

  if (Number.isNaN(bathrooms) || bathrooms < 0) {
    return 'Informe a quantidade de banheiros com valor valido.'
  }

  const bedrooms = parsePositiveNumber(form.bedrooms)

  if (Number.isNaN(bedrooms) || bedrooms < 0) {
    return 'Informe a quantidade de quartos com valor valido.'
  }

  if (options.includeFloor) {
    const floor = parsePositiveNumber(form.floor)

    if (Number.isNaN(floor) || floor < 0) {
      return 'Informe o andar com valor valido.'
    }
  }

  return null
}

type AppMenu = 'assets' | 'tinder'

function getAssetHeadline(asset: AssetRecord): string {
  if (asset.type === 'car') {
    return `${asset.brand} ${asset.model} ${asset.year}`
  }

  return asset.address
}

export function AssetsScreen({ onLogout, user }: AssetsScreenProps) {
  const [assetType, setAssetType] = useState<AssetType>('car')
  const [activeMenu, setActiveMenu] = useState<AppMenu>('assets')
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
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
  const [selectedOwnAssetId, setSelectedOwnAssetId] = useState('')

  const ownerFirstName = useMemo(
    () => user.name.trim().split(' ')[0] || 'Usuario',
    [user.name],
  )

  const marketplaceAssets = useMemo(
    () => assetsService.listMarketplaceAssets(user.email),
    [assets, user.email],
  )

  const selectedOwnAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedOwnAssetId) ?? null,
    [assets, selectedOwnAssetId],
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
      marketplaceAssets.filter((asset) => {
        return !seenTargetIds.has(asset.id)
      }),
    [marketplaceAssets, seenTargetIds],
  )

  const currentCandidate = tinderQueue[0] ?? null

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

  function clearFeedback() {
    if (feedback) {
      setFeedback(null)
    }
  }

  function resetAllForms() {
    setCarForm(createInitialCarForm())
    setHouseForm(createInitialPropertyForm())
    setApartmentForm(createInitialPropertyForm())
    setLandForm(createInitialPropertyForm())
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
      setFeedback({ text: 'Nenhuma imagem valida foi selecionada.', tone: 'error' })
      return
    }

    try {
      const photoUrls = await Promise.all(validFiles.map((file) => readFileAsDataUrl(file)))
      appendPhotos(type, photoUrls)

      if (oversizedFiles.length > 0 || nonImageFiles.length > 0) {
        setFeedback({
          text: 'Alguns arquivos foram ignorados. Use apenas imagens ate 5MB.',
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

    if (type === 'house') {
      setHouseForm((previous) => ({ ...previous, [field]: value }))
      return
    }

    if (type === 'apartment') {
      setApartmentForm((previous) => ({ ...previous, [field]: value }))
      return
    }

    setLandForm((previous) => ({ ...previous, [field]: value }))
  }

  function startEditingAsset(asset: AssetRecord) {
    setEditingAssetId(asset.id)
    setAssetType(asset.type)

    if (asset.type === 'car') {
      setCarForm({
        brand: asset.brand,
        mileage: String(asset.mileage),
        model: asset.model,
        photos: [...asset.photos],
        year: String(asset.year),
      })
    } else if (asset.type === 'house') {
      setHouseForm({
        address: asset.address,
        bathrooms: String(asset.bathrooms),
        bedrooms: String(asset.bedrooms),
        builtArea: String(asset.builtArea),
        description: asset.description,
        floor: '',
        landArea: String(asset.landArea),
        photos: [...asset.photos],
      })
    } else if (asset.type === 'apartment') {
      setApartmentForm({
        address: asset.address,
        bathrooms: String(asset.bathrooms),
        bedrooms: String(asset.bedrooms),
        builtArea: String(asset.builtArea),
        description: asset.description,
        floor: String(asset.floor),
        landArea: String(asset.landArea),
        photos: [...asset.photos],
      })
    } else {
      setLandForm({
        address: asset.address,
        bathrooms: String(asset.bathrooms),
        bedrooms: String(asset.bedrooms),
        builtArea: '',
        description: asset.description,
        floor: '',
        landArea: String(asset.landArea),
        photos: [...asset.photos],
      })
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
      text: 'Edicao cancelada. Voce pode cadastrar um novo ativo.',
      tone: 'info',
    })
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
    setSwipeFeedback({
      text:
        decision === 'like'
          ? 'Ativo marcado como troca interessante.'
          : 'Ativo pulado. Vamos para o proximo.',
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
    setSwipeFeedback({
      text: 'Pilha reiniciada. Os ativos voltaram para avaliacao.',
      tone: 'info',
    })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      setIsSaving(true)
      setFeedback(null)

      if (assetType === 'car') {
        if (!carForm.brand.trim() || !carForm.model.trim()) {
          throw new Error('Preencha marca e modelo do carro.')
        }

        const year = parsePositiveNumber(carForm.year)

        if (
          Number.isNaN(year) ||
          year < 1900 ||
          year > new Date().getFullYear() + 1
        ) {
          throw new Error('Informe um ano valido para o carro.')
        }

        const mileage = parsePositiveNumber(carForm.mileage)

        if (Number.isNaN(mileage) || mileage < 0) {
          throw new Error('Informe a quilometragem com valor valido.')
        }

        const isEditing = Boolean(editingAssetId)
        const savedAsset = editingAssetId
          ? await assetsService.updateAsset(user, editingAssetId, {
              brand: carForm.brand.trim(),
              description: '',
              mileage,
              model: carForm.model.trim(),
              photos: carForm.photos,
              type: 'car',
              year,
            } as Omit<CarAsset, 'createdAt' | 'id' | 'ownerEmail' | 'ownerName'>)
          : await assetsService.createAsset(user, {
              brand: carForm.brand.trim(),
              description: '',
              mileage,
              model: carForm.model.trim(),
              photos: carForm.photos,
              type: 'car',
              year,
            } as Omit<CarAsset, 'createdAt' | 'id' | 'ownerEmail' | 'ownerName'>)

        upsertAssetList(savedAsset, isEditing)
        setCarForm(createInitialCarForm())
        setEditingAssetId(null)
        setFeedback({
          text: isEditing ? 'Carro atualizado com sucesso.' : 'Carro cadastrado com sucesso.',
          tone: 'success',
        })
        return
      }

      if (assetType === 'house') {
        const error = propertyValidationError(houseForm, {
          includeBuiltArea: true,
          includeFloor: false,
        })

        if (error) {
          throw new Error(error)
        }

        const isEditing = Boolean(editingAssetId)
        const savedAsset = editingAssetId
          ? await assetsService.updateAsset(user, editingAssetId, {
              address: houseForm.address.trim(),
              bathrooms: parsePositiveNumber(houseForm.bathrooms),
              bedrooms: parsePositiveNumber(houseForm.bedrooms),
              builtArea: parsePositiveNumber(houseForm.builtArea),
              description: houseForm.description.trim(),
              landArea: parsePositiveNumber(houseForm.landArea),
              photos: houseForm.photos,
              type: 'house',
            } as Omit<HouseAsset, 'createdAt' | 'id' | 'ownerEmail' | 'ownerName'>)
          : await assetsService.createAsset(user, {
              address: houseForm.address.trim(),
              bathrooms: parsePositiveNumber(houseForm.bathrooms),
              bedrooms: parsePositiveNumber(houseForm.bedrooms),
              builtArea: parsePositiveNumber(houseForm.builtArea),
              description: houseForm.description.trim(),
              landArea: parsePositiveNumber(houseForm.landArea),
              photos: houseForm.photos,
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
        const error = propertyValidationError(apartmentForm, {
          includeBuiltArea: true,
          includeFloor: true,
        })

        if (error) {
          throw new Error(error)
        }

        const isEditing = Boolean(editingAssetId)
        const savedAsset = editingAssetId
          ? await assetsService.updateAsset(user, editingAssetId, {
              address: apartmentForm.address.trim(),
              bathrooms: parsePositiveNumber(apartmentForm.bathrooms),
              bedrooms: parsePositiveNumber(apartmentForm.bedrooms),
              builtArea: parsePositiveNumber(apartmentForm.builtArea),
              description: apartmentForm.description.trim(),
              floor: parsePositiveNumber(apartmentForm.floor),
              landArea: parsePositiveNumber(apartmentForm.landArea),
              photos: apartmentForm.photos,
              type: 'apartment',
            } as Omit<ApartmentAsset, 'createdAt' | 'id' | 'ownerEmail' | 'ownerName'>)
          : await assetsService.createAsset(user, {
              address: apartmentForm.address.trim(),
              bathrooms: parsePositiveNumber(apartmentForm.bathrooms),
              bedrooms: parsePositiveNumber(apartmentForm.bedrooms),
              builtArea: parsePositiveNumber(apartmentForm.builtArea),
              description: apartmentForm.description.trim(),
              floor: parsePositiveNumber(apartmentForm.floor),
              landArea: parsePositiveNumber(apartmentForm.landArea),
              photos: apartmentForm.photos,
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

      const landError = propertyValidationError(landForm, {
        includeBuiltArea: false,
        includeFloor: false,
      })

      if (landError) {
        throw new Error(landError)
      }

      const isEditing = Boolean(editingAssetId)
      const savedAsset = editingAssetId
        ? await assetsService.updateAsset(user, editingAssetId, {
            address: landForm.address.trim(),
            bathrooms: parsePositiveNumber(landForm.bathrooms),
            bedrooms: parsePositiveNumber(landForm.bedrooms),
            description: landForm.description.trim(),
            landArea: parsePositiveNumber(landForm.landArea),
            photos: landForm.photos,
            type: 'land',
          } as Omit<LandAsset, 'createdAt' | 'id' | 'ownerEmail' | 'ownerName'>)
        : await assetsService.createAsset(user, {
            address: landForm.address.trim(),
            bathrooms: parsePositiveNumber(landForm.bathrooms),
            bedrooms: parsePositiveNumber(landForm.bedrooms),
            description: landForm.description.trim(),
            landArea: parsePositiveNumber(landForm.landArea),
            photos: landForm.photos,
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
              Ativos
            </button>
            <button
              className={activeMenu === 'tinder' ? 'active' : ''}
              onClick={() => {
                setActiveMenu('tinder')
                setFeedback(null)
              }}
              type="button"
            >
              Tinder de ativos
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
                  ? 'Gerencie os seus ativos'
                  : 'Escolha ativos para trocas'}
              </span>
            </div>
          </header>

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

                <div
                  className="assets-type-switcher"
                  role="tablist"
                  aria-label="Tipos de ativos"
                >
                  {(Object.keys(assetTypeLabels) as AssetType[]).map((type) => (
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
                            onChange={(event) => {
                              clearFeedback()
                              setCarForm((previous) => ({
                                ...previous,
                                brand: event.target.value,
                              }))
                            }}
                            placeholder="Ex: Toyota"
                            type="text"
                            value={carForm.brand}
                          />
                        </div>

                        <div>
                          <label htmlFor="car-model">Modelo</label>
                          <input
                            id="car-model"
                            onChange={(event) => {
                              clearFeedback()
                              setCarForm((previous) => ({
                                ...previous,
                                model: event.target.value,
                              }))
                            }}
                            placeholder="Ex: Corolla"
                            type="text"
                            value={carForm.model}
                          />
                        </div>
                      </div>

                      <div className="assets-grid-two">
                        <div>
                          <label htmlFor="car-year">Ano</label>
                          <input
                            id="car-year"
                            inputMode="numeric"
                            onChange={(event) => {
                              clearFeedback()
                              setCarForm((previous) => ({
                                ...previous,
                                year: event.target.value,
                              }))
                            }}
                            placeholder="Ex: 2020"
                            type="text"
                            value={carForm.year}
                          />
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
                        form={houseForm}
                        includeBuiltArea
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
                        form={apartmentForm}
                        includeBuiltArea
                        includeFloor
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
                        form={landForm}
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
                    <button className="assets-submit" disabled={isSaving} type="submit">
                      {isSaving
                        ? 'Salvando ativo...'
                        : editingAssetId
                          ? `Atualizar ${assetTypeLabels[assetType]}`
                          : `Cadastrar ${assetTypeLabels[assetType]}`}
                    </button>

                    {editingAssetId ? (
                      <button
                        className="assets-cancel"
                        onClick={cancelEditingAsset}
                        type="button"
                      >
                        Cancelar edicao
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
                    Nenhum ativo cadastrado ainda. Preencha o formulario ao lado para
                    comecar.
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
                              <li>Modelo: {asset.model}</li>
                              <li>Ano: {asset.year}</li>
                              <li>Km: {formatNumber(asset.mileage)}</li>
                            </>
                          ) : null}

                          {asset.type !== 'car' ? (
                            <>
                              <li>Endereco: {asset.address}</li>
                              <li>Terreno: {formatNumber(asset.landArea)} m²</li>
                              {asset.type !== 'land' ? (
                                <li>
                                  Area construida: {formatNumber(asset.builtArea)} m²
                                </li>
                              ) : null}
                              <li>Banheiros: {formatNumber(asset.bathrooms)}</li>
                              <li>Quartos: {formatNumber(asset.bedrooms)}</li>
                              {asset.type === 'apartment' ? (
                                <li>Andar: {formatNumber(asset.floor)}</li>
                              ) : null}
                              {asset.description ? (
                                <li>Descricao: {asset.description}</li>
                              ) : null}
                            </>
                          ) : null}
                        </ul>

                        <button
                          className="asset-edit"
                          onClick={() => {
                            startEditingAsset(asset)
                          }}
                          type="button"
                        >
                          Editar ativo
                        </button>
                      </article>
                    ))}
                  </div>
                )}
              </aside>
            </div>
          ) : (
            <section className="tinder-layout">
              <article className="tinder-card-shell">
                <div className="tinder-header">
                  <p>Tinder de ativos</p>
                  <h2>Escolha o que voce trocaria e avance no match</h2>
                </div>

                {assets.length === 0 ? (
                  <div className="tinder-empty">
                    <p>
                      Voce precisa cadastrar ao menos um ativo para comecar o Tinder.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveMenu('assets')
                      }}
                    >
                      Cadastrar meu primeiro ativo
                    </button>
                  </div>
                ) : (
                  <>
                    <label htmlFor="tinder-own-asset">Ativo que voce quer trocar</label>
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
                    </div>

                    {swipeFeedback ? (
                      <p className={`assets-feedback ${swipeFeedback.tone}`}>
                        {swipeFeedback.text}
                      </p>
                    ) : null}

                    {selectedOwnAsset && currentCandidate ? (
                      <>
                        <div className="tinder-match-grid">
                          <TinderAssetCard
                            asset={selectedOwnAsset}
                            badge="Seu ativo"
                            ownerLabel={ownerFirstName}
                          />
                          <TinderAssetCard
                            asset={currentCandidate}
                            badge="Possivel troca"
                            ownerLabel={currentCandidate.ownerName}
                          />
                        </div>

                        <div className="tinder-actions">
                          <button
                            className="tinder-pass"
                            onClick={() => {
                              handleSwipeDecision('pass')
                            }}
                            type="button"
                          >
                            Passo
                          </button>
                          <button
                            className="tinder-like"
                            onClick={() => {
                              handleSwipeDecision('like')
                            }}
                            type="button"
                          >
                            Troco
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="tinder-empty">
                        <p>Voce avaliou todos os ativos disponiveis para essa pilha.</p>
                      </div>
                    )}

                    <button
                      className="tinder-reset"
                      onClick={handleResetSwipeStack}
                      type="button"
                    >
                      Reiniciar avaliacao desse ativo
                    </button>
                  </>
                )}
              </article>
            </section>
          )}
        </section>
      </main>
    </div>
  )
}

interface TinderAssetCardProps {
  asset: AssetRecord
  badge: string
  ownerLabel: string
}

function TinderAssetCard({ asset, badge, ownerLabel }: TinderAssetCardProps) {
  const coverPhoto = asset.photos[0]

  return (
    <article className="tinder-asset-card">
      <span className="tinder-badge">{badge}</span>
      <p className="tinder-owner">{ownerLabel}</p>
      <h3>{assetTypeLabels[asset.type]}</h3>
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
              <strong>{asset.model}</strong>
            </li>
            <li>
              <span>Ano</span>
              <strong>{asset.year}</strong>
            </li>
            <li>
              <span>Km</span>
              <strong>{formatNumber(asset.mileage)}</strong>
            </li>
          </>
        ) : (
          <>
            <li>
              <span>Endereco</span>
              <strong>{asset.address}</strong>
            </li>
            <li>
              <span>Terreno</span>
              <strong>{formatNumber(asset.landArea)} m²</strong>
            </li>
            {asset.type !== 'land' ? (
              <li>
                <span>Area construida</span>
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

interface PropertyFieldsProps {
  form: PropertyAssetForm
  includeBuiltArea?: boolean
  includeFloor?: boolean
  onFieldChange: (field: keyof PropertyAssetForm, value: string) => void
}

function PropertyFields({
  form,
  includeBuiltArea = false,
  includeFloor = false,
  onFieldChange,
}: PropertyFieldsProps) {
  return (
    <>
      <label htmlFor="property-address">Endereco do imovel</label>
      <input
        id="property-address"
        onChange={(event) => {
          onFieldChange('address', event.target.value)
        }}
        placeholder="Rua, numero, bairro, cidade"
        type="text"
        value={form.address}
      />

      <div className="assets-grid-two">
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

        {includeBuiltArea ? (
          <div>
            <label htmlFor="property-built-area">Area construida (m²)</label>
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

      <label htmlFor="property-description">Descricao</label>
      <textarea
        id="property-description"
        onChange={(event) => {
          onFieldChange('description', event.target.value)
        }}
        placeholder="Adicione detalhes relevantes do ativo"
        rows={4}
        value={form.description}
      />
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
      <small>Voce pode enviar ate 8 fotos por ativo (max. 5MB cada).</small>

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



