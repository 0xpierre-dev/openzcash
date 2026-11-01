import { getArchiveDiscussion, archiveDiscussionWrite } from "@/lib/http/archive-discussion";
export const GET = getArchiveDiscussion;
export const POST = archiveDiscussionWrite("post");
