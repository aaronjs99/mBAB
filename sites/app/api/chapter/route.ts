import { handleChapterRequest } from "@/app/search/chapter-handler";

export const runtime = "edge";
export const GET = (request: Request) => handleChapterRequest(request);
