import { Calculator } from "lucide-react"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

export function ResultEmpty() {
  return (
    <Empty className="min-h-[28rem] border-0 px-6">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Calculator aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>Belum ada penetapan</EmptyTitle>
        <EmptyDescription>
          Lengkapi data kendaraan dan tanggal pembayaran, lalu pilih “Hitung penetapan”.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
