import assert from 'assert'
import fs from 'fs'
import path from 'path'
import {Value} from 'slate'
import Change from 'slate/lib/models/change'
import {blocksToEditorValue, editorValueToBlocks} from '@sanity/block-tools'
import blocksSchema from '../../../../fixtures/blocksSchema'
import changeToPatches from '../../../../../src/inputs/BlockEditor/utils/changeToPatches'
import {applyAll} from '../../../../../src/simplePatch'

const blockContentType = blocksSchema.get('blogPost').fields.find(field => field.name === 'body')
  .type

function deserialize(value) {
  return Value.fromJSON(blocksToEditorValue(value, blockContentType))
}

describe('changesToPatches', () => {
  const tests = fs.readdirSync(__dirname)
  tests.forEach(test => {
    if (test[0] === '.' || path.extname(test).length > 0) {
      return
    }
    it(test, () => {
      const dir = path.resolve(__dirname, test)
      const input = JSON.parse(fs.readFileSync(path.resolve(dir, 'input.json')))
      const slateValue = deserialize(input)
      const operations = JSON.parse(fs.readFileSync(path.resolve(dir, 'operations.json')))
      const change = new Change({value: slateValue})
      change.applyOperations(operations)
      const patches = changeToPatches(change, input, blockContentType)
      const expectedValue = editorValueToBlocks(
        change.value.toJSON({preserveKeys: true}),
        blockContentType
      )
      // console.log(JSON.stringify(patches, null, 2))
      const receivedValue = applyAll(input, patches.patches)
      // console.log(JSON.stringify(receivedValue, null, 2))
      assert.deepEqual(receivedValue, expectedValue)
    })
  })
})
