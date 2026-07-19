import path from 'node:path'
import { test } from '../test-fixtures.js'
import { REAL_PRODUCT_FIXTURES } from '../fixtures/real-products.js'
import { runDecodableFixtureTest, fakeCameraLaunchArgs } from './_shared.js'

const fixture = REAL_PRODUCT_FIXTURES.find((f) => f.id === 'meyers-cleaning-spray')!

test.use({
  launchOptions: {
    args: fakeCameraLaunchArgs(path.join(import.meta.dirname, '..', 'fixtures', `${fixture.id}.y4m`)),
  },
})

runDecodableFixtureTest(fixture)
