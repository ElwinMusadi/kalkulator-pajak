import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import {
  Bell,
  BellOff,
  BellRing,
  CircleCheck,
  Loader2,
  Megaphone,
  RefreshCw,
  Send,
  Share,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useAuthenticatedUser } from "@/auth/auth-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { getPwaUpdateSnapshot, subscribePwaUpdate, usePwaUpdate } from "@/hooks/use-pwa";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDateTime } from "@/lib/format";
import type { PwaUpdateSnapshot } from "@/lib/pwa-update";
import { isApiError } from "@/lib/http";
import {
  currentPushEnvironment,
  detectPushAvailability,
  disablePush,
  enablePush,
  getDeviceSubscription,
  hasUnread,
  notificationPromptKind,
  pushApi,
  readLastSeen,
  readPromptSnoozedUntil,
  shouldShowOpeningModal,
  snoozeNotificationPrompt,
  syncPushSubscription,
  writeLastSeen,
  type NotificationPromptKind,
  type PushAvailability,
} from "@/lib/push";
import { setUpdateNoticeCoordination } from "@/lib/update-notice-coordination";
import { cn } from "@/lib/utils";
import {
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_TITLE_MAX,
  type Announcement,
  type PushConfigResponse,
} from "@/types/push";

/** Batas gelombang lanjutan per pengiriman (40 perangkat per gelombang). */
const MAX_SEND_ROUNDS = 50;
/** Muat ulang pengumuman saat aplikasi kembali dibuka, paling sering tiap menit. */
const REFRESH_INTERVAL_MS = 60_000;
/**
 * Selama aplikasi tampil di layar, pengumuman diperiksa ulang tiap 5 menit agar
 * modal juga sampai ke perangkat yang tidak mengaktifkan notifikasi push.
 */
const ANNOUNCEMENT_POLL_MS = 5 * 60_000;
const ANNOUNCEMENT_POLL_CHECK_MS = 30_000;
/** Pengumuman yang ditampilkan langsung di modal Info Terbaru. */
const OPENING_ANNOUNCEMENT_LIMIT = 3;
/**
 * Saat aplikasi dibuka, modal menunggu sebentar agar versi baru yang cepat
 * terdeteksi tampil bersamaan dengan pengumuman, bukan menyusul.
 */
const OPENING_SETTLE_MS = 3_000;

/** Modal Info Terbaru yang dibuka karena pengumuman baru atau ajakan notifikasi. */
interface InfoRequest {
  /** Ajakan notifikasi, ditetapkan saat modal dibuka agar tidak berubah di tengah jalan. */
  prompt: NotificationPromptKind | null;
}

interface NotificationCenterValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  unread: boolean;
}

const NotificationCenterContext = createContext<NotificationCenterValue | null>(null);

function errorMessage(error: unknown, fallback: string): string {
  return isApiError(error) ? error.message : fallback;
}

function currentPermission(): NotificationPermission | null {
  return typeof Notification === "undefined" ? null : Notification.permission;
}

/**
 * State pengumuman dan notifikasi perangkat untuk satu sesi aplikasi, dialog
 * lonceng bersama, dan modal Info Terbaru. Tombol lonceng
 * (NotificationBellButton) dapat dipasang di beberapa tempat header tanpa
 * menggandakan state atau dialog.
 *
 * Modal Info Terbaru tampil:
 * - **wajib** selama ada versi baru: tidak bisa ditutup, hanya "Perbarui sekarang";
 * - saat aplikasi dibuka, bila ada pengumuman belum dibaca atau ajakan notifikasi;
 * - saat pengumuman baru tiba (push) atau notifikasinya diklik ketika aplikasi terbuka.
 */
