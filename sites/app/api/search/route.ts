import { handleSearchRequest } from "@/app/search/search-handler";

export const runtime = "edge";
export const GET = (request: Request) => handleSearchRequest(request);
