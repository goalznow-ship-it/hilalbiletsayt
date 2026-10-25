import { ListChecks } from "lucide-react";
import { ModulePlaceholder } from "@/components/page-ui";

export default function Page() {
  return (
    <ModulePlaceholder
      title="Nəticələr"
      description="İmtahan nəticələrinin yoxlanılması və yayımlanması."
      icon={ListChecks}
    />
  );
}
