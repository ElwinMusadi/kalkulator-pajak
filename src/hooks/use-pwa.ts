import { useRegisterSW } from "virtual:pwa-register/react"

export function usePwa() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisterError(error) {
      console.error("Pendaftaran Service Worker gagal:", error)
    },
  })

  function closeNotice() {
    setOfflineReady(false)
    setNeedRefresh(false)
  }

  return {
    offlineReady,
    needRefresh,
    updateServiceWorker,
    closeNotice,
  }
}
