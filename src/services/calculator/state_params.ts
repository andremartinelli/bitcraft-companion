import { z } from 'zod'
import type { CalculatorState } from '@/services/calculator/production_planner'

/**
 * The calculator state: validated (the same rules for the quick calculator's
 * URL and for a plan's saves), written to and read from a short URL, and
 * changed by the panel. Pure: it runs in the browser too.
 *
 * URL: ?t=157x10,388x1 (items x quantity), b=812x1 (buildings),
 * c=157:raw,155:999 (recipe chosen per item), o=157:0 ("já tenho"),
 * inv=0 (inventory off; on is the default).
 */

export const MAX_TARGETS = 30
export const MAX_BUILDINGS = 30
export const MAX_QUANTITY = 100_000
export const MAX_BUILDING_QUANTITY = 1_000
export const MAX_OWNED = 1_000_000

const id = z.number().int().positive()
const itemKey = z.string().regex(/^\d+$/)

export const calculatorStateSchema = z.object({
  targets: z
    .array(z.object({ itemId: id, quantity: z.number().int().min(1).max(MAX_QUANTITY) }))
    .max(MAX_TARGETS),
  buildings: z
    .array(z.object({ recipeId: id, quantity: z.number().int().min(1).max(MAX_BUILDING_QUANTITY) }))
    .max(MAX_BUILDINGS),
  choices: z.record(itemKey, z.union([z.literal('raw'), id])),
  owned: z.record(itemKey, z.number().int().min(0).max(MAX_OWNED)),
})

/** The same messages as before, by what went wrong */
function messageFor(path: PropertyKey[], code: string) {
  const [field, , key] = path
  if (field === 'targets' && key === 'quantity') {
    return 'A quantidade precisa ser um número inteiro entre 1 e 100.000.'
  }
  if (field === 'buildings' && key === 'quantity') {
    return 'A quantidade de uma construção precisa ser um número inteiro entre 1 e 1.000.'
  }
  if (field === 'owned') return 'O "já tenho" precisa ser um número inteiro entre 0 e 1.000.000.'
  if (field === 'targets' && code === 'too_big')
    return 'Dá para calcular no máximo 30 itens de uma vez.'
  if (field === 'buildings' && code === 'too_big') {
    return 'Dá para calcular no máximo 30 construções de uma vez.'
  }
  return 'Alguns dados do cálculo são inválidos.'
}

export const emptyState = (): CalculatorState => ({
  targets: [],
  buildings: [],
  choices: {},
  owned: {},
})

export interface ReadState {
  state: CalculatorState
  /** Messages to show; the state is then empty */
  errors: string[]
}

/** Validates a state that came from outside (a URL, a form, an action). Never throws */
export function validateState(input: unknown): ReadState {
  const result = calculatorStateSchema.safeParse(input)
  if (!result.success) {
    const messages = result.error.issues.map((issue) => messageFor(issue.path, issue.code))
    return { state: emptyState(), errors: [...new Set(messages)] }
  }
  const { targets, buildings, choices, owned } = result.data
  return {
    state: {
      targets,
      buildings,
      choices: Object.fromEntries(Object.entries(choices).map(([k, v]) => [Number(k), v])),
      owned: Object.fromEntries(Object.entries(owned).map(([k, v]) => [Number(k), v])),
    },
    errors: [],
  }
}

type Params = Record<string, string | string[] | undefined>

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

/** "157x10,388x1" → pairs; a piece that is not "<number>x<number>" makes the list invalid */
function pairs(value: string | undefined, separator: string): [string, string][] | null {
  if (!value) return []
  const out: [string, string][] = []
  for (const piece of value.split(',')) {
    const at = piece.indexOf(separator)
    if (at <= 0 || at === piece.length - 1) return null
    out.push([piece.slice(0, at), piece.slice(at + 1)])
  }
  return out
}

