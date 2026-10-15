import ContractDetail from "./contract-detail";

export const metadata = { title: "Chi tiết hợp đồng" };

export default async function ContractDetailPage({ params }: { params: Promise<{ contractId: string }> }) {
  const { contractId } = await params;
  return <ContractDetail contractId={contractId} />;
}
