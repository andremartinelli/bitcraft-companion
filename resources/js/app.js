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
