import { Settings2 } from "lucide-react";
import { ModulePlaceholder } from "@/components/page-ui";
export default function Page() {
  return (
    <ModulePlaceholder
      title="Tənzimləmələr"
      description="Sistem tənzimləmələri üçün ayrıca backend modulu hazırda mövcud deyil."
      icon={Settings2}
    />
  );
}
