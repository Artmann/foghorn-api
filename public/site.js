// Copy buttons for code blocks marked with `data-copy`.
for (const block of document.querySelectorAll('pre[data-copy]')) {
  const button = document.createElement('button')

  button.className = 'copy'
  button.type = 'button'
  button.textContent = 'copy'
  button.setAttribute('aria-label', 'Copy to clipboard')

  let resetTimer

  button.addEventListener('click', async () => {
    const code = block.querySelector('code')

    try {
      await navigator.clipboard.writeText(code ? code.innerText : '')
      button.textContent = 'copied'
    } catch {
      button.textContent = 'failed'
    }

    clearTimeout(resetTimer)
    resetTimer = setTimeout(() => {
      button.textContent = 'copy'
    }, 1500)
  })

  block.appendChild(button)
}

// Tabs, with arrow keys moving between them.
for (const container of document.querySelectorAll('[data-tabs]')) {
  const tabs = Array.from(container.querySelectorAll('[role="tab"]'))

  function select(tab) {
    for (const other of tabs) {
      const selected = other === tab
      const panel = document.getElementById(
        other.getAttribute('aria-controls') ?? ''
      )

      other.setAttribute('aria-selected', String(selected))
      other.tabIndex = selected ? 0 : -1

      if (panel) {
        panel.hidden = !selected
      }
    }
  }

  for (const tab of tabs) {
    tab.addEventListener('click', () => select(tab))

    tab.addEventListener('keydown', (event) => {
      const offsets = { ArrowLeft: -1, ArrowRight: 1 }
      const offset = offsets[event.key]

      if (!offset) {
        return
      }

      event.preventDefault()

      const next =
        tabs[(tabs.indexOf(tab) + offset + tabs.length) % tabs.length]

      select(next)
      next.focus()
    })
  }
}
