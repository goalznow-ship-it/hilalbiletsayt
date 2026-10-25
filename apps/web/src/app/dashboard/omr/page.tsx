import { ScanLine } from "lucide-react";
import { ModulePlaceholder } from "@/components/page-ui";

export default function Page() {
  return (
    <ModulePlaceholder
      title="OMR skan"
      description="Cavab vərəqlərinin skanı və emalı."
      icon={ScanLine}
    />
  );
}
