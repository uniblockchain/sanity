// @flow

import {get, flatten} from 'lodash'
import randomKey from '../util/randomKey'
import normalizeBlock from '../util/normalizeBlock'

function createCustomBlockFromData(data) {
  const {value} = data
  if (!value) {
    throw new Error(`Data got no value: ${JSON.stringify(data)}`)
  }
  const block = {...value}
  if (!block._key) {
    block._key = randomKey(12)
  }
  if (!block._type) {
    throw new Error(`The block must have a _type: ${JSON.stringify(value)}`)
  }
  return block
}

function toSanitySpan(node, sanityBlock, spanIndex) {
  if (node.object === 'text') {
    return node.leaves.map(leaf => {
      return {
        _type: 'span',
        _key: `${sanityBlock._key}${spanIndex()}`,
        text: leaf.text,
        marks: leaf.marks.map(mark => mark.type)
      }
    })
  }
  if (node.object === 'inline') {
    const {nodes, data} = node
    return flatten(
      nodes.map(nodesNode => {
        if (nodesNode.object !== 'text') {
          throw new Error(`Unexpected non-text child node for inline text: ${nodesNode.object}`)
        }
        if (node.type !== 'span') {
          return node.data.value
        }
        const annotations = data.annotations
        const annotationKeys = []
        if (annotations) {
          Object.keys(annotations).forEach(name => {
            const annotation = annotations[name]
            const annotationKey = annotation._key
            if (annotation && annotationKey) {
              sanityBlock.markDefs.push(annotation)
              annotationKeys.push(annotationKey)
            }
          })
        }
        return nodesNode.leaves.map(leaf => ({
          _type: 'span',
          _key: `${sanityBlock._key}${spanIndex()}`,
          text: leaf.text,
          marks: leaf.marks.map(mark => mark.type).concat(annotationKeys)
        }))
      })
    )
  }
  throw new Error(`Unsupported object ${node.object}`)
}

function toSanityBlock(block, options = {}) {
  if (!block.key) {
    block.key = randomKey(12)
  }
  if (block.type === 'contentBlock') {
    const sanityBlock = {
      ...block.data,
      _type: 'block',
      _key: block.key,
      markDefs: []
    }
    let index = 0
    const spanIndex = () => {
      return index++
    }
    sanityBlock.children = flatten(
      block.nodes.map(node => toSanitySpan(node, sanityBlock, spanIndex))
    )
    return options.normalize ? normalizeBlock(sanityBlock) : sanityBlock
  }
  return createCustomBlockFromData(block.data)
}

export default function editorValueToBlocks(value: {}, options = {}) {
  const nodes = get(value, 'document.nodes')
  if (!nodes || nodes.length === 0) {
    return []
  }
  return nodes.map(node => toSanityBlock(node, options)).filter(Boolean)
}
