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

/**
 * A <details> that stays open or closed as the user left it, also after htmx
 * swaps it (the calculator redraws on every change). Remembered per browser.
 */
Alpine.data('rememberOpen', function (key) {
  const storageKey = `open:${key}`
  return {
    init() {
      try {
        if (localStorage.getItem(storageKey) === '1') this.$el.open = true
      } catch {
        // Storage blocked: it just starts closed
      }
    },
    remember() {
      try {
        localStorage.setItem(storageKey, this.$el.open ? '1' : '0')
      } catch {
        // Storage blocked: nothing to remember with
      }
    },
  }
})

/**
 * The calculator's item list scrolls. Every change redraws it: it comes back
 * where it was, or at the end when an item was added (new items go last).
 */
Alpine.data('targetsScroll', function (count) {
  const storageKey = `targets-scroll:${location.pathname}`
  return {
    init() {
      let saved = null
      try {
        saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null')
      } catch {
        // Storage blocked: it starts at the top
      }
      if (saved && count > saved.count) this.$el.scrollTop = this.$el.scrollHeight
      else if (saved) this.$el.scrollTop = saved.top
      this.save()
    },
    save() {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify({ count, top: this.$el.scrollTop }))
      } catch {
        // Storage blocked: nothing to remember with
      }
    },
  }
})

/**
 * "Planos rápidos" menu with submenus (resources/views/components/plans/quick_menu.edge),
 * keyboard included: arrows move and open/close submenus, Home/End jump,
 * Enter/Space open a submenu, Escape closes everything.
 */
Alpine.data('quickMenu', function () {
  return {
    open: false,
    template: null,
    style: null,
    toggle() {
      if (this.open) this.close()
      else this.open = true
    },
    close(focusToggle = false) {
      this.open = false
      this.template = null
      this.style = null
      if (focusToggle) this.$refs.toggle.focus()
    },
    itemsOf(list) {
      return [...list.children]
        .map((entry) => entry.querySelector(':scope > .qmenu__item, :scope > form > .qmenu__item'))
        .filter(Boolean)
    },
    focusFirstIn(list) {
      // The lists open with a class, applied before the next tick
      this.$nextTick(() => this.itemsOf(list)[0]?.focus())
    },
    onKeydown(event) {
      const current = document.activeElement
      if (event.key === 'Escape') {
        if (this.open) {
          event.preventDefault()
          this.close(true)
        }
        return
      }
      if (current === this.$refs.toggle) {
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          this.open = true
          this.focusFirstIn(this.$root.querySelector('.qmenu__list'))
        }
        return
      }

      const list = current?.closest('[role=menu]')
      if (!list || !this.$root.contains(list)) return
      const items = this.itemsOf(list)
      const index = items.indexOf(current)
      const opensSubmenu = current.getAttribute('aria-haspopup') === 'menu'

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const step = event.key === 'ArrowDown' ? 1 : -1
        items[(index + step + items.length) % items.length].focus()
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault()
        items[event.key === 'Home' ? 0 : items.length - 1].focus()
      } else if (opensSubmenu && ['ArrowRight', 'Enter', ' '].includes(event.key)) {
        event.preventDefault()
        current.click()
        this.focusFirstIn(current.nextElementSibling)
      } else if (event.key === 'ArrowLeft' && list.dataset.closes) {
        event.preventDefault()
        this[list.dataset.closes] = null
        if (list.dataset.closes === 'template') this.style = null
        list.previousElementSibling?.focus()
      }
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
