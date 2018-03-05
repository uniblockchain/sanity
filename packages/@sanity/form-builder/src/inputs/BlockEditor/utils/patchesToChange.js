// @flow
import type {Type, Span, Block, SlateValue} from '../typeDefs'
import {blocksToEditorValue} from '@sanity/block-tools'
import {Text, Block as SlateBlock, Range, Document} from 'slate'

type Path = string | {_key: string}

type Patch = {
  type: string,
  path: Path[]
}

const VALUE_TO_JSON_OPTS = {
  preserveData: true,
  preserveKeys: true,
  preserveSelection: false,
  preserveHistory: false
}

function findLastKey(path: Path[]) {
  let key = null
  path.forEach(part => {
    if (part._key) {
      key = part._key
    }
  })
  return key
}

function findPatchedNodeByKey(key: string, blocks: Block[]) {
  let node
  blocks.forEach(block => {
    if (block._key === key) {
      node = block
      return
    }
    if (block._type === 'block') {
      block.children.forEach(child => {
        if (child._key === key) {
          node = child
        }
      })
    }
  })
  return node
}

function setPatch(patch: Patch, change: () => void, blocks: Block[], type: Type) {
  const editorBlock = blocksToEditorValue([patch.value], type).document.nodes[0]
  const key = findLastKey(patch.path)
  change.replaceNodeByKey(key, editorBlock)
  return change
}

function insertPatch(patch: Patch, change: () => void, blocks: Block[], type: Type) {
  const {items, position} = patch
  const fragment = blocksToEditorValue(items, type)
  const posKey = findLastKey(patch.path)
  const firstBlock = change.value.document.nodes.first()
  let range
  if (firstBlock && posKey === firstBlock.key && position === 'before') {
    const rangeText = change.value.document.getFirstText()
    range = Range.fromJSON({
      anchorKey: rangeText.key,
      focusKey: rangeText.key,
      anchorOffset: 0,
      focusOffset: 0
    })
    change.splitBlockAtRange(range).collapseToEndOfPreviousText()
    fragment.document.nodes.reverse().forEach(block => {
      change.insertBlockAtRange(range, block)
    })
    change.deleteBackward(1)
  } else {
    const rangeText = position === 'before'
      ? change.value.document.getDescendant(posKey).getPreviousText()
      : change.value.document.getDescendant(posKey).getLastText()
    range = Range.fromJSON({
      anchorKey: rangeText.key,
      focusKey: rangeText.key,
      anchorOffset: rangeText.characters.size,
      focusOffset: rangeText.characters.size
    })
    fragment.document.nodes.reverse().forEach(block => {
      change.insertBlockAtRange(range, block)
    })
  }
  return change
}

function unsetPatch(patch: Patch, change: () => void, blocks: Block[], type: Type) {
  const lastKey = findLastKey(patch.path)
  change.removeNodeByKey(lastKey)
  return change
}

export default function patchesToChange(
  patches: Patch[],
  editorValue: SlateValue,
  blocks: Block[],
  type: Type
) {
  const change = editorValue.change({normalize: false})
  console.log('EDITORVALUE', JSON.stringify(editorValue.document.toJSON(VALUE_TO_JSON_OPTS), null, 2))
  console.log('BLOCKS', JSON.stringify(blocks, null, 2))
  patches.forEach((patch: Patch) => {
    console.log('Incoming patch', JSON.stringify(patch, null, 2))
    switch (patch.type) {
      case 'diffMatchPatch':
        diffMatchPatch(patch, change, blocks)
        break
      case 'set':
        setPatch(patch, change, blocks, type)
        break
      case 'insert':
        insertPatch(patch, change, blocks, type)
        break
      case 'unset':
        unsetPatch(patch, change, blocks, type)
        break
      default:
    }
    console.log('CHANGE:', JSON.stringify(change.value.document.toJSON(VALUE_TO_JSON_OPTS), null, 2))
  })
  return change
}
