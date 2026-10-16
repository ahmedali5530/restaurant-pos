export interface Document {
  id: string
  name: string
  content?: ArrayBuffer
  path?: string
  size?: number
  /** File's MIME type. Matches the `document` table's `type` field — there
   *  is no `mimeType` column in the schema. */
  type?: string
}