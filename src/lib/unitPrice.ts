import type { Product } from './db'

export interface UnitPrice {
  value: number
  label: string
}

/**
 * Price per unit of a product's declared size, e.g. $2.79/lb.
 *
 * Returns null when the product has no size on file (or size is unusable) —
 * callers should fall back to showing the sticker price with a caveat
 * rather than guessing at a size. Size lives on the Product record, not the
 * PriceEntry, so every price entry for a given product shares the same
 * divisor; unit price and sticker price therefore rank stores identically
 * for a single product. It's still worth computing and showing, both
 * because "$2.79/lb" is more legible than a bag price on its own and
 * because it's the number that stays comparable if products ever get
 * merged/matched across different package sizes later.
 */
export function computeUnitPrice(
  price: number,
  product: Pick<Product, 'sizeValue' | 'sizeUnit'>,
): UnitPrice | null {
  if (!product.sizeValue || product.sizeValue <= 0 || !product.sizeUnit) return null
  const value = price / product.sizeValue
  return { value, label: `$${value.toFixed(2)}/${product.sizeUnit}` }
}