const num = (text: string) => (/^\d+$/.test(text) ? Number(text) : NaN)

/** The quick calculator's state, from its URL */
export function readStateFromQuery(params: Params): ReadState {
  const targets = pairs(first(params.t), 'x')
  const buildings = pairs(first(params.b), 'x')
  const choices = pairs(first(params.c), ':')
  const owned = pairs(first(params.o), ':')
  if (!targets || !buildings || !choices || !owned) {
    return { state: emptyState(), errors: ['Alguns dados do cálculo são inválidos.'] }
  }
  return validateState({
    targets: targets.map(([itemId, quantity]) => ({
      itemId: num(itemId),
      quantity: num(quantity),
    })),
    buildings: buildings.map(([recipeId, quantity]) => ({
      recipeId: num(recipeId),
      quantity: num(quantity),
    })),
    choices: Object.fromEntries(choices.map(([k, v]) => [k, v === 'raw' ? 'raw' : num(v)])),
    owned: Object.fromEntries(owned.map(([k, v]) => [k, num(v)])),
  })
}

/** The state as the quick calculator's URL query ("" when empty) */
export function stateToQuery(state: CalculatorState): string {
  const params: string[] = []
  const add = (key: string, list: string[]) =>
    list.length && params.push(`${key}=${list.join(',')}`)
  add(
    't',
    state.targets.map((t) => `${t.itemId}x${t.quantity}`)
  )
  add(
    'b',
    (state.buildings ?? []).map((b) => `${b.recipeId}x${b.quantity}`)
  )
  add(
    'c',
    Object.entries(state.choices).map(([itemId, choice]) => `${itemId}:${choice}`)
  )
  add(
    'o',
    Object.entries(state.owned).map(([itemId, quantity]) => `${itemId}:${quantity}`)
  )
  return params.join('&')
}

/* ---------------------------------------------------- changes from the panel */

/** A new item goes last, with 1; one already there stays as it is */
export function addTarget(state: CalculatorState, itemId: number): CalculatorState {
  if (state.targets.some((t) => t.itemId === itemId)) return state
  return { ...state, targets: [...state.targets, { itemId, quantity: 1 }] }
}

export function removeTarget(state: CalculatorState, index: number): CalculatorState {
  return { ...state, targets: state.targets.filter((_, i) => i !== index) }
}

export function setTargetQuantity(
  state: CalculatorState,
  index: number,
  quantity: number
): CalculatorState {
  return {
    ...state,
    targets: state.targets.map((t, i) => (i === index ? { ...t, quantity } : t)),
  }
}

export function addBuilding(state: CalculatorState, recipeId: number): CalculatorState {
  const buildings = state.buildings ?? []
  if (buildings.some((b) => b.recipeId === recipeId)) return state
  return { ...state, buildings: [...buildings, { recipeId, quantity: 1 }] }
}

export function removeBuilding(state: CalculatorState, index: number): CalculatorState {
  return { ...state, buildings: (state.buildings ?? []).filter((_, i) => i !== index) }
}

export function setBuildingQuantity(
  state: CalculatorState,
  index: number,
  quantity: number
): CalculatorState {
  return {
    ...state,
    buildings: (state.buildings ?? []).map((b, i) => (i === index ? { ...b, quantity } : b)),
  }
}

/** "" (Automático) removes the choice */
export function setChoice(state: CalculatorState, itemId: number, value: string): CalculatorState {
  const choices = { ...state.choices }
  if (value === '') delete choices[itemId]
  else choices[itemId] = value === 'raw' ? 'raw' : Number(value)
  return { ...state, choices }
}

/** "" removes the value typed by hand (the inventory counts again); 0 is kept */
export function setOwned(state: CalculatorState, itemId: number, value: string): CalculatorState {
  const owned = { ...state.owned }
  if (value.trim() === '') delete owned[itemId]
  else owned[itemId] = Number(value)
  return { ...state, owned }
}

