const root = document.getElementById('ui')
if (root) {
  const observer = new MutationObserver(() => {
    const error = root.querySelector<HTMLElement>('.fatal')
    if (!error || error.dataset.retryReady) return
    error.dataset.retryReady = 'true'
    const detail = (error.textContent ?? '').replace(/^Failed to start:\s*/, '')
    const chinese = navigator.languages.some(language => language.toLowerCase().startsWith('zh'))
    const status = document.createElement('p')
    status.textContent = chinese ? `启动失败：${detail}` : `Failed to start: ${detail}`
    const retry = document.createElement('button')
    retry.className = 'btn primary'
    retry.type = 'button'
    retry.textContent = chinese ? '重试' : 'RETRY'
    retry.addEventListener('click', () => window.location.reload())
    error.replaceChildren(status, retry)
    observer.disconnect()
  })
  observer.observe(root, { childList: true, subtree: true })
}
