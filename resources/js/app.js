import Alpine from 'alpinejs'
import htmx from 'htmx.org'

window.htmx = htmx

Alpine.data('alert', function () {
  return {
    isVisible: false,
    dismiss() {
      this.isVisible = false
    },
    init() {
      setTimeout(() => {
        this.isVisible = true
      }, 80)
      setTimeout(() => {
        this.dismiss()
      }, 5000)
    },
  }
})

Alpine.data('themeToggle', function () {
  return {
    theme: 'light',
    init() {
      this.theme = this.$el.dataset.initialTheme || 'light'
    },
    toggle() {
      const next = this.theme === 'dark' ? 'light' : 'dark'
      this.theme = next
      document.documentElement.setAttribute('data-theme', next)
      document.cookie = `app_theme=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
    },
  }
})

/**
 * Inventory: collapsible sections. The collapsed ones are remembered in this
 * browser; a search opens everything, so no match stays hidden.
 */
const COLLAPSED_SECTIONS = 'inventory:collapsed'

function readCollapsed() {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSED_SECTIONS) || '[]'))
  } catch {
    return new Set()
  }
}

function writeCollapsed(keys) {
  try {
    localStorage.setItem(COLLAPSED_SECTIONS, JSON.stringify([...keys]))
  } catch {
    // Private window or storage blocked: collapsing still works, just not remembered
  }
}

Alpine.data('inventorySections', function (searching) {
  return {
    init() {
      if (searching) return
      const collapsed = readCollapsed()
      for (const section of this.$root.querySelectorAll('details[data-key]')) {
        if (collapsed.has(section.dataset.key)) section.open = false
      }
    },
    remember(section) {
      const collapsed = readCollapsed()
      if (section.open) collapsed.delete(section.dataset.key)
      else collapsed.add(section.dataset.key)
      writeCollapsed(collapsed)
    },
    setAll(open) {
      for (const section of this.$root.querySelectorAll('details[data-key]')) section.open = open
    },
  }
})

Alpine.start()

/**
 * Calculator: recipe choices and "já tenho" live in hidden fields of
 * #calc-form, one per item. Controls in the production tree set them and
 * recalculate.
 */
window.calcSet = function (kind, itemId, value) {
  const form = document.getElementById('calc-form')
  if (!form) return
  const name = `${kind}[i${itemId}]`
  let input = [...form.querySelectorAll('input[type=hidden]')].find((el) => el.name === name)
  if (!input) {
    input = document.createElement('input')
    input.type = 'hidden'
    input.name = name
    form.appendChild(input)
  }
  input.value = value
  htmx.trigger(form, 'submit')
}
