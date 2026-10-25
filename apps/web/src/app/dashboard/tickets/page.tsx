import { Ticket } from "lucide-react";
import { ModulePlaceholder } from "@/components/page-ui";

export default function Page() {
  return (
    <ModulePlaceholder
      title="Bilet satışı"
      description="İmtahan biletləri və satış əməliyyatları."
      icon={Ticket}
    />
  );
}
