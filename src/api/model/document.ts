export interface Document {
  id: string
  name: string
  content?: ArrayBuffer
  path?: string
  size?: number
  mimeType?: string
}