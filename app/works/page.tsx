import EmptyDirectoryPage from "../components/EmptyDirectoryPage";
import { isLocalTestMode } from "@/lib/local-test-store";

export default function WorksPage() {
  return <EmptyDirectoryPage moduleKey="works" moduleTitle="往期作品" localTestMode={isLocalTestMode()} />;
}
