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
  Send,
  Share,
} from "lucide-react";
import { useAuthenticatedUser } from "@/auth/auth-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDateTime } from "@/lib/format";
import { isApiError } from "@/lib/http";
import {
  currentPushEnvironment,
  detectPushAvailability,
  disablePush,
  enablePush,
  getDeviceSubscription,
  hasUnread,
  pushApi,
  readLastSeen,
  syncPushSubscription,
  writeLastSeen,
  type PushAvailability,
} from "@/lib/push";
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

interface NotificationCenterValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  unread: boolean;
}

const NotificationCenterContext = createContext<NotificationCenterValue | null>(null);

function errorMessage(error: unknown, fallback: string): string {
  return isApiError(error) ? error.message : fallback;
}

/**
 * State pengumuman dan notifikasi perangkat untuk satu sesi aplikasi, serta
 * satu dialog bersama. Tombol lonceng (NotificationBellButton) dapat dipasang
 * di beberapa tempat header tanpa menggandakan state atau dialog.
 */
export function NotificationCenterProvider({ children }: { children: ReactNode }) {
  const user = useAuthenticatedUser();
  const isAdmin = user.role === "admin";
  // Dibuka dari klik notifikasi saat aplikasi belum terbuka: URL ?pengumuman=1.
  const [open, setOpenState] = useState(() =>
    new URL(window.location.href).searchParams.has("pengumuman"),
  );
  const [config, setConfig] = useState<PushConfigResponse | null>(null);
  const [availability] = useState<PushAvailability>(() =>
    detectPushAvailability(currentPushEnvironment()),
  );
  const [permission, setPermission] = useState<NotificationPermission | null>(() =>
    typeof Notification === "undefined" ? null : Notification.permission,
  );
  const [deviceActive, setDeviceActive] = useState(false);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [deviceMessage, setDeviceMessage] = useState<string | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [lastSeen, setLastSeen] = useState<string | null>(() => readLastSeen(user.id));
  const [reloadToken, setReloadToken] = useState(0);
  const lastLoadRef = useRef(0);
  const openRef = useRef(open);

  /** Pengumuman yang tampil saat dialog terbuka dianggap sudah dibaca. */
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
        if (openRef.current) markSeen(list);
      },
      (error: unknown) => {
        if (!cancelled) setListError(errorMessage(error, "Pengumuman gagal dimuat."));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [reloadToken, markSeen]);

  // Muat awal: konfigurasi push dan status notifikasi perangkat ini.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await pushApi.config();
        if (cancelled) return;
        setConfig(loaded);
        if (!loaded.enabled || !loaded.publicKey || availability !== "supported") return;
        const synced = await syncPushSubscription(loaded.publicKey).catch(() => false);
        if (!cancelled) setDeviceActive(synced);
      } catch {
        if (!cancelled) setConfig({ enabled: false, publicKey: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [availability]);

  const setOpen = useCallback(
    (next: boolean) => {
      openRef.current = next;
      setOpenState(next);
      if (next) {
        markSeen(announcements);
        reloadAnnouncements();
      }
    },
    [announcements, markSeen, reloadAnnouncements],
  );

  // Parameter ?pengumuman=1 sudah dipakai untuk membuka dialog: hapus dari URL.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("pengumuman")) return;
    url.searchParams.delete("pengumuman");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, []);

  // Klik notifikasi saat aplikasi sudah terbuka, atau push baru tiba.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const type = (event.data as { type?: unknown } | null)?.type;
      if (type === "kp:buka-pengumuman") setOpen(true);
      else if (type === "kp:pengumuman-baru") reloadAnnouncements();
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [setOpen, reloadAnnouncements]);

  // Aplikasi kembali ke depan (mis. PWA dibuka lagi dari latar): segarkan riwayat.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastLoadRef.current > REFRESH_INTERVAL_MS) {
        reloadAnnouncements();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reloadAnnouncements]);

  const unread = hasUnread(announcements?.[0]?.createdAt, lastSeen);

  async function handleEnable() {
    if (!config?.publicKey) return;
    setDeviceBusy(true);
    setDeviceMessage(null);
    try {
      const result = await enablePush(config.publicKey);
      setPermission(typeof Notification === "undefined" ? null : Notification.permission);
      if (result === "enabled") setDeviceActive(true);
      else if (result === "no-service-worker")
        setDeviceMessage("Aplikasi belum siap menerima notifikasi. Muat ulang halaman, lalu coba lagi.");
    } catch (error) {
      setDeviceMessage(errorMessage(error, "Notifikasi gagal diaktifkan. Coba lagi."));
      setDeviceActive(Boolean(await getDeviceSubscription().catch(() => null)));
    } finally {
      setDeviceBusy(false);
    }
  }

  async function handleDisable() {
    setDeviceBusy(true);
    setDeviceMessage(null);
    try {
      await disablePush();
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

          <AnnouncementList announcements={announcements} error={listError} />
        </DialogContent>
      </Dialog>
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
}: {
  announcements: Announcement[] | null;
  error: string | null;
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
        <li key={item.id} className="py-3 first:pt-0 last:pb-0">
          <p className="text-sm font-semibold leading-snug text-foreground">{item.title}</p>
          <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">
            {item.body}
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground/80">
            <time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time> · {item.createdByName}
          </p>
        </li>
      ))}
    </ol>
  );
}
