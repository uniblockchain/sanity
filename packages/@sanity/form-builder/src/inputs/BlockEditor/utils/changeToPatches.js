// @flow
import type {Block, Type} from '../typeDefs'
import {Change, Range, Operation} from 'slate'
import {flatten} from 'lodash'
import {editorValueToBlocks, normalizeBlock} from '@sanity/block-tools'
import {unset, set, insert, setIfMissing} from '../../../PatchEvent'
import {applyAll} from '../../../simplePatch'
import randomKey from '../utils/randomKey'

const VALUE_TO_JSON_OPTS = {
  preserveData: true,
  preserveKeys: true,
  preserveSelection: false,
  preserveHistory: false
}

// Set a real key on the block inserted by slate in the editor
// before anything is written to the server, when it's time to
// actually write it (user has edited something).
// In other listening block editors, the placeholder block will be replaced with this one.
function removePlaceholderBlockKey(blocks) {
  const first = blocks.find(block => block._key === 'first')
  if (first) {
    first._key = randomKey(12)
    first.children.forEach((child, index) => {
      child._key = `${first._key}${index}`
    })
  }
  return blocks
}

function setNodePatch(change: Change, operation: Operation, blocks: Block[], blockContentType) {
  const appliedBlocks = editorValueToBlocks(
    change.applyOperations([operation]).value.toJSON(VALUE_TO_JSON_OPTS),
    blockContentType
  )
  // Value is undefined
  if (!blocks && appliedBlocks) {
    return setIfMissing(removePlaceholderBlockKey(appliedBlocks))
  }
  // Value is empty
  if (blocks && blocks.length === 0) {
    return set(removePlaceholderBlockKey(appliedBlocks), [])
  }
  const changedBlock = appliedBlocks[operation.path[0]]
  // Ensure that it got the right keys
  if (blocks[operation.path[0]]) {
    changedBlock._key = blocks[operation.path[0]]._key
  }
  if (changedBlock._type === 'block') {
    changedBlock.children.forEach((child, index) => {
      child._key = `${changedBlock._key}${index}`
    })
  }
  // Set the block with new values
  return set(changedBlock, [{_key: changedBlock._key}])
}

function insertNodePatch(change: Change, operation: Operation, blocks: Block[], blockContentType) {
  const patches = []
  const appliedBlocks = editorValueToBlocks(
    change.applyOperations([operation]).value.toJSON(VALUE_TO_JSON_OPTS),
    blockContentType
  )
  if (operation.path.length === 1) {
    if (blocks.length === 0) {
      return [setIfMissing(removePlaceholderBlockKey(appliedBlocks))]
    }
    let position = 'after'
    let afterKey
    if (operation.path[0] === 0) {
      afterKey = blocks[0]._key
      position = 'before'
    } else {
      afterKey = blocks[operation.path[0] - 1]._key
    }
    const newBlock = appliedBlocks[operation.path[0]]
    patches.push(insert([newBlock], position, [{_key: afterKey}]))
  }
  if (operation.path.length === 2) {
    const block = appliedBlocks[operation.path[0]]
    if (block._type === 'block') {
      block.children.forEach((child, index) => {
        child._key = `${block._key}${index}`
      })
      patches.push(set(normalizeBlock(block), [{_key: block._key}]))
    }
  }
  return patches
}

function splitNodePatch(change: Change, operation: Operation, blocks: Block[], blockContentType) {
  const patches = []
  const appliedBlocks = editorValueToBlocks(
    change.applyOperations([operation]).value.toJSON(VALUE_TO_JSON_OPTS),
    blockContentType
  )
  const splitBlock = appliedBlocks[operation.path[0]]
  if (operation.path.length === 1) {
    patches.push(set(splitBlock, [{_key: blocks[operation.path[0]]._key}]))
    const newBlock = appliedBlocks[operation.path[0] + 1]
    patches.push(insert([newBlock], 'after', [{_key: blocks[operation.path[0]]._key}]))
  }
  if (operation.path.length === 2) {
    patches.push(set(splitBlock, [{_key: blocks[operation.path[0]]._key}]))
  }
  return patches
}

function mergeNodePatch(change: Change, operation: Operation, blocks: Block[], blockContentType) {
  const patches = []
  const appliedBlocks = editorValueToBlocks(
    change.applyOperations([operation]).value.toJSON(VALUE_TO_JSON_OPTS),
    blockContentType
  )
  if (operation.path.length === 1) {
    const mergedBlock = blocks[operation.path[0]]
    patches.push(
      unset([
        {
          _key: mergedBlock._key
        }
      ])
    )
    const targetBlock = appliedBlocks[operation.path[0] - 1]
    patches.push(set(targetBlock, [{_key: blocks[operation.path[0] - 1]._key}]))
  }
  if (operation.path.length === 2) {
    const targetBlock = appliedBlocks[operation.path[0]]
    patches.push(set(targetBlock, [{_key: blocks[operation.path[0]]._key}]))
  }
  return patches
}

