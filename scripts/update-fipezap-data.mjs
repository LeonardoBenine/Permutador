import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { read, utils } from 'xlsx'

const FIPEZAP_SERIES_URL =
  'https://downloads.fipe.org.br/indices/fipezap/fipezap-serieshistoricas.xlsx'

const CURRENT_FILE = fileURLToPath(import.meta.url)
const ROOT_DIR = path.resolve(path.dirname(CURRENT_FILE), '..')
const TARGET_PATH = path.join(
  ROOT_DIR,
  'src',
  'features',
  'assets',
  'fipezapResidentialSaleData.ts',
)

function normalizeText(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

function normalizeCityStateKey(city, state) {
  return `${normalizeText(city)}|${String(state).trim().toUpperCase()}`
}

function parsePriceToNumber(value) {
  const raw = String(value ?? '').trim()

  if (!raw || raw === '.' || raw.toLowerCase() === 'não disponível') {
    return null
  }

  if (/^\d{1,3}(,\d{3})+$/.test(raw)) {
    return Number(raw.replace(/,/g, ''))
  }

  if (/^\d+,\d+$/.test(raw)) {
    return Number(raw.replace(',', '.'))
  }

  if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
    return Number(raw.replace(/\./g, ''))
  }

  const fallback = Number(raw.replace(/[^\d.-]/g, ''))
  return Number.isFinite(fallback) ? fallback : null
}

async function loadWorkbook() {
  const response = await fetch(FIPEZAP_SERIES_URL)

  if (!response.ok) {
    throw new Error(`Falha ao baixar planilha FIPEZAP (${response.status})`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  return read(buffer, { type: 'buffer' })
}

function extractCityPrices(workbook) {
  const summarySheet = workbook.Sheets.Resumo

  if (!summarySheet) {
    throw new Error('Aba "Resumo" não encontrada na planilha FIPEZAP.')
  }

  const rows = utils.sheet_to_json(summarySheet, {
    defval: '',
    header: 1,
    raw: false,
  })

  const referenceDate = String(rows[5]?.[6] ?? '').trim() || 'unknown'
  const cityPrices = {}

  for (const row of rows) {
    const city = String(row[1] ?? '').trim()
    const state = String(row[2] ?? '').trim().toUpperCase()
    const salePrice = parsePriceToNumber(row[6])

    if (!city || state.length !== 2 || salePrice === null || salePrice <= 0) {
      continue
    }

    cityPrices[normalizeCityStateKey(city, state)] = Math.round(salePrice)
  }

  return { cityPrices, referenceDate }
}

function buildOutput({ cityPrices, referenceDate }) {
  const lines = []
  lines.push('// Arquivo gerado automaticamente por scripts/update-fipezap-data.mjs')
  lines.push('// Não editar manualmente.')
  lines.push(
    "export const FIPEZAP_RESIDENTIAL_SOURCE = 'Índice FipeZAP (venda residencial)';",
  )
  lines.push(
    `export const FIPEZAP_RESIDENTIAL_REFERENCE = ${JSON.stringify(referenceDate)};`,
  )
  lines.push(
    `export const FIPEZAP_RESIDENTIAL_UPDATED_AT = ${JSON.stringify(new Date().toISOString())};`,
  )
  lines.push('')
  lines.push('export const FIPEZAP_RESIDENTIAL_CITY_M2: Record<string, number> = {')

  const sortedEntries = Object.entries(cityPrices).sort((a, b) =>
    a[0].localeCompare(b[0], 'pt-BR'),
  )

  for (const [key, value] of sortedEntries) {
    lines.push(`  ${JSON.stringify(key)}: ${value},`)
  }

  lines.push('}')
  lines.push('')

  return lines.join('\n')
}

async function main() {
  const workbook = await loadWorkbook()
  const extracted = extractCityPrices(workbook)
  const output = buildOutput(extracted)

  await mkdir(path.dirname(TARGET_PATH), { recursive: true })
  await writeFile(TARGET_PATH, output, 'utf8')

  console.log(
    `FIPEZAP atualizado com ${Object.keys(extracted.cityPrices).length} cidades (${extracted.referenceDate}).`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
