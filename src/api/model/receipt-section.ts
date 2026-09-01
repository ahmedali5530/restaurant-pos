export type ReceiptSectionType = 'text' | 'image'
export type ReceiptSectionAlign = 'left' | 'center' | 'right'
export type ReceiptSectionSize = 'normal' | 'medium' | 'large'

export interface ReceiptSection {
  enabled: boolean
  type: ReceiptSectionType
  align: ReceiptSectionAlign
  size: ReceiptSectionSize
  content: string | ArrayBuffer | null
}

export const emptyReceiptSection = (): ReceiptSection => ({
  enabled: true,
  type: 'text',
  align: 'center',
  size: 'normal',
  content: '',
})
