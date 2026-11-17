import type { Metadata } from "next";
import { BeneficiarySigning } from "@/components/remote-signatures/beneficiary";
export const metadata: Metadata = {
  title: "Semnează documentul | FOM",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function Page() {
  return <BeneficiarySigning />;
}
