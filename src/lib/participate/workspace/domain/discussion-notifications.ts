export type DiscussionNotificationItem = {
  id: string;
  kind: "COMMENT_LIKED" | "COMMENT_REPLIED";
  actorLabel: string;
  actorAvatarUrl: string | null;
  proposalTitle: string;
  excerpt: string;
  recordId: string;
  commentId: string;
  createdAt: string;
  read: boolean;
};

export type DiscussionInbox = {
  items: DiscussionNotificationItem[];
  unreadCount: number;
  nextCursor: string | null;
  asOf: string;
};

export type CommentDestination = { communityId: string; recordId: string; commentId: string };
export const OPEN_COMMENT_EVENT = "participate:open-comment";
