
beforeEach(() => { // eslint-disable-line import/unambiguous
  let testKey = 0
  const randomKey = require('../src/util/randomKey')
  randomKey.default = jest.fn(() => {
    return `randomKey${testKey++}`
  })
  const randomKey2 = require('../../block-tools/src/util/randomKey')
  randomKey2.default = jest.fn(() => {
    return `randomKey${testKey++}`
  })
})
