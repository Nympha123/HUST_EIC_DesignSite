import EmptyDirectoryPage from "../components/EmptyDirectoryPage";
import { isLocalTestMode } from "@/lib/local-test-store";

export default function MaterialsPage() {
  return <EmptyDirectoryPage moduleKey="materials" moduleTitle="素材管理" localTestMode={isLocalTestMode()} />;
}