export function NotificationCenterProvider({ children }: { children: ReactNode }) {
  const user = useAuthenticatedUser();
  const isAdmin = user.role === "admin";
  const [open, setOpenState] = useState(false);
  const [config, setConfig] = useState<PushConfigResponse | null>(null);
  const [availability] = useState<PushAvailability>(() =>
    detectPushAvailability(currentPushEnvironment()),
  );
  const [permission, setPermission] = useState<NotificationPermission | null>(currentPermission);
  const [deviceActive, setDeviceActive] = useState(false);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [deviceMessage, setDeviceMessage] = useState<string | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [lastSeen, setLastSeen] = useState<string | null>(() => readLastSeen(user.id));
  const [reloadToken, setReloadToken] = useState(0);
  const lastLoadRef = useRef(0);
  const openRef = useRef(false);

  const { status: updateStatus, applyUpdate } = usePwaUpdate();
  const [info, setInfo] = useState<InfoRequest | null>(null);
  const infoRef = useRef<InfoRequest | null>(null);
  const [mountedAt] = useState(() => Date.now());
  // Dibuka dari klik notifikasi saat aplikasi belum terbuka: URL ?pengumuman=1.
  const [openedFromNotification] = useState(() =>
    new URL(window.location.href).searchParams.has("pengumuman"),
  );
  /** Klik notifikasi: tampilkan pengumuman sesudah daftar dimuat ulang. */
  const revealRef = useRef(openedFromNotification);
  const announcementsRef = useRef<Announcement[] | null>(null);
  const configRef = useRef<PushConfigResponse | null>(null);
  const deviceRef = useRef({ checked: false, active: false });
  const permissionRef = useRef(permission);
  const lastSeenRef = useRef(lastSeen);
  const promptDismissedRef = useRef(false);
  const settleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    permissionRef.current = permission;
    lastSeenRef.current = lastSeen;
  }, [permission, lastSeen]);

  /** Pengumuman yang tampil di dialog atau modal dianggap sudah dibaca. */
  const markSeen = useCallback(
    (list: Announcement[] | null) => {
      const latestShown = list?.[0]?.createdAt;
      if (!latestShown) return;
      setLastSeen((current) => {
        if (!hasUnread(latestShown, current)) return current;
        writeLastSeen(user.id, latestShown);
        return latestShown;
      });
    },
    [user.id],
  );

  const reloadAnnouncements = useCallback(() => setReloadToken((token) => token + 1), []);

  const setOpen = useCallback(
    (next: boolean) => {
      openRef.current = next;
      setOpenState(next);
      if (next) {
        markSeen(announcementsRef.current);
        reloadAnnouncements();
      }
    },
    [markSeen, reloadAnnouncements],
  );

  /**
   * Buka modal Info Terbaru bila ada pengumuman belum dibaca atau ajakan
   * notifikasi. Dipanggil dari callback asinkron (data dimuat, pesan service
   * worker) dan membaca state lewat ref.
   */
  const evaluateInfo = useCallback(
    function evaluate() {
      // Dialog lonceng terbuka: pengumuman sudah terlihat di sana.
      if (openRef.current) return;
      const list = announcementsRef.current;
      const loadedConfig = configRef.current;
      if (!list || !loadedConfig || !deviceRef.current.checked) return;

      const now = Date.now();
      const reveal = revealRef.current;
      if (!reveal) {
        const settleIn = mountedAt + OPENING_SETTLE_MS - now;
        if (settleIn > 0) {
          if (settleTimerRef.current === null) {
            settleTimerRef.current = window.setTimeout(() => {
              settleTimerRef.current = null;
              evaluate();
            }, settleIn);
          }
          return;
        }
      }
      revealRef.current = false;
      const unreadCount = list.filter((item) => hasUnread(item.createdAt, lastSeenRef.current)).length;
      // Modal sudah tampil: daftarnya ikut diperbarui. Bila pengumuman yang
      // membukanya dihapus Admin dan tidak ada lagi yang perlu dilihat, tutup.
      if (infoRef.current) {
        if (unreadCount === 0 && !infoRef.current.prompt) {
          infoRef.current = null;
          setInfo(null);
        }
        return;
      }

      const prompt = promptDismissedRef.current
        ? null
        : notificationPromptKind({
            serverEnabled: loadedConfig.enabled,
            availability,
            permission: permissionRef.current,
            deviceActive: deviceRef.current.active,
            snoozedUntil: readPromptSnoozedUntil(),
            nowMs: now,
          });
      if (!shouldShowOpeningModal({ unreadCount, prompt })) {
        // Notifikasi diklik tetapi pengumumannya sudah dibaca: buka riwayat,
        // kecuali modal pembaruan wajib sedang tampil.
        if (reveal && getPwaUpdateSnapshot().status === "idle") setOpen(true);
        return;
      }
      const next: InfoRequest = { prompt };
      infoRef.current = next;
      setInfo(next);
    },
    [availability, mountedAt, setOpen],
  );

  // Riwayat pengumuman: saat dibuka, setelah kirim, pesan service worker, dan
  // saat aplikasi kembali ke depan.
  useEffect(() => {
    let cancelled = false;
    lastLoadRef.current = Date.now();
    pushApi.announcements().then(
      ({ announcements: list }) => {
        if (cancelled) return;
        setAnnouncements(list);
        setListError(null);
        announcementsRef.current = list;
        if (openRef.current) markSeen(list);
        evaluateInfo();
      },
      (error: unknown) => {
        if (!cancelled) setListError(errorMessage(error, "Pengumuman gagal dimuat."));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [reloadToken, markSeen, evaluateInfo]);

  // Muat awal: konfigurasi push dan status notifikasi perangkat ini.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let loaded: PushConfigResponse = { enabled: false, publicKey: null };
      let active = false;
      try {
        loaded = await pushApi.config();
        if (loaded.enabled && loaded.publicKey && availability === "supported") {
          active = await syncPushSubscription(loaded.publicKey).catch(() => false);
        }
      } catch {
        // Konfigurasi gagal dimuat: notifikasi dianggap belum aktif di server.
      }
      if (cancelled) return;
      setConfig(loaded);
      setDeviceActive(active);
      configRef.current = loaded;
      deviceRef.current = { checked: true, active };
      evaluateInfo();
    })();
    return () => {
      cancelled = true;
    };
  }, [availability, evaluateInfo]);

  // Versi baru wajib dipasang: modal pembaruan menggantikan dialog lonceng.
  useEffect(
    () =>
      subscribePwaUpdate(() => {
        if (getPwaUpdateSnapshot().status !== "idle" && openRef.current) setOpen(false);
      }),
    [setOpen],
  );

  /** Admin menghapus pengumuman: hilangkan langsung dari daftar, lalu muat ulang. */
  const handleDeleted = useCallback(
    (id: string) => {
      announcementsRef.current = announcementsRef.current?.filter((item) => item.id !== id) ?? null;
      setAnnouncements((current) => current?.filter((item) => item.id !== id) ?? current);
      reloadAnnouncements();
    },
    [reloadAnnouncements],
  );

  /** Menutup modal (tanpa pembaruan); pengumuman di dalamnya dianggap sudah dibaca. */
  const closeInfo = useCallback(() => {
    if (getPwaUpdateSnapshot().status !== "idle") return;
    const current = infoRef.current;
    markSeen(announcementsRef.current);
    if (current?.prompt) {
      promptDismissedRef.current = true;
      if (!deviceRef.current.active) snoozeNotificationPrompt(Date.now());
    }
    infoRef.current = null;
    setInfo(null);
  }, [markSeen]);

  const handleUpdate = useCallback(() => {
    // Modal tetap tampil (tombol berputar) sampai halaman dimuat ulang.
    markSeen(announcementsRef.current);
    applyUpdate();
  }, [markSeen, applyUpdate]);

  // Parameter ?pengumuman=1 sudah dicatat (revealRef): hapus dari URL.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("pengumuman")) return;
    url.searchParams.delete("pengumuman");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, []);

  // Push baru tiba, atau notifikasinya diklik, saat aplikasi sudah terbuka.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const type = (event.data as { type?: unknown } | null)?.type;
      if (type === "kp:buka-pengumuman") revealRef.current = true;
      if (type === "kp:buka-pengumuman" || type === "kp:pengumuman-baru") reloadAnnouncements();
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [reloadAnnouncements]);

  // Aplikasi kembali ke depan (mis. PWA dibuka lagi dari latar): segarkan
  // riwayat (pengumuman baru membuka modal) dan izin notifikasi.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      const current = currentPermission();
      permissionRef.current = current;
      setPermission(current);
      if (Date.now() - lastLoadRef.current > REFRESH_INTERVAL_MS) reloadAnnouncements();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [reloadAnnouncements]);

  // Perangkat tanpa notifikasi push tidak menerima pesan service worker:
  // periksa pengumuman baru berkala selama aplikasi tampil di layar.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastLoadRef.current >= ANNOUNCEMENT_POLL_MS
      ) {
        reloadAnnouncements();
      }
    }, ANNOUNCEMENT_POLL_CHECK_MS);
    return () => window.clearInterval(timer);
  }, [reloadAnnouncements]);

  // Selama aplikasi (setelah login) terpasang, versi baru tampil di modal ini,
  // bukan di kartu PwaUpdateNotice.
  useEffect(() => {
    setUpdateNoticeCoordination({ handledByApp: true });
    return () => {
      if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
      setUpdateNoticeCoordination({ handledByApp: false });
    };
  }, []);

  const unread = hasUnread(announcements?.[0]?.createdAt, lastSeen);
  const unreadList = useMemo(
    () => (announcements ?? []).filter((item) => hasUnread(item.createdAt, lastSeen)),
    [announcements, lastSeen],
  );
  const updateRequired = updateStatus !== "idle";

  async function handleEnable() {
    if (!config?.publicKey) return;
    setDeviceBusy(true);
    setDeviceMessage(null);
    try {
      const result = await enablePush(config.publicKey);
      const current = currentPermission();
      permissionRef.current = current;
      setPermission(current);
      if (result === "enabled") {
        deviceRef.current = { checked: true, active: true };
        setDeviceActive(true);
      } else if (result === "no-service-worker") {
        setDeviceMessage("Aplikasi belum siap menerima notifikasi. Muat ulang halaman, lalu coba lagi.");
      }
    } catch (error) {
      setDeviceMessage(errorMessage(error, "Notifikasi gagal diaktifkan. Coba lagi."));
      const active = Boolean(await getDeviceSubscription().catch(() => null));
      deviceRef.current = { checked: true, active };
      setDeviceActive(active);
    } finally {
      setDeviceBusy(false);
    }
  }

  async function handleDisable() {
    setDeviceBusy(true);
    setDeviceMessage(null);
    try {
      await disablePush();
      deviceRef.current = { checked: true, active: false };
      setDeviceActive(false);
    } catch (error) {
      setDeviceMessage(errorMessage(error, "Notifikasi gagal dimatikan. Coba lagi."));
    } finally {
      setDeviceBusy(false);
    }
  }

  const value = useMemo(() => ({ open, setOpen, unread }), [open, setOpen, unread]);

  return (
    <NotificationCenterContext.Provider value={value}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pengumuman</DialogTitle>
            <DialogDescription>
              Informasi perubahan aplikasi dan perhitungan dari Admin.
            </DialogDescription>
          </DialogHeader>

          <DeviceNotificationCard
            config={config}
            availability={availability}
            permission={permission}
            active={deviceActive}
            busy={deviceBusy}
            message={deviceMessage}
            onEnable={() => void handleEnable()}
            onDisable={() => void handleDisable()}
          />

          {isAdmin && (
            <AnnouncementComposer
              pushEnabled={config?.enabled === true}
              onSent={reloadAnnouncements}
            />
          )}

          <AnnouncementList
            announcements={announcements}
            error={listError}
            canDelete={isAdmin}
            onDeleted={handleDeleted}
          />
        </DialogContent>
      </Dialog>

      {(updateRequired || info) && (
        <OpeningModal
          announcements={unreadList}
          prompt={info?.prompt ?? null}
          updateStatus={updateStatus}
          permission={permission}
          deviceActive={deviceActive}
          deviceBusy={deviceBusy}
          deviceMessage={deviceMessage}
          onEnable={() => void handleEnable()}
          onUpdate={handleUpdate}
          onDismiss={closeInfo}
          onShowAll={() => {
            closeInfo();
            setOpen(true);
          }}
        />
      )}
    </NotificationCenterContext.Provider>
  );
}

