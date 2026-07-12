export type SystemRole = 'SUPER_ADMIN' | 'USER';
export type ClusterRole = 'CLUSTER_ADMIN' | 'TEACHING_ASSISTANT' | 'STUDENT';
export type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'REVIEW' | 'COMPLETED' | 'REJECTED' | 'LATE';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface User {
  id: string;
  email: string;
  fullName: string;
  systemRole: SystemRole;
  avatarColor: string;
  universityId: string;
  mustChangePassword?: boolean;
}

export interface MiniUser {
  id: string;
  fullName: string;
  avatarColor: string;
  email?: string;
}

export interface Space {
  id: string;
  name: string;
  color: string;
  description?: string;
  _count?: { clusters: number; memberships: number };
}

export interface Cluster {
  id: string;
  name: string;
  color: string;
  kind: string;
  parentClusterId?: string | null;
  _count?: { tasks: number; memberships: number; childClusters: number };
}

export interface Subtask {
  id: string;
  title: string;
  status: TaskStatus;
  dueDate?: string | null;
  assignee?: MiniUser | null;
}

export interface Task {
  id: string;
  clusterId?: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  type: string;
  startDate?: string | null;
  dueDate?: string | null;
  recurrenceRule?: string | null;
  assignees: { user: MiniUser; status?: TaskStatus }[];
  labels: { label: { id: string; name: string; color: string } }[];
  subtasks: Subtask[];
  checklist?: { id: string; text: string; isChecked: boolean }[];
  _count?: { comments: number; attachments: number; subtasks: number };
  createdBy?: MiniUser;
}

export interface OverviewGroup {
  cluster: { id: string; name: string; color: string; kind: string };
  space: { id: string; name: string; color: string };
  tasks: Task[];
}

export interface Comment {
  id: string;
  body: string;
  createdAt: string;
  isEdited: boolean;
  isDeleted: boolean;
  author: MiniUser;
  replies?: Comment[];
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  author: MiniUser;
}

export interface ChatMessage {
  id: string;
  body: string;
  createdAt: string;
  isDeleted: boolean;
  parentMessageId?: string | null;
  author: MiniUser;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
}