function moveNodePatch(change: Change, operation: Operation, blocks: Block[], blockContentType) {
  change.applyOperations([operation])
  const patches = []
  if (operation.path.length === 1) {
    if (operation.path[0] === operation.newPath[0]) {
      return []
    }
    const block = blocks[operation.path[0]]
    patches.push(
      unset([
        {
          _key: block._key
        }
      ])
    )
    let position = 'after'
    let posKey
    if (operation.newPath[0] === 0) {
      posKey = blocks[0]._key
      position = 'before'
    } else {
      posKey = blocks[operation.newPath[0] - 1]._key
    }

    patches.push(insert([block], position, [{_key: posKey}]))
  }
  return patches
}

function removeNodePatch(
  change: SlateChange,
  operation: Operation,
  blocks: Block[],
  blockContentType: Type
) {
  change.applyOperations([operation])
  const patches = []
  const block = blocks[operation.path[0]]
  if (operation.path.length === 1) {
    // Unset block
    patches.push(unset([{_key: block._key}]))
  }
  if (operation.path.length === 2) {
    const childToUnset = block.children[operation.path[1]]
    // Keep keys consistent, so replace the whole block
    const newBlock = {...block}
    newBlock.children = newBlock.children
      .filter(child => child._key !== childToUnset._key)
      .map((child, index) => {
        child._key = `${newBlock._key}${index}`
        return child
      })
    patches.push(set(newBlock, [{_key: newBlock._key}]))
  }
  if (patches.length === 0) {
    throw new Error(
      `Don't know how to unset ${JSON.stringify(operation.toJSON(VALUE_TO_JSON_OPTS))}`
    )
  }
  return patches
}

function setSelection(operation: SlateOperation, selection: Range) {
  return Object.assign(selection, operation.properties)
}

function applyPatchesOnValue(patches, value) {
  let _patches = patches
  if (!patches || (Array.isArray(patches) && !patches.length)) {
    return value
  }
  if (!Array.isArray(patches)) {
    _patches = [patches]
  }
  if (Array.isArray(value) && value.length) {
    return applyAll(value, _patches)
  }
  return value
}

export default function changeToPatches(
  editorValue: Value,
  operations: Operation[],
  value: Block[],
  blockContentType: Type
) {
  const selection = {}
  let blocks = [...value]
  const _change = editorValue.change()
  const patches = flatten(
    operations
      .map((operation: Operation) => {
        let _patches
        // console.log('OPERATION:', JSON.stringify(operation.toJSON(), null, 2))
        switch (operation.type) {
          case 'set_selection':
            setSelection(operation, selection)
            _patches = []
            break
          case 'insert_text':
            _patches = setNodePatch(_change, operation, blocks, blockContentType)
            break
          case 'remove_text':
            _patches = setNodePatch(_change, operation, blocks, blockContentType)
            break
          case 'add_mark':
            _patches = setNodePatch(_change, operation, blocks, blockContentType)
            break
          case 'remove_mark':
            _patches = setNodePatch(_change, operation, blocks, blockContentType)
            break
          case 'set_node':
            _patches = setNodePatch(_change, operation, blocks, blockContentType)
            break
          case 'insert_node':
            _patches = insertNodePatch(_change, operation, blocks, blockContentType)
            break
          case 'remove_node':
            _patches = removeNodePatch(_change, operation, blocks, blockContentType)
            break
          case 'split_node':
            _patches = splitNodePatch(_change, operation, blocks, blockContentType)
            break
          case 'merge_node':
            _patches = mergeNodePatch(_change, operation, blocks, blockContentType)
            break
          case 'move_node':
            _patches = moveNodePatch(_change, operation, blocks, blockContentType)
            break
          default:
            _patches = []
        }
        // console.log('BLOCKS BEFORE:', JSON.stringify(blocks, null, 2))
        // console.log('PATCHES:', JSON.stringify(_patches, null, 2))
        blocks = applyPatchesOnValue(_patches, blocks)
        // console.log('BLOCKS AFTER:', JSON.stringify(blocks, null, 2))
        return _patches
      })
      .toArray()
  ).filter(Boolean)
  return {patches, selection}
}