/** Tombol lonceng di header; titik emas menandai pengumuman yang belum dibaca. */
export function NotificationBellButton() {
  const context = useContext(NotificationCenterContext);
  if (!context) return null;
  const { setOpen, unread } = context;
  const label = unread ? "Pengumuman (ada yang baru)" : "Pengumuman";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="onDark"
          size="icon"
          aria-label={label}
          onClick={() => setOpen(true)}
          className="relative"
        >
          {unread ? <BellRing aria-hidden="true" /> : <Bell aria-hidden="true" />}
          {unread && (
            <span
              aria-hidden="true"
              className="absolute right-1.5 top-1.5 size-2 rounded-full bg-gold-500 ring-2 ring-navy-900"
            />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

interface OpeningModalProps {
  /** Pengumuman belum dibaca, terbaru dulu (ikut diperbarui saat modal tampil). */
  announcements: Announcement[];
  prompt: NotificationPromptKind | null;
  updateStatus: PwaUpdateSnapshot["status"];
  permission: NotificationPermission | null;
  deviceActive: boolean;
  deviceBusy: boolean;
  deviceMessage: string | null;
  onEnable: () => void;
  onUpdate: () => void;
  onDismiss: () => void;
  onShowAll: () => void;
}

function openingSummary(input: {
  updateRequired: boolean;
  hasAnnouncements: boolean;
  promptPending: boolean;
}): string {
  if (input.updateRequired) {
    return input.hasAnnouncements
      ? "Perbarui ke versi terbaru untuk melanjutkan. Ada juga pengumuman baru untuk Anda."
      : "Perbarui ke versi terbaru untuk melanjutkan.";
  }
  if (input.hasAnnouncements) return "Ada pengumuman baru untuk Anda.";
  if (input.promptPending) return "Aktifkan notifikasi agar tidak ketinggalan pengumuman.";
  return "Semua sudah beres. Selamat bekerja.";
}

/**
 * Modal besar di tengah: versi baru, pengumuman yang belum dibaca, dan ajakan
 * mengaktifkan notifikasi dalam satu layar. Selama ada versi baru, modal tidak
 * bisa ditutup (tanpa tombol tutup, Esc, atau klik di luar): pengguna wajib
 * memperbarui sebelum memakai kalkulator.
 */
function OpeningModal({
  announcements,
  prompt,
  updateStatus,
  permission,
  deviceActive,
  deviceBusy,
  deviceMessage,
  onEnable,
  onUpdate,
  onDismiss,
  onShowAll,
}: OpeningModalProps) {
  const online = useOnlineStatus();
  const contentRef = useRef<HTMLDivElement>(null);
  const updateRequired = updateStatus !== "idle";
  const applying = updateStatus === "applying";
  const shown = announcements.slice(0, OPENING_ANNOUNCEMENT_LIMIT);
  const more = announcements.length - shown.length;
  const promptPending = prompt !== null && !deviceActive;
  const summary = openingSummary({
    updateRequired,
    hasAnnouncements: announcements.length > 0,
    promptPending,
  });

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !updateRequired) onDismiss();
      }}
    >
      <DialogContent
        ref={contentRef}
        data-opening-modal=""
        data-update-required={updateRequired || undefined}
        aria-busy={applying || undefined}
        showCloseButton={!updateRequired}
        onOpenAutoFocus={(event) => {
          // Fokus ke modal (bukan tombol paling bawah) agar layar ponsel tidak
          // langsung menggulir melewati isi bagian atas.
          event.preventDefault();
          contentRef.current?.focus({ preventScroll: true });
        }}
        className="max-h-[calc(100dvh-2rem)] max-w-xl gap-0 overflow-y-auto p-0 focus:outline-none [&>button:last-child]:text-white/80 [&>button:last-child]:hover:bg-white/10 [&>button:last-child]:hover:text-white"
      >
        <DialogHeader
          className={cn(
            "flex-row items-center gap-3.5 rounded-t-2xl bg-navy-900 px-5 py-5 text-white sm:px-7 sm:py-6",
            updateRequired ? "pr-5 sm:pr-7" : "pr-14",
          )}
        >
          <span
            className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gold-500/15 text-gold-400"
            aria-hidden="true"
          >
            <Sparkles className="size-5" />
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-xl text-white">Info Terbaru</DialogTitle>
            <DialogDescription className="mt-0.5 text-[13px] text-white/75">
              {summary}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-5 px-5 py-5 sm:px-7 sm:py-6">
          {updateRequired && (
            <section
              aria-labelledby="pembuka-versi"
              className="flex items-start gap-3 rounded-xl border border-navy-600/30 bg-navy-50/70 p-4"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-card text-navy-800">
                <RefreshCw className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h3 id="pembuka-versi" className="text-sm font-semibold text-foreground">
                  Versi baru aplikasi tersedia
                </h3>
                <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
                  Aplikasi wajib diperbarui sebelum dipakai agar perhitungan memakai aturan dan
                  fitur terbaru. Isian yang belum disimpan akan direset.
                </p>
                {!online && !applying && (
                  <p className="mt-1.5 text-xs font-medium text-muted-foreground">
                    Sambungkan internet untuk memperbarui.
                  </p>
                )}
              </div>
            </section>
          )}

          {shown.length > 0 && (
            <section aria-labelledby="pembuka-pengumuman" className="flex flex-col gap-3">
              <h3
                id="pembuka-pengumuman"
                className="flex items-center gap-2 text-sm font-semibold text-foreground"
              >
                <Megaphone className="size-4 text-navy-700" aria-hidden="true" />
                Pengumuman baru
                <span className="numeric rounded-full bg-gold-500/20 px-2 py-0.5 text-xs font-semibold text-navy-900">
                  {announcements.length}
                </span>
              </h3>
              <ol className="flex flex-col gap-2.5">
                {shown.map((item) => (
                  <li key={item.id} className="rounded-xl border bg-card p-4">
                    <p className="text-[15px] font-semibold leading-snug text-foreground">
                      {item.title}
                    </p>
                    <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                      {item.body}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground/80">
                      <time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time> ·{" "}
                      {item.createdByName}
                    </p>
                  </li>
                ))}
              </ol>
              {more > 0 && (
                <Button
                  type="button"
                  variant="link"
                  className="h-auto self-start px-0"
                  onClick={onShowAll}
                >
                  Lihat {more} pengumuman lainnya
                </Button>
              )}
            </section>
          )}

          {prompt && (
            <OpeningNotificationPrompt
              kind={prompt}
              permission={permission}
              active={deviceActive}
              busy={deviceBusy}
              message={deviceMessage}
              onEnable={onEnable}
            />
          )}
        </div>

        <DialogFooter className="sticky bottom-0 rounded-b-2xl border-t bg-card px-5 py-4 sm:px-7">
          {updateRequired ? (
            <Button
              type="button"
              onClick={onUpdate}
              disabled={applying || !online}
              aria-busy={applying || undefined}
            >
              {applying ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw aria-hidden="true" />
              )}
              {applying ? "Memperbarui…" : "Perbarui sekarang"}
            </Button>
          ) : (
            <Button
              type="button"
              variant={promptPending ? "outline" : "default"}
              onClick={onDismiss}
            >
              {promptPending ? "Nanti saja" : "Mengerti"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OpeningNotificationPrompt({
  kind,
  permission,
  active,
  busy,
  message,
  onEnable,
}: {
  kind: NotificationPromptKind;
  permission: NotificationPermission | null;
  active: boolean;
  busy: boolean;
  message: string | null;
  onEnable: () => void;
}) {
  if (kind === "ios-install") {
    return (
      <section aria-labelledby="pembuka-notifikasi" className="rounded-xl border bg-muted/30 p-4">
        <h3
          id="pembuka-notifikasi"
          className="flex items-center gap-2 text-sm font-semibold text-foreground"
        >
          <Bell className="size-4 text-navy-700" aria-hidden="true" />
          Terima pengumuman di iPhone/iPad
        </h3>
        <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 text-[13px] leading-relaxed text-muted-foreground">
          <li>
            Di Safari, ketuk{" "}
            <Share className="inline size-3.5 align-[-2px]" aria-label="Bagikan" /> (Bagikan).
          </li>
          <li>
            Pilih <strong className="text-foreground">Tambah ke Layar Utama</strong>.
          </li>
          <li>Buka aplikasi dari ikon tersebut, lalu aktifkan notifikasi lewat tombol lonceng.</li>
        </ol>
        <p className="mt-2 text-xs text-muted-foreground/80">Memerlukan iOS 16.4 atau lebih baru.</p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="pembuka-notifikasi"
      className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <h3
          id="pembuka-notifikasi"
          className="flex items-center gap-2 text-sm font-semibold text-foreground"
        >
          <Bell className="size-4 text-navy-700" aria-hidden="true" />
          Aktifkan notifikasi
        </h3>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground" role="status">
          {active ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
              <CircleCheck className="size-4 text-success" aria-hidden="true" />
              Notifikasi aktif di perangkat ini.
            </span>
          ) : permission === "denied" ? (
            "Notifikasi diblokir. Izinkan di pengaturan peramban atau perangkat; petunjuknya ada di tombol lonceng."
          ) : (
            "Pengumuman perubahan perhitungan langsung muncul di perangkat ini, walau aplikasi sedang tertutup."
          )}
        </p>
        {message && (
          <p role="alert" className="mt-1.5 text-[13px] font-medium text-destructive">
            {message}
          </p>
        )}
      </div>
      {!active && permission !== "denied" && (
        <Button type="button" className="shrink-0" onClick={onEnable} disabled={busy}>
          {busy ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Bell aria-hidden="true" />
          )}
          Aktifkan notifikasi
        </Button>
      )}
    </section>
  );
}

interface DeviceNotificationCardProps {
  config: PushConfigResponse | null;
  availability: PushAvailability;
  permission: NotificationPermission | null;
  active: boolean;
  busy: boolean;
  message: string | null;
  onEnable: () => void;
  onDisable: () => void;
}

function DeviceNotificationCard({
  config,
  availability,
  permission,
  active,
  busy,
  message,
  onEnable,
  onDisable,
}: DeviceNotificationCardProps) {
  let status: ReactNode;
  let action: ReactNode = null;

  if (config === null) {
    status = "Memeriksa notifikasi…";
  } else if (!config.enabled) {
    status = "Notifikasi belum diaktifkan di server. Pengumuman tetap tampil di sini.";
  } else if (availability === "ios-needs-install") {
    status = (
      <>
        Di iPhone/iPad, pasang aplikasi ke Layar Utama dulu: ketuk{" "}
        <Share className="inline size-3.5 align-[-2px]" aria-label="Bagikan" /> lalu{" "}
        <strong>Tambah ke Layar Utama</strong>. Buka aplikasi dari ikon tersebut, lalu aktifkan
        notifikasi di sini (iOS 16.4 ke atas).
      </>
    );
  } else if (availability === "ios-other-browser") {
    status =
      "Di iPhone/iPad, notifikasi hanya tersedia bila aplikasi dibuka di Safari dan dipasang ke Layar Utama.";
  } else if (availability === "unsupported") {
    status = "Peramban atau versi sistem perangkat ini belum mendukung notifikasi.";
  } else if (active) {
    status = (
      <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
        <CircleCheck className="size-4 text-success" aria-hidden="true" />
        Notifikasi aktif di perangkat ini.
      </span>
    );
    action = (
      <Button type="button" variant="outline" size="sm" onClick={onDisable} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <BellOff aria-hidden="true" />}
        Matikan
      </Button>
    );
  } else if (permission === "denied") {
    status =
      "Notifikasi diblokir untuk aplikasi ini. Izinkan notifikasi di pengaturan peramban atau perangkat, lalu coba lagi.";
    action = (
      <Button type="button" size="sm" onClick={onEnable} disabled={busy}>
        Coba lagi
      </Button>
    );
  } else {
    status = "Terima pengumuman perubahan langsung di perangkat ini, walau aplikasi tertutup.";
    action = (
      <Button type="button" size="sm" onClick={onEnable} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Bell aria-hidden="true" />}
        Aktifkan notifikasi
      </Button>
    );
  }

  return (
    <section
      aria-label="Notifikasi perangkat ini"
      className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-3.5 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0 text-[13px] leading-relaxed text-muted-foreground">
        <p>{status}</p>
        {message && (
          <p role="alert" className="mt-1.5 font-medium text-destructive">
            {message}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </section>
  );
}

function AnnouncementComposer({
  pushEnabled,
  onSent,
}: {
  pushEnabled: boolean;
  onSent: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const titleLength = [...title.trim()].length;
  const bodyLength = [...body.trim()].length;
  const valid =
    titleLength > 0 &&
    titleLength <= ANNOUNCEMENT_TITLE_MAX &&
    bodyLength > 0 &&
    bodyLength <= ANNOUNCEMENT_BODY_MAX;

  async function send() {
    if (!valid || sending) return;
    setSending(true);
    setError(null);
    setResult(null);
    try {
      let response = await pushApi.createAnnouncement({ title, body });
      const total = { sent: 0, failed: 0, removed: 0 };
      for (let round = 0; ; round++) {
        total.sent += response.delivery.sent;
        total.failed += response.delivery.failed;
        total.removed += response.delivery.removed;
        const next = response.delivery.nextAfter;
        if (!next || round >= MAX_SEND_ROUNDS) break;
        response = await pushApi.continueAnnouncement(response.announcement.id, next);
      }
      setResult(
        pushEnabled
          ? [
              `Pengumuman terkirim ke ${total.sent} perangkat.`,
              total.failed > 0 ? `${total.failed} perangkat gagal (coba kirim ulang nanti).` : null,
              total.removed > 0 ? `${total.removed} perangkat lama dihapus.` : null,
            ]
              .filter(Boolean)
              .join(" ")
          : "Pengumuman tersimpan dan tampil di aplikasi. Notifikasi push belum diaktifkan di server.",
      );
      setTitle("");
      setBody("");
      setExpanded(false);
      onSent();
    } catch (sendError) {
      setError(errorMessage(sendError, "Pengumuman gagal dikirim. Coba lagi."));
    } finally {
      setSending(false);
    }
  }

  return (
    <section aria-label="Kirim pengumuman" className="flex flex-col gap-3">
      {!expanded ? (
        <Button type="button" variant="outline" className="w-full" onClick={() => setExpanded(true)}>
          <Megaphone aria-hidden="true" />
          Tulis pengumuman
        </Button>
      ) : (
        <form
          className="flex flex-col gap-3 rounded-xl border p-3.5"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor="pengumuman-judul">
            Judul
            <Input
              id="pengumuman-judul"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={ANNOUNCEMENT_TITLE_MAX + 20}
              placeholder="Mis. Pembaruan perhitungan SWDKLLJ"
              aria-invalid={titleLength > ANNOUNCEMENT_TITLE_MAX || undefined}
              aria-describedby="pengumuman-judul-ket"
            />
            <span
              id="pengumuman-judul-ket"
              className={cn(
                "numeric self-end text-xs font-normal text-muted-foreground",
                titleLength > ANNOUNCEMENT_TITLE_MAX && "text-destructive",
              )}
            >
              {titleLength}/{ANNOUNCEMENT_TITLE_MAX}
            </span>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor="pengumuman-isi">
            Isi
            <textarea
              id="pengumuman-isi"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={4}
              placeholder="Jelaskan perubahan dan apa yang perlu diperhatikan petugas."
              aria-invalid={bodyLength > ANNOUNCEMENT_BODY_MAX || undefined}
              aria-describedby="pengumuman-isi-ket"
              className="min-h-24 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm font-normal shadow-xs placeholder:text-muted-foreground/80 hover:border-navy-600/50 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 aria-invalid:border-destructive"
            />
            <span
              id="pengumuman-isi-ket"
              className={cn(
                "numeric self-end text-xs font-normal text-muted-foreground",
                bodyLength > ANNOUNCEMENT_BODY_MAX && "text-destructive",
              )}
            >
              {bodyLength}/{ANNOUNCEMENT_BODY_MAX}
            </span>
          </label>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Dikirim ke semua perangkat user aktif yang mengaktifkan notifikasi dan tersimpan di
            riwayat. Jangan menulis data wajib pajak atau kendaraan.
          </p>
          {error && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setExpanded(false)} disabled={sending}>
              Batal
            </Button>
            <Button type="submit" disabled={!valid || sending}>
              {sending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
              Kirim pengumuman
            </Button>
          </div>
        </form>
      )}
      {result && (
        <p role="status" className="rounded-lg bg-success/10 px-3 py-2 text-sm text-foreground">
          {result}
        </p>
      )}
    </section>
  );
}

function AnnouncementList({
  announcements,
  error,
  canDelete,
  onDeleted,
}: {
  announcements: Announcement[] | null;
  error: string | null;
  /** Admin: setiap pengumuman punya tombol hapus. */
  canDelete: boolean;
  onDeleted: (id: string) => void;
}) {
  if (error && !announcements) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
    );
  }
  if (!announcements) {
    return <p className="text-sm text-muted-foreground">Memuat pengumuman…</p>;
  }
  if (announcements.length === 0) {
    return <p className="text-sm text-muted-foreground">Belum ada pengumuman.</p>;
  }
  return (
    <ol aria-label="Riwayat pengumuman" className="flex flex-col divide-y divide-border/70">
      {announcements.map((item) => (
        <AnnouncementItem key={item.id} item={item} canDelete={canDelete} onDeleted={onDeleted} />
      ))}
    </ol>
  );
}

function AnnouncementItem({
  item,
  canDelete,
  onDeleted,
}: {
  item: Announcement;
  canDelete: boolean;
  onDeleted: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const focusAfterToggle = useRef(false);

  // Fokus keyboard mengikuti tombol yang muncul setelah konfirmasi dibuka/ditutup.
  useEffect(() => {
    if (!focusAfterToggle.current) return;
    focusAfterToggle.current = false;
    (confirming ? cancelRef : deleteRef).current?.focus();
  }, [confirming]);

  function toggleConfirm(next: boolean) {
    focusAfterToggle.current = true;
    setError(null);
    setConfirming(next);
  }

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      await pushApi.deleteAnnouncement(item.id);
      onDeleted(item.id);
    } catch (deleteError) {
      // Sudah dihapus dari perangkat lain: hasil akhirnya sama.
      if (isApiError(deleteError) && deleteError.status === 404) {
        onDeleted(item.id);
        return;
      }
      setError(errorMessage(deleteError, "Pengumuman gagal dihapus. Coba lagi."));
      setDeleting(false);
    }
  }

  return (
    <li className="py-3 first:pt-0 last:pb-0" aria-busy={deleting || undefined}>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-sm font-semibold leading-snug text-foreground">{item.title}</p>
        {canDelete && !confirming && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                ref={deleteRef}
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Hapus pengumuman: ${item.title}`}
                onClick={() => toggleConfirm(true)}
                className="-my-2 -mr-2 size-9 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Hapus pengumuman</TooltipContent>
          </Tooltip>
        )}
      </div>
      <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">
        {item.body}
      </p>
      <p className="mt-1.5 text-xs text-muted-foreground/80">
        <time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time> · {item.createdByName}
      </p>
      {confirming && (
        <div
          role="group"
          aria-label="Konfirmasi hapus pengumuman"
          className="mt-2.5 flex flex-col gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3"
        >
          <p className="text-[13px] leading-relaxed text-foreground">
            Hapus pengumuman ini dari lonceng dan modal Info Terbaru semua user? Notifikasi yang
            sudah tampil di perangkat tidak ikut terhapus.
          </p>
          {error && (
            <p role="alert" className="text-[13px] font-medium text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              ref={cancelRef}
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => toggleConfirm(false)}
              disabled={deleting}
            >
              Batal
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => void remove()}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 aria-hidden="true" />
              )}
              {deleting ? "Menghapus…" : "Hapus"}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
