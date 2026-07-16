import { ActivityLibraryManager } from "@/components/admin/activity-library-manager";
import { listActivityItems, listActivityTags, listActivityTopics } from "@/lib/activity-item-library";

export default function ActivityLibraryPage() {
  return <ActivityLibraryManager
    initialItems={listActivityItems()}
    initialTopics={listActivityTopics()}
    initialTags={listActivityTags()}
  />;
}
