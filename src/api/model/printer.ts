import { ID, Name, Priority } from "@/api/model/common.ts";
import {DateTime} from "surrealdb";

export interface Printer extends ID, Name, Priority{
  ip_address: string
  port: number
  /** @deprecated Use global print_options.copies instead */
  prints?: number
  type: string

  deleted_at?: DateTime
  vid?: string
  pid?: string
  /** Optional override of print-type printMode (`text` | `raster`). Empty/null = inherit. */
  print_mode?: string | null
  /** Optional override of paper width in mm (`58` | `80`). Empty/null = inherit. */
  paper_width_mm?: number | null
  /** Wire protocol. Empty/null = ESC/POS. `star-graphic` for TSP100-class printers. */
  command_set?: string | null
}
