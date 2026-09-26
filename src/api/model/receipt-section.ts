export type ReceiptSectionType = 'text' | 'image'
export type ReceiptSectionAlign = 'left' | 'center' | 'right'
export type ReceiptSectionSize = 'normal' | 'medium' | 'large'

export const DEFAULT_SECTION_IMAGE_PX = 150

export interface ReceiptSection {
  enabled: boolean
  type: ReceiptSectionType
  align: ReceiptSectionAlign
  size: ReceiptSectionSize
  content: string | ArrayBuffer | null
  /** Image print width in dots/px (image sections only). */
  width?: number
  /** Image print height in dots/px (image sections only). */
  height?: number
}

export const emptyReceiptSection = (): ReceiptSection => ({
  enabled: true,
  type: 'text',
  align: 'center',
  size: 'normal',
  content: '',
  width: DEFAULT_SECTION_IMAGE_PX,
  height: DEFAULT_SECTION_IMAGE_PX,
})
