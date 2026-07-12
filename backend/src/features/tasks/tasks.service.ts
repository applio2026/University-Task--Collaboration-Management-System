import { Prisma, TaskPriority, TaskStatus, TaskType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../lib/errors';

const taskInclude = {
  assignees: { include: { user: { select: { id: true, fullName: true, avatarColor: true } } } },
  labels: { include: { label: true } },
  subtasks: {
    orderBy: { orderIndex: 'asc' as const },
    include: { assignee: { select: { id: true, fullName: true, avatarColor: true } } },
  },
  checklist: { orderBy: { orderIndex: 'asc' as const } },
  _count: { select: { comments: true, attachments: true, subtasks: true } },
  createdBy: { select: { id: true, fullName: true, avatarColor: true } },
} satisfies Prisma.TaskInclude;

async function logActivity(taskId: string, actorId: string, action: string, meta?: Prisma.InputJsonValue) {
  await prisma.activityLog.create({ data: { taskId, actorId, action, meta } });
}

// ── Recurrence ────────────────────────────────────────────
function advanceDate(date: Date, rule: string): Date {
  const d = new Date(date);
  if (rule === 'DAILY') d.setDate(d.getDate() + 1);
  else if (rule === 'WEEKLY') d.setDate(d.getDate() + 7);
  else if (rule === 'MONTHLY') d.setMonth(d.getMonth() + 1);
  return d;
}

/** Clones a completed recurring task into its next occurrence (dates advanced). */
async function spawnNextOccurrence(taskId: string, rule: string, actorId: string) {
  const t = await prisma.task.findUnique({
    where: { id: taskId },
    include: { assignees: true, subtasks: true, checklist: true },
  });
  if (!t) return;
  const nextDue = advanceDate(t.dueDate ?? new Date(), rule);
  const next = await prisma.task.create({
    data: {
      clusterId: t.clusterId,
      createdById: t.createdById,
      title: t.title,
      description: t.description,
      type: t.type,
      priority: t.priority,
      status: TaskStatus.OPEN,
      startDate: t.startDate ? advanceDate(t.startDate, rule) : undefined,
      dueDate: nextDue,
      estimatedMins: t.estimatedMins,
      recurrenceRule: rule,
      assignees: t.assignees.length ? { create: t.assignees.map((a) => ({ userId: a.userId })) } : undefined,
      subtasks: t.subtasks.length
        ? { create: t.subtasks.map((s, orderIndex) => ({ title: s.title, orderIndex, assigneeId: s.assigneeId })) }
        : undefined,
      checklist: t.checklist.length
        ? { create: t.checklist.map((c, orderIndex) => ({ text: c.text, orderIndex })) }
        : undefined,
    },
  });
  await logActivity(next.id, actorId, 'TASK_CREATED', { recurredFrom: taskId });
}

export async function listTasks(
  clusterId: string,
  filters: { status?: TaskStatus; priority?: TaskPriority; assigneeId?: string; search?: string },
) {
  const where: Prisma.TaskWhereInput = { clusterId, isArchived: false };
  if (filters.status) where.status = filters.status;
  if (filters.priority) where.priority = filters.priority;
  if (filters.assigneeId) where.assignees = { some: { userId: filters.assigneeId } };
  if (filters.search) where.title = { contains: filters.search, mode: 'insensitive' };

  return prisma.task.findMany({
    where,
    include: taskInclude,
    orderBy: [{ status: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
  });
}

/** Grouped view for the Overview page: for the given user, every accessible
 *  cluster with its tasks, grouped under its space. */
export async function overviewForUser(userId: string, systemRole: string) {
  const clusterWhere: Prisma.ClusterWhereInput =
    systemRole === 'SUPER_ADMIN'
      ? { isArchived: false }
      : {
          isArchived: false,
          OR: [
            { memberships: { some: { userId } } },
            { space: { memberships: { some: { userId, role: 'SPACE_ADMIN' } } } },
          ],
        };

  const clusters = await prisma.cluster.findMany({
    where: clusterWhere,
    include: {
      space: { select: { id: true, name: true, color: true } },
      tasks: {
        where: { isArchived: false },
        include: taskInclude,
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return clusters.map((c) => ({
    cluster: { id: c.id, name: c.name, color: c.color, kind: c.kind },
    space: c.space,
    tasks: c.tasks,
  }));
}

export async function getTask(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      ...taskInclude,
      watchers: { select: { userId: true } },
      attachments: true,
      dependenciesFrom: true,
      dependenciesTo: true,
    },
  });
  if (!task) throw notFound('Task not found');
  return task;
}

export async function createTask(input: {
  clusterId: string;
  createdById: string;
  title: string;
  description?: string;
  type?: TaskType;
  priority?: TaskPriority;
  status?: TaskStatus;
  startDate?: string;
  dueDate?: string;
  estimatedMins?: number;
  assigneeIds?: string[];
  subtasks?: string[];
  checklist?: string[];
  recurrenceRule?: string;
}) {
  const subtasks = (input.subtasks ?? []).map((t) => t.trim()).filter(Boolean);
  const checklist = (input.checklist ?? []).map((t) => t.trim()).filter(Boolean);
  const task = await prisma.task.create({
    data: {
      clusterId: input.clusterId,
      createdById: input.createdById,
      title: input.title,
      description: input.description,
      type: input.type ?? TaskType.GENERIC,
      priority: input.priority ?? TaskPriority.MEDIUM,
      status: input.status ?? TaskStatus.OPEN,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      estimatedMins: input.estimatedMins,
      recurrenceRule: input.recurrenceRule,
      assignees: input.assigneeIds?.length
        ? { create: input.assigneeIds.map((userId) => ({ userId })) }
        : undefined,
      subtasks: subtasks.length
        ? { create: subtasks.map((title, orderIndex) => ({ title, orderIndex })) }
        : undefined,
      checklist: checklist.length
        ? { create: checklist.map((text, orderIndex) => ({ text, orderIndex })) }
        : undefined,
    },
    include: taskInclude,
  });
  await logActivity(task.id, input.createdById, 'TASK_CREATED');
  return task;
}

export async function updateTask(
  taskId: string,
  actorId: string,
  data: {
    title?: string;
    description?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    startDate?: string | null;
    dueDate?: string | null;
    estimatedMins?: number | null;
  },
) {
  const existing = await prisma.task.findUnique({
    where: { id: taskId },
    include: { subtasks: { select: { status: true } }, assignees: { select: { status: true } } },
  });
  if (!existing) throw notFound('Task not found');

  // Guard: a task in progress can't move to another status until every subtask
  // is closed (completed).
  if (data.status && data.status !== existing.status && existing.status === 'IN_PROGRESS') {
    const open = existing.subtasks.filter((s) => s.status !== 'COMPLETED').length;
    if (open > 0) {
      throw badRequest(`Complete all ${open} subtask(s) before moving this task out of "In Progress".`);
    }
  }

  // Guard: the parent task can only be marked COMPLETED once every assignee has
  // finished their own part.
  if (
    data.status === TaskStatus.COMPLETED &&
    existing.status !== TaskStatus.COMPLETED &&
    existing.assignees.length > 0
  ) {
    const pending = existing.assignees.filter((a) => a.status !== TaskStatus.COMPLETED).length;
    if (pending > 0) {
      throw badRequest(
        `Cannot close this task yet — ${pending} of ${existing.assignees.length} assignee(s) haven't completed their part.`,
      );
    }
  }

  const patch: Prisma.TaskUpdateInput = { ...data } as Prisma.TaskUpdateInput;
  if (data.startDate !== undefined) patch.startDate = data.startDate ? new Date(data.startDate) : null;
  if (data.dueDate !== undefined) patch.dueDate = data.dueDate ? new Date(data.dueDate) : null;

  // Build a from→to change list for the task history.
  const changes: { field: string; from: string | null; to: string | null }[] = [];
  const fmt = (v: unknown): string | null => (v instanceof Date ? v.toISOString() : ((v as string | null) ?? null));
  for (const field of ['title', 'description', 'priority'] as const) {
    if (data[field] !== undefined && data[field] !== (existing as Record<string, unknown>)[field]) {
      changes.push({ field, from: fmt((existing as Record<string, unknown>)[field]), to: (data[field] as string) ?? null });
    }
  }
  for (const field of ['startDate', 'dueDate'] as const) {
    if (data[field] !== undefined) {
      const from = fmt((existing as Record<string, unknown>)[field]);
      if (from !== (data[field] ?? null)) changes.push({ field, from, to: data[field] ?? null });
    }
  }

  const task = await prisma.task.update({ where: { id: taskId }, data: patch, include: taskInclude });

  if (data.status && data.status !== existing.status) {
    await logActivity(taskId, actorId, 'STATUS_CHANGED', { from: existing.status, to: data.status });
  }
  if (changes.length) await logActivity(taskId, actorId, 'TASK_UPDATED', { changes });

  // Completing a recurring task spawns its next occurrence; the completed
  // instance stops recurring so it can't spawn twice.
  if (data.status === TaskStatus.COMPLETED && existing.status !== TaskStatus.COMPLETED && existing.recurrenceRule) {
    await spawnNextOccurrence(taskId, existing.recurrenceRule, actorId);
    await prisma.task.update({ where: { id: taskId }, data: { recurrenceRule: null } });
  }
  return task;
}

export async function setAssignees(taskId: string, actorId: string, userIds: string[]) {
  // Diff rather than wipe-and-recreate so an existing assignee keeps their
  // individual status (progress isn't reset when the roster is edited).
  const existing = await prisma.taskAssignee.findMany({ where: { taskId }, select: { userId: true } });
  const existingIds = new Set(existing.map((e) => e.userId));
  const nextIds = new Set(userIds);
  const toRemove = [...existingIds].filter((id) => !nextIds.has(id));
  const toAdd = userIds.filter((id) => !existingIds.has(id));

  await prisma.$transaction([
    ...(toRemove.length ? [prisma.taskAssignee.deleteMany({ where: { taskId, userId: { in: toRemove } } })] : []),
    ...(toAdd.length ? [prisma.taskAssignee.createMany({ data: toAdd.map((userId) => ({ taskId, userId })) })] : []),
  ]);
  await logActivity(taskId, actorId, 'ASSIGNEES_UPDATED', { userIds });
  return getTask(taskId);
}

/** A student updates their own progress on a task (or a TA/Faculty updates any). */
export async function setAssigneeStatus(
  taskId: string,
  userId: string,
  actorId: string,
  status: TaskStatus,
) {
  const assignee = await prisma.taskAssignee.findUnique({
    where: { taskId_userId: { taskId, userId } },
  });
  if (!assignee) throw badRequest('That user is not assigned to this task.');

  await prisma.taskAssignee.update({
    where: { taskId_userId: { taskId, userId } },
    data: { status },
  });
  await logActivity(taskId, actorId, 'ASSIGNEE_STATUS_CHANGED', { userId, status });
  return getTask(taskId);
}

export async function archiveTask(taskId: string) {
  await prisma.task.update({ where: { id: taskId }, data: { isArchived: true } });
}

// ── Subtasks ──────────────────────────────────────────────
export async function addSubtask(
  taskId: string,
  actorId: string,
  data: { title: string; assigneeId?: string; dueDate?: string },
) {
  const count = await prisma.subtask.count({ where: { taskId } });
  const subtask = await prisma.subtask.create({
    data: {
      taskId,
      title: data.title,
      assigneeId: data.assigneeId,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      orderIndex: count,
    },
  });
  await logActivity(taskId, actorId, 'SUBTASK_ADDED', { title: data.title });
  return subtask;
}

export async function updateSubtask(
  subtaskId: string,
  actorId: string,
  data: { title?: string; status?: TaskStatus },
) {
  const subtask = await prisma.subtask.update({ where: { id: subtaskId }, data });
  await logActivity(subtask.taskId, actorId, data.status ? 'SUBTASK_STATUS_CHANGED' : 'SUBTASK_UPDATED', {
    title: subtask.title,
    ...(data.status ? { status: data.status } : {}),
  });
  return subtask;
}

export async function deleteSubtask(subtaskId: string) {
  await prisma.subtask.delete({ where: { id: subtaskId } });
}

// ── Checklist ─────────────────────────────────────────────
export async function addChecklistItem(taskId: string, text: string) {
  const count = await prisma.checklistItem.count({ where: { taskId } });
  return prisma.checklistItem.create({ data: { taskId, text, orderIndex: count } });
}

export async function toggleChecklistItem(itemId: string, isChecked: boolean) {
  return prisma.checklistItem.update({ where: { id: itemId }, data: { isChecked } });
}

// ── Comments ──────────────────────────────────────────────
export async function listComments(taskId: string) {
  return prisma.comment.findMany({
    where: { taskId, parentCommentId: null },
    orderBy: { createdAt: 'asc' },
    include: {
      author: { select: { id: true, fullName: true, avatarColor: true } },
      attachments: true,
      replies: {
        orderBy: { createdAt: 'asc' },
        include: { author: { select: { id: true, fullName: true, avatarColor: true } }, attachments: true },
      },
    },
  });
}

export async function addComment(
  taskId: string,
  authorId: string,
  body: string,
  parentCommentId?: string,
  mentions: string[] = [],
) {
  const comment = await prisma.comment.create({
    data: { taskId, authorId, body, parentCommentId, mentions },
    include: { author: { select: { id: true, fullName: true, avatarColor: true } }, attachments: true },
  });
  await logActivity(taskId, authorId, parentCommentId ? 'REPLY_ADDED' : 'COMMENT_ADDED');
  return comment;
}

export async function editComment(commentId: string, authorId: string, body: string) {
  return prisma.comment.update({
    where: { id: commentId },
    data: { body, isEdited: true },
  });
}

export async function deleteComment(commentId: string) {
  return prisma.comment.update({
    where: { id: commentId },
    data: { isDeleted: true, body: '[deleted]' },
  });
}

export async function getActivity(taskId: string) {
  return prisma.activityLog.findMany({
    where: { taskId },
    orderBy: { createdAt: 'desc' },
    include: { actor: { select: { id: true, fullName: true, avatarColor: true } } },
  });
}

export async function getTaskClusterId(taskId: string): Promise<string> {
  const t = await prisma.task.findUnique({ where: { id: taskId }, select: { clusterId: true } });
  if (!t) throw notFound('Task not found');
  return t.clusterId;
}

// ── Attachments ───────────────────────────────────────────
const attachmentInclude = {
  uploader: { select: { id: true, fullName: true, avatarColor: true } },
} satisfies Prisma.AttachmentInclude;

export async function addTaskAttachments(
  taskId: string,
  uploaderId: string,
  files: { fileName: string; storageKey: string; mimeType: string; sizeBytes: number }[],
) {
  await prisma.attachment.createMany({
    data: files.map((f) => ({ ...f, taskId, uploaderId })),
  });
  return prisma.attachment.findMany({
    where: { taskId },
    orderBy: { createdAt: 'desc' },
    include: attachmentInclude,
  });
}

export async function listTaskAttachments(taskId: string) {
  return prisma.attachment.findMany({
    where: { taskId },
    orderBy: { createdAt: 'desc' },
    include: attachmentInclude,
  });
}

export async function getAttachment(attachmentId: string) {
  const att = await prisma.attachment.findUnique({ where: { id: attachmentId } });
  if (!att) throw notFound('Attachment not found');
  return att;
}

export async function deleteAttachment(attachmentId: string) {
  await prisma.attachment.delete({ where: { id: attachmentId } });
}

// ── Dependencies ──────────────────────────────────────────
const depTaskSelect = { id: true, title: true, status: true } satisfies Prisma.TaskSelect;

/** Returns what this task blocks and what blocks it (normalized on BLOCKS). */
export async function getDependencies(taskId: string) {
  const [blocks, blockedBy] = await Promise.all([
    prisma.taskDependency.findMany({
      where: { fromTaskId: taskId, type: 'BLOCKS' },
      include: { toTask: { select: depTaskSelect } },
    }),
    prisma.taskDependency.findMany({
      where: { toTaskId: taskId, type: 'BLOCKS' },
      include: { fromTask: { select: depTaskSelect } },
    }),
  ]);
  return {
    blocks: blocks.map((d) => ({ id: d.id, task: d.toTask })),
    blockedBy: blockedBy.map((d) => ({ id: d.id, task: d.fromTask })),
  };
}

export async function addDependency(taskId: string, relatedTaskId: string, direction: 'blocks' | 'blocked_by') {
  if (taskId === relatedTaskId) throw badRequest('A task cannot depend on itself');

  const related = await prisma.task.findUnique({ where: { id: relatedTaskId }, select: { clusterId: true } });
  if (!related) throw notFound('Related task not found');

  const fromTaskId = direction === 'blocks' ? taskId : relatedTaskId;
  const toTaskId = direction === 'blocks' ? relatedTaskId : taskId;

  // Guard against creating a direct cycle (A blocks B while B blocks A).
  const reverse = await prisma.taskDependency.findFirst({
    where: { fromTaskId: toTaskId, toTaskId: fromTaskId, type: 'BLOCKS' },
  });
  if (reverse) throw badRequest('That would create a circular dependency');

  return prisma.taskDependency.upsert({
    where: { fromTaskId_toTaskId_type: { fromTaskId, toTaskId, type: 'BLOCKS' } },
    update: {},
    create: { fromTaskId, toTaskId, type: 'BLOCKS' },
  });
}

export async function removeDependency(dependencyId: string) {
  await prisma.taskDependency.deleteMany({ where: { id: dependencyId } });
}

// ── Bulk operations ───────────────────────────────────────
export async function getTasksMeta(taskIds: string[]) {
  return prisma.task.findMany({ where: { id: { in: taskIds } }, select: { id: true, clusterId: true } });
}

export async function bulkUpdateTasks(ids: string[], data: Prisma.TaskUpdateManyMutationInput) {
  if (ids.length === 0) return 0;
  const result = await prisma.task.updateMany({ where: { id: { in: ids } }, data });
  return result.count;
}
