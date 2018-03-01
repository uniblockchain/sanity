import randomKey from '../src/inputs/BlockEditor/utils/randomKey'
import randomKey2 from '@sanity/block-tools/lib/util/randomKey'
import {setKeyGenerator} from 'slate'


beforeEach(() => {
  let mockIndex = 0
  const mockKeyFn = () => `randomKey${mockIndex++}`

  jest.mock('../src/inputs/BlockEditor/utils/randomKey', () => {
    return mockKeyFn
  })

  jest.mock('@sanity/block-tools/lib/util/randomKey', () => {
    return mockKeyFn
  })

  setKeyGenerator(mockKeyFn)
})
