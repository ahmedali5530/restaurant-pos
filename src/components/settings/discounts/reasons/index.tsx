import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Tables } from '@/api/db/tables.ts'
import useApi, { SettingsData } from '@/api/db/use.api.ts'
import { DiscountReason } from '@/api/model/discount_reason.ts'
import { TableComponent } from '@/components/common/table/table.tsx'
import { createColumnHelper } from '@tanstack/react-table'
import { Button } from '@/components/common/input/button.tsx'
import { Modal } from '@/components/common/react-aria/modal.tsx'
import { Input } from '@/components/common/input/input.tsx'
import { useDB } from '@/api/db/db.ts'
import { toast } from 'sonner'
import { faPlus } from '@fortawesome/free-solid-svg-icons'

export const DiscountReasonsAdmin = () => {
  const { t } = useTranslation(['admin', 'common'])
  const db = useDB()
  const loadHook = useApi<SettingsData<DiscountReason>>(
    Tables.discount_reasons,
    ['deleted_at = none'],
    ['name asc']
  )
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')

  const columnHelper = createColumnHelper<DiscountReason>()
  const columns = [
    columnHelper.accessor('name', { header: t('columns.name') }),
    columnHelper.accessor('code', { header: t('discountEngine.columns.code') }),
    columnHelper.accessor('is_active', {
      header: t('discountEngine.columns.active'),
      cell: info => info.getValue() ? t('columns.yes') : t('columns.no'),
    }),
    columnHelper.accessor('requires_approval', {
      header: t('discountEngine.columns.requiresApproval'),
      cell: info => info.getValue() ? t('columns.yes') : t('columns.no'),
    }),
  ]

  const createReason = async () => {
    try {
      await db.create(Tables.discount_reasons, {
        name,
        code: code || name.toLowerCase().replace(/\s+/g, '_'),
        is_active: true,
        requires_approval: false,
      })
      setOpen(false)
      setName('')
      setCode('')
      loadHook.fetchData()
      toast.success(t('discountEngine.reasons.created'))
    } catch (e) {
      toast.error(t('discountEngine.errors.createReasonFailed'))
      console.error(e)
    }
  }

  return (
    <>
      <TableComponent
        loaderHook={loadHook}
        columns={columns}
        loaderLineItems={4}
        buttons={[
          <Button key="add" variant="primary" icon={faPlus} onClick={() => setOpen(true)}>
            {t('discountEngine.reasons.add')}
          </Button>,
        ]}
      />
      {open && (
        <Modal title={t('discountEngine.reasons.createTitle')} open onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-3">
            <Input label={t('columns.name')} value={name} onChange={e => setName(e.target.value)} />
            <Input label={t('discountEngine.columns.code')} value={code} onChange={e => setCode(e.target.value)} />
            <Button variant="primary" onClick={createReason}>{t('common:actions.save')}</Button>
          </div>
        </Modal>
      )}
    </>
  )
}
