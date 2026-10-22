/** One dispatch table shared by the HTTP route and the agent tool. */

import { parseQuickAdd } from './quickadd.js'

export function createApi(store) {
  return {
    list: (input = {}) => store.list(input),
    create: (input = {}) => store.create(input),
    update: (input = {}) => {
      const patch = input.patch ?? stripKeys(input, ['id', 'patch'])
      return store.update(input.id, patch)
    },
    complete: (input = {}) => store.complete(input.id, input.done !== false),
    remove: (input = {}) => store.remove(input.id),
    parse: (input = {}) => parseQuickAdd(input.text, input.today ? { today: input.today } : undefined),
  }
}

function stripKeys(input, keys) {
  const out = {}
  for (const [key, value] of Object.entries(input)) {
    if (!keys.includes(key)) out[key] = value
  }
  return out
}
