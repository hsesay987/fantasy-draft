import { permanentRedirect } from "next/navigation";

/** Topics now live on the Drafts tab. */
export default function TopicsPage() {
  permanentRedirect("/drafts#topics");
}
