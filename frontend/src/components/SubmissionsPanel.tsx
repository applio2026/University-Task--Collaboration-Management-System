import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import axios from 'axios';
import { api } from '../lib/api';
import { Avatar } from './ui';

interface Grade {
  score: number;
  maxScore: number;
  feedback?: string | null;
  grader: { id: string; fullName: string };
}
interface Attachment {
  id: string;
  fileName: string;
  sizeBytes: number;
}
interface Submission {
  id: string;
  version: number;
  note?: string | null;
  links: string[];
  status: string;
  createdAt: string;
  student: { id: string; fullName: string; avatarColor: string };
  attachments: Attachment[];
  grade?: Grade | null;
}

async function downloadAttachment(att: Attachment) {
  const res = await api.get(`/attachments/${att.id}/download`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = att.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function GradeBadge({ grade }: { grade?: Grade | null }) {
  if (!grade) return <span className="chip" style={{ color: 'var(--text-faint)' }}>Ungraded</span>;
  return (
    <span className="chip" style={{ color: 'var(--s-completed)' }}>
      {grade.score}/{grade.maxScore}
    </span>
  );
}

function GradeForm({ taskId, submission }: { taskId: string; submission: Submission }) {
  const qc = useQueryClient();
  const [score, setScore] = useState(submission.grade?.score?.toString() ?? '');
  const [maxScore, setMaxScore] = useState(submission.grade?.maxScore?.toString() ?? '100');
  const [feedback, setFeedback] = useState(submission.grade?.feedback ?? '');
  const [open, setOpen] = useState(false);

  const grade = useMutation({
    mutationFn: async () =>
      api.post(`/submissions/${submission.id}/grade`, {
        score: Number(score),
        maxScore: Number(maxScore),
        feedback: feedback.trim() || undefined,
      }),
    onSuccess: () => {
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['submissions', taskId] });
    },
  });

  if (!open) {
    return (
      <button className="btn btn-ghost" style={{ fontSize: 12, padding: '2px 8px' }} onClick={() => setOpen(true)}>
        {submission.grade ? 'Edit grade' : 'Grade'}
      </button>
    );
  }

  return (
    <div style={{ marginTop: 8, padding: 8, border: '1px solid var(--border)', borderRadius: 8 }}>
      <div className="field-row">
        <div className="field" style={{ marginBottom: 8 }}>
          <label>Score</label>
          <input className="input" type="number" value={score} onChange={(e) => setScore(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 8 }}>
          <label>Out of</label>
          <input className="input" type="number" value={maxScore} onChange={(e) => setMaxScore(e.target.value)} />
        </div>
      </div>
      <div className="field" style={{ marginBottom: 8 }}>
        <label>Feedback</label>
        <textarea className="input" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
        <button className="btn btn-ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={score === '' || grade.isPending} onClick={() => grade.mutate()}>
          {grade.isPending ? 'Saving…' : 'Save grade'}
        </button>
      </div>
    </div>
  );
}

function SubmissionCard({ taskId, s, canGrade }: { taskId: string; s: Submission; canGrade: boolean }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        {canGrade && <Avatar user={s.student} size={22} />}
        <strong style={{ fontSize: 13 }}>{canGrade ? s.student.fullName : `Version ${s.version}`}</strong>
        {canGrade && <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>v{s.version}</span>}
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
          {formatDistanceToNow(new Date(s.createdAt), { addSuffix: true })}
        </span>
        <span style={{ marginLeft: 'auto' }}>
          <GradeBadge grade={s.grade} />
        </span>
      </div>
      {s.note && <div style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>{s.note}</div>}
      {s.links.length > 0 && (
        <ul style={{ margin: '6px 0', paddingLeft: 18, fontSize: 12 }}>
          {s.links.map((l) => (
            <li key={l}>
              <a href={l} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
                {l}
              </a>
            </li>
          ))}
        </ul>
      )}
      {s.attachments.map((att) => (
        <button
          key={att.id}
          className="task-name-btn"
          onClick={() => downloadAttachment(att)}
          style={{ display: 'block', fontSize: 12, marginTop: 2 }}
        >
          📎 {att.fileName}
        </button>
      ))}
      {s.grade?.feedback && (
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>
          <strong>Feedback:</strong> {s.grade.feedback}
        </div>
      )}
      {canGrade && <GradeForm taskId={taskId} submission={s} />}
    </div>
  );
}

export function SubmissionsPanel({ taskId }: { taskId: string }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState('');
  const [links, setLinks] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [showForm, setShowForm] = useState(false);

  const { data } = useQuery({
    queryKey: ['submissions', taskId],
    queryFn: async () => {
      const res = await api.get(`/tasks/${taskId}/submissions`);
      return res.data as { submissions: Submission[]; canGrade: boolean };
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      if (note.trim()) fd.append('note', note.trim());
      if (links.trim()) fd.append('links', links.trim());
      files.forEach((f) => fd.append('files', f));
      await api.post(`/tasks/${taskId}/submissions`, fd);
    },
    onSuccess: () => {
      setNote('');
      setLinks('');
      setFiles([]);
      setShowForm(false);
      if (fileRef.current) fileRef.current.value = '';
      qc.invalidateQueries({ queryKey: ['submissions', taskId] });
    },
  });

  const canGrade = data?.canGrade ?? false;
  const submissions = data?.submissions ?? [];

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase' }}>
          Submissions {submissions.length ? `(${submissions.length})` : ''}
        </div>
        {!canGrade && (
          <button
            className="btn btn-ghost"
            style={{ fontSize: 12, padding: '2px 8px' }}
            onClick={() => setShowForm((s) => !s)}
          >
            {showForm ? 'Cancel' : '＋ Submit work'}
          </button>
        )}
      </div>

      {!canGrade && showForm && (
        <div style={{ padding: 10, border: '1px solid var(--border)', borderRadius: 8, marginBottom: 10 }}>
          <div className="field" style={{ marginBottom: 8 }}>
            <label>Note</label>
            <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Describe your submission…" />
          </div>
          <div className="field" style={{ marginBottom: 8 }}>
            <label>Links (one per line)</label>
            <textarea className="input" value={links} onChange={(e) => setLinks(e.target.value)} placeholder="https://github.com/…" />
          </div>
          <div className="field" style={{ marginBottom: 8 }}>
            <label>Files</label>
            <input ref={fileRef} className="input" type="file" multiple accept=".jpg,.jpeg,.png,.gif,.webp,.bmp,.pdf,.txt,image/jpeg,image/png,image/gif,image/webp,image/bmp,application/pdf,text/plain" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              className="btn btn-primary"
              disabled={submit.isPending || (!note.trim() && !links.trim() && files.length === 0)}
              onClick={() => submit.mutate()}
            >
              {submit.isPending ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        </div>
      )}

      {submissions.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
          {canGrade ? 'No submissions yet.' : 'You have not submitted yet.'}
        </div>
      )}
      {submissions.map((s) => (
        <SubmissionCard key={s.id} taskId={taskId} s={s} canGrade={canGrade} />
      ))}
    </div>
  );
}
