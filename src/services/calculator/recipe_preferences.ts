import type { GraphRecipe, RecipeGraph } from '@/services/calculator/recipe_graph'
import { GATHERING_PROFESSIONS } from '@/services/calculator/steps_view'

/**
 * How players normally make an item, when the game data says nothing about it
 * (decided 2026-11-27 with the owner, checked against 47 recipes he marked by
 * hand). Each rule adds to a recipe's penalty; the default recipe has the
 * lowest one (see defaultProducer).
 */

const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic']

/** Recipes the owner chose by hand: item name -> a text that only the standard recipe's inputs have */
const STANDARD_INPUT: Record<string, string> = {
  // The other one stitches a Dried Boot
  'Sturdy Leather': 'Sturdy Tanned Pelt',
}

/**
 * Nothing crafts it and only a skill that is not a gathering profession
 * "gathers" it: Hexite Wood Fragment, Ancient Mortar, Uncharted Silk Cloth,
 * Stone Diagrams. They come from ruins and the Hexite reserve, not from work.
 */
function isSpecial(graph: RecipeGraph, itemId: number) {
  const skill = graph.gatherers.get(itemId)
  return !graph.producers.has(itemId) && !!skill && !GATHERING_PROFESSIONS.includes(skill)
}

/** The penalty of making `itemId` with `recipe`: 0 is how it is normally made */
export function recipePenalty(graph: RecipeGraph, itemId: number, recipe: GraphRecipe) {
  const item = graph.items.get(itemId)
  const inputs = recipe.inputs.map((input) => graph.items.get(input.itemId))
  let penalty = 0
  // Special inputs (Hexite, ruins) only when nothing else makes it
  if (recipe.inputs.some((input) => isSpecial(graph, input.itemId))) penalty += 1000
  // Cooking experiments and trophy fish are side roads
  if (recipe.name.includes('Experiment')) penalty += 100
  if (recipe.name.includes('Trophy')) penalty += 100
  // Tools, weapons, armor and clothing: from the previous tier at the lowest
  // rarity; the rarity only changes the chance of the result
  const previous = item && inputs.find((input) => input?.tag === item.tag)
  if (previous) penalty += Math.max(0, RARITIES.indexOf(previous.rarity ?? 'Common')) * 10
  // Fish oil comes from the lake fish of its tier
  if (item?.name.endsWith('Fish Oil') && !inputs.some((input) => input?.tag === 'Lake Fish')) {
    penalty += 5
  }
  // Amber resin from splitting the trunk, not the bark
  if (recipe.name.includes('Tree Bark Output')) penalty += 5
  const standard = item && STANDARD_INPUT[item.name]
  if (standard && !inputs.some((input) => input?.name === standard)) penalty += 5
  return penalty
}
