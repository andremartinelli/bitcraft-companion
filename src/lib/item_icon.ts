// shortcut: the images come straight from BitJita (the game's files are not public);
// if BitJita moves or blocks them, serve copies from public/ and change only this file
const ICONS_HOST = 'https://bitjita.com'

/**
 * The image of an item's icon, from the name the game data gives it
 * ("GeneratedIcons/Items/Berries"). Null when the item has no icon.
 */
export function itemIconUrl(assetName: string | null | undefined): string | null {
  if (!assetName) return null
  // "Items/HexCoin[,3,10,500]": the brackets are the game's sprite settings
  const path = assetName.replace(/\[.*\]$/, '')
  // BitJita keeps every icon under GeneratedIcons/, "Items/Salt" too
  const full = path.startsWith('GeneratedIcons/') ? path : `GeneratedIcons/${path}`
  return `${ICONS_HOST}/${full.split('/').map(encodeURIComponent).join('/')}.webp`
}
