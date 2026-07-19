// Metadata for the real-product-photo fixtures in e2e/fixtures/*.y4m,
// generated from the phone photos in e2e/images/ by
// scripts/generate-real-photo-fixtures.py.
//
// Barcode values here are ground truth, established two ways before being
// used in any test: (1) an actual ZXing decode of the processed image,
// run standalone in Node against pngjs-loaded pixels (not through a
// browser), and (2) cross-checked against the human-readable digits
// printed under the bars on each label. Both agreed for every fixture
// listed as decodable below.

export interface RealProductFixture {
  /** Matches e2e/fixtures/<id>.y4m and e2e/images/<id>.jpg */
  id: string
  /** Ground-truth barcode value, confirmed as described above. */
  barcode: string
  /** Name to type into the app's "new product" form during the test. */
  productName: string
  /**
   * Whether ZXing actually decodes this fixture. `dog-treat` is real,
   * unedited camera-shake blur — tried at four rotations, with contrast
   * boost, sharpening, and a tight crop around just the barcode, and it
   * still doesn't decode. That's kept as a fixture on purpose: it's a
   * realistic "camera can't read this, fall back to manual entry" case,
   * not a bug in the fixture pipeline.
   */
  decodable: boolean
}

export const REAL_PRODUCT_FIXTURES: RealProductFixture[] = [
  {
    id: 'green-mountain-chips',
    barcode: '053852003002',
    productName: 'Green Mountain Gringo Tortilla Chips',
    decodable: true,
  },
  {
    id: 'kerrigold',
    barcode: '767707014302',
    productName: 'Kerrygold Pure Irish Butter',
    decodable: true,
  },
  {
    id: 'meyers-cleaning-spray',
    barcode: '808124117426',
    productName: "Mrs. Meyer's Clean Day Spray",
    decodable: true,
  },
  {
    id: 'vermont-meat-stick',
    barcode: '606274329870',
    productName: 'Vermont Smoke & Cure Meat Stick',
    decodable: true,
  },
  {
    id: 'dog-treat',
    barcode: '072745976971',
    productName: 'Full Moon Chicken Jerky Minis',
    decodable: false,
  },
]
