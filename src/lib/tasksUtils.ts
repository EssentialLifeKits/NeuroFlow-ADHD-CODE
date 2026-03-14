import { type Task } from './db';

const NF_BLUE = '#4A90E2';

export type ADHDCategory = 'task' | 'appointment' | 'selfcare' | 'routine' | 'deadline';

export const ADHD_CATEGORIES: Record<ADHDCategory, { label: string; color: string; emoji: string }> = {
  task: { label: 'Task', color: '#FEDA75', emoji: '✅' },
  appointment: { label: 'Appointment', color: '#34D399', emoji: '📅' },
  selfcare: { label: 'Self-Care', color: '#F87171', emoji: '💆' },
  routine: { label: 'Routine', color: NF_BLUE, emoji: '🔄' },
  deadline: { label: 'Deadline', color: '#FB923C', emoji: '⏰' },
};

export function getCategoryConf(task: Task) {
  const cat = task.chore_category?.toLowerCase() ?? '';
  if (cat === 'appointment') return ADHD_CATEGORIES.appointment;
  if (cat === 'selfcare' || cat === 'self-care') return ADHD_CATEGORIES.selfcare;
  if (cat === 'routine') return ADHD_CATEGORIES.routine;
  if (cat === 'deadline') return ADHD_CATEGORIES.deadline;
  return ADHD_CATEGORIES.task;
}

export function getCategoryColor(task: Task): string {
  return getCategoryConf(task).color;
}

export function formatTime12(t: string): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

export function displayTo24(ts: string): string {
  if (!ts) return '00:00';
  const match = ts.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return '09:00';
  let h = parseInt(match[1], 10);
  if (match[3].toUpperCase() === 'PM' && h !== 12) h += 12;
  if (match[3].toUpperCase() === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${match[2]}`;
}

export const BEST_TIMES = [
  { display: '9:00 AM', engagement: '+34%', desc: 'Morning peak focus' },
  { display: '12:30 PM', engagement: '+28%', desc: 'Midday momentum' },
  { display: '7:00 PM', engagement: '+22%', desc: 'Evening wind-down' },
] as const;
