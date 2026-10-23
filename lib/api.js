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
    complete: (input = {}) => store.complete(input.id, input.done !== false, input.by, input.date),
    confirm: (input = {}) => store.confirm(input.id),
    remove: (input = {}) => store.remove(input.id),
    categories: () => store.categories(),
    renameCategory: (input = {}) => store.renameCategory(input.from, input.to),
    clearCategory: (input = {}) => store.clearCategory(input.name),
    occurrences: (input = {}) => store.occurrences(input),
    retry: () => store.retryPersist(),
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
