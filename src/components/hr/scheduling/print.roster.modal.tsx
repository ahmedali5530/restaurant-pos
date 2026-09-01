import {useTranslation} from 'react-i18next';
import {Modal} from '@/components/common/react-aria/modal.tsx';
import {DateRange} from '@/components/reports/filters/date.range.tsx';
import {Button} from '@/components/common/input/button.tsx';
import {REPORTS_LABOR_SCHEDULE_ROSTER} from '@/routes/posr.ts';
import {formatDateTimeForQuery} from '@/api/reports/shared/filters.ts';
import {toLuxonDateTime} from '@/lib/datetime.ts';
import {recordIdToString} from '@/api/reports/shared/records.ts';
import type {WorkSchedule} from '@/api/model/work_schedule.ts';

export const buildScheduleRosterUrl = (options: {start: string; end: string; scheduleId?: string}) => {
  const params = new URLSearchParams({start: options.start, end: options.end});
  if (options.scheduleId) {
    params.set('schedule', options.scheduleId);
  }
  return `${REPORTS_LABOR_SCHEDULE_ROSTER}?${params.toString()}`;
};

export const openScheduleRoster = (schedule: WorkSchedule) => {
  const start = formatDateTimeForQuery(toLuxonDateTime(schedule.period_start).startOf('day'));
  const end = formatDateTimeForQuery(toLuxonDateTime(schedule.period_end).endOf('day'));
  window.open(
    buildScheduleRosterUrl({
      start,
      end,
      scheduleId: recordIdToString(schedule.id) || String(schedule.id),
    }),
    '_blank',
  );
};

export const PrintRosterModal = ({open, onClose}: {open: boolean; onClose: () => void}) => {
  const {t} = useTranslation('hr');
  const {t: tReports} = useTranslation('reports');

  return (
    <Modal open={open} onClose={onClose} title={t('buttons.printRoster')} size="sm">
      <form
        action={REPORTS_LABOR_SCHEDULE_ROSTER}
        target="_blank"
        className="flex flex-col gap-3 items-start"
        onSubmit={onClose}
      >
        <DateRange isRequired label={tReports('filters.selectRange')} />
        <Button variant="primary" filled type="submit">{tReports('filters.generate')}</Button>
      </form>
    </Modal>
  );
};
