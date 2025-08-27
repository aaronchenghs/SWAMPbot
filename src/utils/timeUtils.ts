import { APP_CONFIG } from '../config';

const TZ = APP_CONFIG.TIMEZONE || 'America/Chicago';

const QUESTION_TIME_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: TZ,
  timeZoneName: 'short',
});

export function formatTime(input: number | string | Date): string {
  const date =
    typeof input === 'number' || typeof input === 'string'
      ? new Date(input)
      : input;
  return QUESTION_TIME_FORMAT.format(date);
}
