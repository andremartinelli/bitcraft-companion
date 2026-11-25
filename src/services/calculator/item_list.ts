import type { CalculatorState } from '@/services/calculator/production_planner'
import {
  MAX_BUILDING_QUANTITY,
  MAX_BUILDINGS,
  MAX_QUANTITY,
  MAX_TARGETS,
} from '@/services/calculator/state_params'

/**
 * A list pasted into the calculator's "Adicionar item ou construção" (often
 * written by an AI assistant): one item per line ("10 Rough Plank",
 * "Rough Plank x10", "Rough Plank: 10") or JSON
 * ([{"name": "Rough Plank", "quantity": 10}]). Pure: the picker uses
 * `looksLikeList` in the browser; the server parses and resolves the names.
 */

export interface ListLine {
  /** "Linha 2", or "Item 2" in JSON */
  where: string
  name: string
  quantity: number
}

/** Each line or JSON entry in order: what it asks for, or why it is wrong */
export type ParsedEntry = ListLine | { error: string }

/** What the server found for a list: everything, or only errors */
export interface ResolvedList {
  items: { itemId: number; name: string; quantity: number }[]
  buildings: { recipeId: number; name: string; quantity: number }[]
  errors: string[]
}

export const MAX_LIST_LENGTH = 20_000

const BULLET = /^(?:[-*•]|\d+[.)])\s+/
const QUANTITY = String.raw`(\d{1,3}(?:[.,]\d{3})+|\d+)`
const LEADING = new RegExp(String.raw`^${QUANTITY}\s*[x×]?\s+(.+)$`, 'i')
// The x needs a space before it: "Flax 10" is a name without a quantity, not "Fla" x 10
const TRAILING = new RegExp(String.raw`^(.+?)(?:\s+[x×]\s*|\s*:\s*)${QUANTITY}$`, 'i')

/** "1.000" and "1,000" are a thousand: lists have whole quantities */
const quantityOf = (text: string) => Number(text.replace(/[.,]/g, ''))

const quote = (text: string) => `“${text.length > 60 ? `${text.slice(0, 60)}…` : text}”`

/** The pasted text is a list, not a name to search ("Rough Plank" stays a search) */
export function looksLikeList(text: string) {
  const trimmed = text.trim()
  if (/[\r\n]/.test(trimmed) || /^(\[|```)/.test(trimmed)) return true
  const line = trimmed.replace(BULLET, '')
  return LEADING.test(line) || TRAILING.test(line)
}

function parseLine(text: string): { name: string; quantity: number } | null {
  const line = text.replace(BULLET, '').trim()
  const leading = LEADING.exec(line)
  if (leading) return { quantity: quantityOf(leading[1]), name: leading[2].trim() }
  const trailing = TRAILING.exec(line)
  if (trailing) return { name: trailing[1].trim(), quantity: quantityOf(trailing[2]) }
  return null
}

function parseJson(text: string): ParsedEntry[] {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return [{ error: 'O JSON está inválido. Confira as aspas, as vírgulas e os colchetes.' }]
  }
  if (!Array.isArray(data)) {
    return [{ error: 'O JSON precisa ser uma lista: [{"name": "Rough Plank", "quantity": 10}].' }]
  }
  return data.map((entry, index): ParsedEntry => {
    const where = `Item ${index + 1}`
    const { name, quantity } = (entry ?? {}) as { name?: unknown; quantity?: unknown }
    if (typeof name !== 'string' || !name.trim()) return { error: `${where}: falta o "name".` }
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) {
      return {
        error: `${where}, ${quote(name)}: o "quantity" precisa ser um número inteiro maior que zero.`,
      }
    }
    return { where, name: name.trim(), quantity }
  })
}

/** Every line or JSON entry, in order; blank lines are skipped */
export function parseItemList(text: string): ParsedEntry[] {
  // Assistants often wrap JSON in a ```json fence
  const trimmed = text.trim().replace(/^```\w*\s*([\s\S]*?)\s*```$/, '$1')
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) return parseJson(trimmed)
  const entries = text.split(/\r?\n/).flatMap((raw, index): ParsedEntry[] => {
    if (!raw.trim()) return []
    const where = `Linha ${index + 1}`
    const parsed = parseLine(raw)
    if (!parsed) {
      return [
        { error: `${where}, ${quote(raw.trim())}: falta a quantidade (ex.: 10 Rough Plank).` },
      ]
    }
    if (parsed.quantity < 1) {
      return [
        { error: `${where}, ${quote(parsed.name)}: a quantidade precisa ser maior que zero.` },
      ]
    }
    return [{ where, ...parsed }]
  })
  return entries.length ? entries : [{ error: 'A lista está vazia.' }]
}

/** Edit distance, for "Quis dizer …?" */
export function levenshtein(a: string, b: string) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
    previous = current
  }
  return previous[b.length]
}

/**
 * The list added to the calculator: an item or building it already has
 * gets the quantity summed. All or nothing: over a limit, the state stays
 * as it was and the errors say why.
 */
export function addItemList(
  state: CalculatorState,
  list: Pick<ResolvedList, 'items' | 'buildings'>
): { state: CalculatorState; errors: string[] } {
  const targets = new Map(state.targets.map((t) => [t.itemId, t.quantity]))
  for (const { itemId, quantity } of list.items) {
    targets.set(itemId, (targets.get(itemId) ?? 0) + quantity)
  }
  const buildings = new Map((state.buildings ?? []).map((b) => [b.recipeId, b.quantity]))
  for (const { recipeId, quantity } of list.buildings) {
    buildings.set(recipeId, (buildings.get(recipeId) ?? 0) + quantity)
  }

  const errors: string[] = []
  if (targets.size > MAX_TARGETS) {
    errors.push(
      `Com a lista, o cálculo ficaria com ${targets.size} itens; o máximo é ${MAX_TARGETS}.`
    )
  }
  if (buildings.size > MAX_BUILDINGS) {
    errors.push(
      `Com a lista, o cálculo ficaria com ${buildings.size} construções; o máximo é ${MAX_BUILDINGS}.`
    )
  }
  for (const { itemId, name } of list.items) {
    if (targets.get(itemId)! > MAX_QUANTITY) {
      errors.push(`${name}: somando com o que já está no cálculo, passaria de 100.000.`)
      targets.set(itemId, 0) // one message per item
    }
  }
  for (const { recipeId, name } of list.buildings) {
    if (buildings.get(recipeId)! > MAX_BUILDING_QUANTITY) {
      errors.push(`${name}: somando com o que já está no cálculo, passaria de 1.000.`)
      buildings.set(recipeId, 0)
    }
  }
  if (errors.length) return { state, errors }

  return {
    state: {
      ...state,
      targets: [...targets].map(([itemId, quantity]) => ({ itemId, quantity })),
      buildings: [...buildings].map(([recipeId, quantity]) => ({ recipeId, quantity })),
    },
    errors: [],
  }
}
