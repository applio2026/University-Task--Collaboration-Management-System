import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

interface ArchivedSpace { id: string; name: string; color: string }
interface ArchivedCluster { id: string; name: string; color: string; kind: string; space: { name: string } }
interface ArchivedTask { id: string; title: string; cluster: { name: string } }
interface ArchiveData {
  spaces: ArchivedSpace[];
  clusters: ArchivedCluster[];
  tasks: ArchivedTask[];
}

export function ArchivePage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['archive'],
    queryFn: async () => (await api.get('/archive')).data as ArchiveData,
  });

  const restore = useMutation({
    mutationFn: async ({ kind, id }: { kind: 'spaces' | 'clusters' | 'tasks'; id: string }) =>
      api.post(`/archive/${kind}/${id}/restore`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['archive'] });
      qc.invalidateQueries({ queryKey: ['spaces'] });
      qc.invalidateQueries({ queryKey: ['overview'] });
    },
  });

  const empty = data && data.spaces.length === 0 && data.clusters.length === 0 && data.tasks.length === 0;

  return (
    <div>
      <div className="group-head" style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>Archive</h2>
      </div>
      <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
        Archived spaces, clusters (e.g. past semesters) and tasks. Restore brings them back into active use.
      </p>

      {isLoading ? (
        <div style={{ display: 'grid', placeItems: 'center', height: 160 }}>
          <div className="spinner" />
        </div>
      ) : empty ? (
        <div style={{ color: 'var(--text-faint)', fontSize: 13 }}>Nothing is archived.</div>
      ) : (
        <>
          <ArchiveSection title="Spaces" count={data!.spaces.length}>
            {data!.spaces.map((s) => (
              <ArchiveRow key={s.id} label={s.name} onRestore={() => restore.mutate({ kind: 'spaces', id: s.id })} pending={restore.isPending} />
            ))}
          </ArchiveSection>

          <ArchiveSection title="Clusters" count={data!.clusters.length}>
            {data!.clusters.map((c) => (
              <ArchiveRow
                key={c.id}
                label={c.name}
                sub={`${c.kind} · ${c.space.name}`}
                onRestore={() => restore.mutate({ kind: 'clusters', id: c.id })}
                pending={restore.isPending}
              />
            ))}
          </ArchiveSection>

          <ArchiveSection title="Tasks" count={data!.tasks.length}>
            {data!.tasks.map((t) => (
              <ArchiveRow
                key={t.id}
                label={t.title}
                sub={t.cluster.name}
                onRestore={() => restore.mutate({ kind: 'tasks', id: t.id })}
                pending={restore.isPending}
              />
            ))}
          </ArchiveSection>
        </>
      )}
    </div>
  );
}

function ArchiveSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <div style={{ marginBottom: 20 }}>
      <div className="group-head" style={{ marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>{title}</h3>
        <span className="chip">{count}</span>
      </div>
      <table className="task-table">
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function ArchiveRow({
  label,
  sub,
  onRestore,
  pending,
}: {
  label: string;
  sub?: string;
  onRestore: () => void;
  pending: boolean;
}) {
  return (
    <tr className="task-row">
      <td style={{ fontWeight: 600 }}>{label}</td>
      <td style={{ color: 'var(--text-muted)' }}>{sub ?? ''}</td>
      <td style={{ width: 100, textAlign: 'right' }}>
        <button className="btn btn-ghost" disabled={pending} onClick={onRestore}>
          ↩ Restore
        </button>
      </td>
    </tr>
  );
}
