import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { api } from '../lib/api';
import type { OverviewGroup, Task } from '../types';
import { TaskDrawer } from '../components/TaskDrawer';
import { statusColor } from '../components/ui';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type DayTask = { task: Task; clusterName: string };

export function CalendarPage() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [openTask, setOpenTask] = useState<string | null>(null);

  const { data: groups } = useQuery({
    queryKey: ['overview'],
    queryFn: async () => (await api.get('/tasks/overview')).data.groups as OverviewGroup[],
  });

  // Bucket tasks that have a due date by calendar day (yyyy-MM-dd).
  const byDay = useMemo(() => {
    const map = new Map<string, DayTask[]>();
    (groups ?? []).forEach((g) =>
      g.tasks.forEach((task) => {
        if (!task.dueDate) return;
        const key = format(new Date(task.dueDate), 'yyyy-MM-dd');
        const arr = map.get(key) ?? [];
        arr.push({ task, clusterName: g.cluster.name });
        map.set(key, arr);
      }),
    );
    return map;
  }, [groups]);

  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(month)),
        end: endOfWeek(endOfMonth(month)),
      }),
    [month],
  );

  const today = new Date();

  return (
    <div>
      <div className="group-head" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Calendar</h2>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setMonth((m) => subMonths(m, 1))}>
            ‹
          </button>
          <strong style={{ minWidth: 140, textAlign: 'center' }}>{format(month, 'MMMM yyyy')}</strong>
          <button className="btn btn-ghost" onClick={() => setMonth((m) => addMonths(m, 1))}>
            ›
          </button>
          <button className="btn btn-ghost" onClick={() => setMonth(startOfMonth(new Date()))}>
            Today
          </button>
        </div>
      </div>

      <div className="cal-grid cal-head">
        {WEEKDAYS.map((d) => (
          <div key={d} className="cal-weekday">
            {d}
          </div>
        ))}
      </div>
      <div className="cal-grid">
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const items = byDay.get(key) ?? [];
          const muted = !isSameMonth(day, month);
          return (
            <div key={key} className={`cal-cell ${muted ? 'cal-muted' : ''}`}>
              <div className={`cal-date ${isSameDay(day, today) ? 'cal-today' : ''}`}>{format(day, 'd')}</div>
              {items.slice(0, 4).map(({ task, clusterName }) => (
                <button
                  key={task.id}
                  className="cal-task"
                  title={`${task.title} · ${clusterName}`}
                  onClick={() => setOpenTask(task.id)}
                  style={{ borderLeft: `3px solid ${statusColor(task.status)}` }}
                >
                  {task.title}
                </button>
              ))}
              {items.length > 4 && <div className="cal-more">+{items.length - 4} more</div>}
            </div>
          );
        })}
      </div>

      {openTask && <TaskDrawer taskId={openTask} onClose={() => setOpenTask(null)} />}
    </div>
  );
}
